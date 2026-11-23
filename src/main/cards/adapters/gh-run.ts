/**
 * `gh-run` binding: one GitHub Actions run, normalised into the state the CI
 * card reads. The adapter does the arithmetic an agent would otherwise do in
 * its head — elapsed time, the workflow's usual duration, how far over it is —
 * so the card spec only has to point at fields.
 */

import type { Step, Tone } from '@shared/cards';
import { EXEC_MAX_BUFFER, EXEC_TIMEOUT_MS, type Adapter, type AdapterContext } from './types';

/** How many recent successful runs make up "usual". */
const TYPICAL_SAMPLE = 10;
const LOG_TAIL_LINES = 12;

export interface GhRunState {
  status: string;
  conclusion: string | null;
  workflow: string;
  title: string;
  branch: string;
  sha: string;
  url: string;
  elapsedSec: number;
  /** Median duration of recent successful runs of this workflow; null if none. */
  typicalSec: number | null;
  /** "3.1× usual", or "" when there is nothing to compare against. */
  overrunLabel: string;
  overrunTone: Tone;
  jobs: Step[];
  currentJob: string | null;
  logTail: string[];
}

interface GhJob {
  name?: string;
  status?: string;
  conclusion?: string;
  startedAt?: string;
  completedAt?: string;
}

interface GhRunJson {
  status?: string;
  conclusion?: string;
  workflowName?: string;
  displayTitle?: string;
  headBranch?: string;
  headSha?: string;
  url?: string;
  createdAt?: string;
  startedAt?: string;
  updatedAt?: string;
  jobs?: GhJob[];
}

const ms = (iso?: string): number | null => {
  if (!iso || iso.startsWith('0001')) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/** 274 → "4:34"; 3725 → "1:02:05". */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function jobToStep(job: GhJob, now: number): Step {
  const start = ms(job.startedAt);
  const end = ms(job.completedAt);
  const dur = start ? ((end ?? now) - start) / 1000 : null;
  const detail = dur !== null ? formatDuration(dur) : undefined;
  const name = job.name ?? 'job';
  if (job.status === 'completed') {
    if (job.conclusion === 'success') return { name, status: 'done', detail };
    if (job.conclusion === 'failure' || job.conclusion === 'timed_out') {
      return { name, status: 'failed', detail, tone: 'err' };
    }
    return { name, status: 'pending', detail: job.conclusion ?? undefined, tone: 'dim' };
  }
  if (job.status === 'in_progress') return { name, status: 'running', detail };
  return { name, status: 'pending' };
}

function overrun(elapsedSec: number, typicalSec: number | null): { label: string; tone: Tone } {
  if (!typicalSec) return { label: '', tone: 'dim' };
  const ratio = elapsedSec / typicalSec;
  if (ratio < 1.15) return { label: 'on pace', tone: 'ok' };
  return { label: `${ratio.toFixed(1)}× usual`, tone: ratio >= 2 ? 'warn' : 'dim' };
}

async function fetchTypical(
  repo: string,
  workflow: string,
  ctx: AdapterContext,
): Promise<number | null> {
  try {
    const out = await ctx.exec(
      'gh',
      [
        'run', 'list', '--repo', repo, '--workflow', workflow, '--status', 'success',
        '--limit', String(TYPICAL_SAMPLE), '--json', 'createdAt,updatedAt',
      ],
      { timeoutMs: EXEC_TIMEOUT_MS, maxBuffer: EXEC_MAX_BUFFER, signal: ctx.signal },
    );
    const runs = JSON.parse(out) as { createdAt?: string; updatedAt?: string }[];
    const durations = runs
      .map((r) => {
        const a = ms(r.createdAt);
        const b = ms(r.updatedAt);
        return a && b && b > a ? (b - a) / 1000 : null;
      })
      .filter((d): d is number => d !== null);
    return median(durations);
  } catch {
    // "Usual" is a nicety; a card without it still works.
    return null;
  }
}

async function fetchFailedLog(repo: string, runId: number, ctx: AdapterContext): Promise<string[]> {
  try {
    const out = await ctx.exec('gh', ['run', 'view', String(runId), '--repo', repo, '--log-failed'], {
      timeoutMs: EXEC_TIMEOUT_MS,
      maxBuffer: EXEC_MAX_BUFFER * 8,
      signal: ctx.signal,
    });
    return out
      .split('\n')
      .map((l) => l.replace(/^[^\t]*\t[^\t]*\t/, '').replace(/^\S+Z /, '').trimEnd())
      .filter((l) => l.trim() !== '')
      .slice(-LOG_TAIL_LINES);
  } catch {
    return [];
  }
}

export const ghRunAdapter: Adapter<'gh-run'> = async (binding, prev, ctx) => {
  const out = await ctx.exec(
    'gh',
    [
      'run', 'view', String(binding.runId), '--repo', binding.repo, '--json',
      'status,conclusion,workflowName,displayTitle,headBranch,headSha,url,createdAt,startedAt,updatedAt,jobs',
    ],
    { timeoutMs: EXEC_TIMEOUT_MS, maxBuffer: EXEC_MAX_BUFFER, signal: ctx.signal },
  );
  let run: GhRunJson;
  try {
    run = JSON.parse(out) as GhRunJson;
  } catch {
    throw new Error('gh run view did not return JSON');
  }

  const before = (prev ?? null) as Partial<GhRunState> | null;
  const now = ctx.now();
  const status = run.status ?? 'unknown';
  const done = status === 'completed';
  const start = ms(run.startedAt) ?? ms(run.createdAt) ?? now;
  const end = done ? (ms(run.updatedAt) ?? now) : now;
  const elapsedSec = Math.max(0, Math.round((end - start) / 1000));
  const workflow = run.workflowName ?? 'workflow';

  const typicalSec =
    before && 'typicalSec' in before && before.typicalSec !== undefined
      ? before.typicalSec
      : await fetchTypical(binding.repo, workflow, ctx);

  const jobs = (run.jobs ?? []).map((j) => jobToStep(j, now));
  const current = jobs.find((j) => j.status === 'running') ?? null;
  const failed = done && run.conclusion === 'failure';
  const logTail =
    failed && !(before?.logTail && before.logTail.length > 0)
      ? await fetchFailedLog(binding.repo, binding.runId, ctx)
      : (before?.logTail ?? []);
  const { label, tone } = done
    ? { label: run.conclusion ?? 'completed', tone: (run.conclusion === 'success' ? 'ok' : 'err') as Tone }
    : overrun(elapsedSec, typicalSec);

  const state: GhRunState = {
    status,
    conclusion: run.conclusion || null,
    workflow,
    title: run.displayTitle ?? '',
    branch: run.headBranch ?? '',
    sha: (run.headSha ?? '').slice(0, 7),
    url: run.url ?? '',
    elapsedSec,
    typicalSec,
    overrunLabel: label,
    overrunTone: tone,
    jobs,
    currentJob: current?.name ?? null,
    logTail,
  };
  return state;
};
