/**
 * Thin `gh` CLI wrapper. All GitHub facts for Explain PR come through here —
 * Claude never shells out. Failures become readable errors (missing binary,
 * auth, unknown PR) instead of raw spawn dumps.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GhPrListItem, SpecChangeType } from '@shared/explain-pr';

const execFileAsync = promisify(execFile);

const GH_TIMEOUT_MS = 60_000;
const GH_MAX_BUFFER = 24 * 1024 * 1024;

export interface GhPrFile {
  path: string;
  additions: number;
  deletions: number;
  changeType: SpecChangeType;
}

export interface GhPrView {
  number: number;
  title: string;
  body: string;
  url: string;
  state: string;
  author: string;
  base: string;
  head: string;
  commitCount: number;
  additions: number;
  deletions: number;
  files: GhPrFile[];
}

export interface FilePatch {
  path: string;
  hunk: string | null;
  patch: string;
}

interface GhAuthor {
  login?: string;
  name?: string;
}

interface GhFileJson {
  path?: string;
  filename?: string;
  additions?: number;
  deletions?: number;
  changeType?: string;
}

interface GhPrViewJson {
  number?: number;
  title?: string;
  body?: string;
  url?: string;
  state?: string;
  author?: GhAuthor | string;
  baseRefName?: string;
  headRefName?: string;
  commits?: unknown[];
  additions?: number;
  deletions?: number;
  files?: GhFileJson[];
}

interface GhPrListJson {
  number?: number;
  title?: string;
  author?: GhAuthor | string;
  headRefName?: string;
  baseRefName?: string;
  state?: string;
  updatedAt?: string;
}

export function parsePrRef(pr: string): number {
  const trimmed = pr.trim();
  const urlMatch = trimmed.match(/\/pull\/(\d+)/);
  if (urlMatch) return Number(urlMatch[1]);
  const n = Number(trimmed.replace(/^#/, ''));
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Not a pull request number or URL: ${pr}`);
  }
  return n;
}

export async function listOpenPrs(cwd: string): Promise<GhPrListItem[]> {
  const rows = await ghJson<GhPrListJson[]>(cwd, [
    'pr',
    'list',
    '--json',
    'number,title,author,headRefName,baseRefName,state,updatedAt',
    '--limit',
    '30',
  ]);
  return rows.map((row) => ({
    number: row.number ?? 0,
    title: row.title ?? 'Untitled',
    author: authorLogin(row.author),
    headRefName: row.headRefName ?? '',
    baseRefName: row.baseRefName ?? '',
    state: row.state ?? 'OPEN',
    updatedAt: row.updatedAt ?? '',
  }));
}

export async function viewPr(cwd: string, number: number): Promise<GhPrView> {
  const raw = await ghJson<GhPrViewJson>(cwd, [
    'pr',
    'view',
    String(number),
    '--json',
    'number,title,body,url,state,author,baseRefName,headRefName,commits,additions,deletions,files',
  ]);
  return {
    number: raw.number ?? number,
    title: raw.title ?? `PR #${number}`,
    body: raw.body ?? '',
    url: raw.url ?? '',
    state: raw.state ?? 'OPEN',
    author: authorLogin(raw.author),
    base: raw.baseRefName ?? '',
    head: raw.headRefName ?? '',
    commitCount: Array.isArray(raw.commits) ? raw.commits.length : 0,
    additions: raw.additions ?? 0,
    deletions: raw.deletions ?? 0,
    files: (raw.files ?? []).map((file) => ({
      path: file.path ?? file.filename ?? '',
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0,
      changeType: normalizeChangeType(file.changeType, file.additions ?? 0, file.deletions ?? 0),
    })).filter((file) => file.path.length > 0),
  };
}

export async function diffPr(cwd: string, number: number): Promise<string> {
  return ghText(cwd, ['pr', 'diff', String(number)]);
}

/** Split a unified diff into per-file patches keyed by the `b/` path. */
export function splitDiffByFile(diff: string): Map<string, FilePatch> {
  const map = new Map<string, FilePatch>();
  if (!diff.trim()) return map;

  const chunks = diff.split(/^diff --git /m);
  for (const chunk of chunks) {
    const body = chunk.startsWith('a/') || chunk.startsWith('b/') ? `diff --git ${chunk}` : chunk;
    if (!body.includes('diff --git') && !body.includes('+++')) continue;

    const plus = body.match(/^\+\+\+ (?:b\/)?(.+)$/m);
    const minus = body.match(/^--- (?:a\/)?(.+)$/m);
    const gitLine = body.match(/^diff --git a\/(.+?) b\/(.+)$/m);
    let path = plus?.[1] && plus[1] !== '/dev/null' ? plus[1] : minus?.[1];
    if (!path || path === '/dev/null') path = gitLine?.[2] ?? gitLine?.[1];
    if (!path || path === '/dev/null') continue;

    const hunkMatch = body.match(/^@@ .+ @@.*$/m);
    map.set(path, { path, hunk: hunkMatch?.[0] ?? null, patch: body.trimEnd() });
  }
  return map;
}

async function ghJson<T>(cwd: string, args: string[]): Promise<T> {
  const stdout = await ghText(cwd, args);
  try {
    return JSON.parse(stdout) as T;
  } catch {
    throw new Error('gh returned a response that was not JSON.');
  }
}

async function ghText(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('gh', args, {
      cwd,
      timeout: GH_TIMEOUT_MS,
      maxBuffer: GH_MAX_BUFFER,
    });
    return stdout;
  } catch (err) {
    throw formatGhError(err);
  }
}

function formatGhError(err: unknown): Error {
  if (!err || typeof err !== 'object') return new Error('gh failed.');
  const e = err as { code?: string; stderr?: string; message?: string };
  if (e.code === 'ENOENT') {
    return new Error('Install the GitHub CLI (`gh`) and make sure it is on your PATH.');
  }
  const stderr = (e.stderr ?? e.message ?? '').trim();
  if (/not logged|auth/i.test(stderr)) {
    return new Error('GitHub CLI is not authenticated. Run `gh auth login` and try again.');
  }
  if (/could not find|not found|no pull requests/i.test(stderr)) {
    return new Error(stderr || 'Pull request not found in this repository.');
  }
  return new Error(stderr || 'gh failed.');
}

function authorLogin(author: GhAuthor | string | undefined): string {
  if (!author) return '';
  if (typeof author === 'string') return author;
  return author.login ?? author.name ?? '';
}

function normalizeChangeType(
  raw: string | undefined,
  additions: number,
  deletions: number,
): SpecChangeType {
  const value = (raw ?? '').toLowerCase();
  if (value === 'added' || value === 'add') return 'added';
  if (value === 'deleted' || value === 'removed' || value === 'delete') return 'deleted';
  if (value === 'renamed' || value === 'renamed_file') return 'renamed';
  if (additions > 0 && deletions === 0 && value === '') return 'added';
  if (deletions > 0 && additions === 0 && value === '') return 'deleted';
  return 'modified';
}
