/**
 * `gh-pr` binding: one pull request, normalised into checks / review /
 * unresolved threads / merge conflicts so the PR card only has to `$bind`.
 */

import type { Step } from '@shared/cards';
import { EXEC_MAX_BUFFER, EXEC_TIMEOUT_MS, type Adapter, type AdapterContext } from './types';

export interface GhPrState {
  number: number;
  title: string;
  url: string;
  state: string;
  review: 'approved' | 'changes_requested' | 'review_required' | 'none';
  checks: Step[];
  checksPassed: number;
  checksTotal: number;
  checksRunning: number;
  unresolved: number | null;
  conflicts: boolean;
  summary: string;
}

interface CheckRun {
  name?: string;
  status?: string;
  conclusion?: string;
}

interface StatusContext {
  context?: string;
  state?: string;
}

type RollupItem = CheckRun | StatusContext;

interface GhPrJson {
  number?: number;
  title?: string;
  url?: string;
  state?: string;
  reviewDecision?: string;
  mergeable?: string;
  statusCheckRollup?: RollupItem[];
}

/** Map a statusCheckRollup entry (check run or status context) to a Step. */
export function rollupToStep(item: RollupItem): Step {
  // Status contexts expose `context` + `state`; check runs expose `name` + `status`.
  if ('context' in item && !('name' in item)) {
    return statusContextToStep(item as StatusContext);
  }
  if ('name' in item || 'status' in item || 'conclusion' in item) {
    return checkRunToStep(item as CheckRun);
  }
  return statusContextToStep(item as StatusContext);
}

function checkRunToStep(run: CheckRun): Step {
  const name = run.name ?? 'check';
  if (run.status === 'completed') {
    if (run.conclusion === 'success') return { name, status: 'done' };
    if (run.conclusion === 'failure' || run.conclusion === 'timed_out' || run.conclusion === 'cancelled') {
      return { name, status: 'failed', tone: 'err' };
    }
    // skipped / neutral / action_required → pending, dim
    return { name, status: 'pending', detail: run.conclusion ?? undefined, tone: 'dim' };
  }
  if (run.status === 'in_progress' || run.status === 'queued') {
    return { name, status: run.status === 'in_progress' ? 'running' : 'pending' };
  }
  return { name, status: 'pending' };
}

function statusContextToStep(ctx: StatusContext): Step {
  const name = ctx.context ?? 'status';
  const state = (ctx.state ?? '').toLowerCase();
  if (state === 'success') return { name, status: 'done' };
  if (state === 'failure' || state === 'error') return { name, status: 'failed', tone: 'err' };
  if (state === 'pending') return { name, status: 'running' };
  return { name, status: 'pending' };
}

function mapReview(decision?: string): GhPrState['review'] {
  switch (decision) {
    case 'APPROVED':
      return 'approved';
    case 'CHANGES_REQUESTED':
      return 'changes_requested';
    case 'REVIEW_REQUIRED':
      return 'review_required';
    default:
      return 'none';
  }
}

function buildSummary(
  passed: number,
  total: number,
  running: number,
  unresolved: number | null,
): string {
  const parts: string[] = [`${passed}/${total} checks`];
  if (running > 0) parts.push(`${running} running`);
  if (unresolved !== null && unresolved > 0) parts.push(`${unresolved} unresolved`);
  return parts.join(' · ');
}

async function fetchUnresolved(
  repo: string,
  pr: number,
  ctx: AdapterContext,
): Promise<number | null> {
  const [owner, name] = repo.split('/');
  const query =
    `{ repository(owner:"${owner}",name:"${name}"){` +
    ` pullRequest(number:${pr}){ reviewThreads(first:100){ nodes{ isResolved } } } } }`;
  try {
    const out = await ctx.exec('gh', ['api', 'graphql', '-f', `query=${query}`], {
      timeoutMs: EXEC_TIMEOUT_MS,
      maxBuffer: EXEC_MAX_BUFFER,
      signal: ctx.signal,
    });
    const data = JSON.parse(out) as {
      data?: {
        repository?: {
          pullRequest?: { reviewThreads?: { nodes?: { isResolved?: boolean }[] } };
        };
      };
    };
    const nodes = data.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
    return nodes.filter((n) => n.isResolved === false).length;
  } catch {
    // Unresolved count is secondary; never fail the whole tick for it.
    return null;
  }
}

export const ghPrAdapter: Adapter<'gh-pr'> = async (binding, prev, ctx) => {
  const out = await ctx.exec(
    'gh',
    [
      'pr', 'view', String(binding.pr), '--repo', binding.repo, '--json',
      'number,title,url,state,reviewDecision,mergeable,statusCheckRollup',
    ],
    { timeoutMs: EXEC_TIMEOUT_MS, maxBuffer: EXEC_MAX_BUFFER, signal: ctx.signal },
  );
  let pr: GhPrJson;
  try {
    pr = JSON.parse(out) as GhPrJson;
  } catch {
    throw new Error('gh pr view did not return JSON');
  }

  const before = (prev ?? null) as Partial<GhPrState> | null;
  const checks = (pr.statusCheckRollup ?? []).map(rollupToStep);
  const checksPassed = checks.filter((c) => c.status === 'done').length;
  const checksRunning = checks.filter((c) => c.status === 'running').length;
  const checksTotal = checks.length;

  const fetched = await fetchUnresolved(binding.repo, binding.pr, ctx);
  const unresolved =
    fetched !== null ? fetched : (before?.unresolved ?? null);

  const state: GhPrState = {
    number: pr.number ?? binding.pr,
    title: pr.title ?? '',
    url: pr.url ?? '',
    state: pr.state ?? 'unknown',
    review: mapReview(pr.reviewDecision),
    checks,
    checksPassed,
    checksTotal,
    checksRunning,
    unresolved,
    conflicts: pr.mergeable === 'CONFLICTING',
    summary: buildSummary(checksPassed, checksTotal, checksRunning, unresolved),
  };
  return state;
};
