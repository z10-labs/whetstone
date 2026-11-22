/**
 * Read-only client for a local Hippomem server. Mirrors how the `hippomem`
 * CLI finds its server and token ($HIPPOMEM_HOME or ~/.hippomem), so the app
 * sees exactly what the CLI would. Nothing here writes to Hippomem: agents
 * propose decisions through its own MCP tools and hooks.
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import type { HippomemView } from '@shared/hippomem';

const run = promisify(execFile);

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8765;
const REQUEST_TIMEOUT_MS = 4000;
const MAX_QUERY_CHARS = 500;

function hippomemHome(): string {
  return process.env['HIPPOMEM_HOME'] || join(homedir(), '.hippomem');
}

/** The `[server]` host and port from hippomem.toml, as a base URL. */
export function serverUrlFromToml(toml: string): string {
  const section = /^\[server\]\s*$([\s\S]*?)(?=^\[|$(?![\s\S]))/m.exec(toml)?.[1] ?? '';
  const host = /^\s*host\s*=\s*"([^"]+)"/m.exec(section)?.[1] ?? DEFAULT_HOST;
  const port = Number(/^\s*port\s*=\s*(\d+)/m.exec(section)?.[1] ?? DEFAULT_PORT);
  return `http://${host}:${port}`;
}

/** Hippomem's repo name: the last part of the origin URL, minus `.git`. */
export function repoNameFromRemote(remote: string): string | null {
  const last = remote.trim().replace(/\/+$/, '').split(/[/:]/).pop() ?? '';
  const name = last.replace(/\.git$/, '');
  return name || null;
}

/** True when a Claude Code settings file wires in Hippomem's hooks. */
export function settingsUseHippomem(settingsJson: string): boolean {
  try {
    const hooks = (JSON.parse(settingsJson) as { hooks?: unknown }).hooks;
    return JSON.stringify(hooks ?? {}).includes('hippomem');
  } catch {
    return false;
  }
}

async function git(cwd: string, ...args: string[]): Promise<string | null> {
  try {
    const { stdout } = await run('git', args, { cwd, timeout: REQUEST_TIMEOUT_MS });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

interface RepoInfo {
  repo: string;
  hooksInstalled: boolean;
}

async function repoInfo(cwd: string): Promise<RepoInfo> {
  const top = (await git(cwd, 'rev-parse', '--show-toplevel')) ?? cwd;
  const remote = await git(cwd, 'remote', 'get-url', 'origin');
  const repo = (remote && repoNameFromRemote(remote)) || basename(top);
  const settings = await readText(join(top, '.claude', 'settings.local.json'));
  return { repo, hooksInstalled: settings !== null && settingsUseHippomem(settings) };
}

async function connection(): Promise<{ url: string; token: string | null }> {
  const home = hippomemHome();
  const toml = (await readText(join(home, 'hippomem.toml'))) ?? '';
  const url = process.env['HIPPOMEM_URL'] || serverUrlFromToml(toml);
  const token =
    process.env['HIPPOMEM_TOKEN'] || (await readText(join(home, 'token')))?.trim() || null;
  return { url, token };
}

async function call(
  url: string,
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<{ text: string } | { error: string; offline: boolean }> {
  try {
    const res = await fetch(`${url}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await res.json()) as { text?: string; error?: string };
    if (!res.ok) return { error: body.error ?? `HTTP ${res.status}`, offline: false };
    return { text: body.text ?? '' };
  } catch (err) {
    console.warn('[whetstone] hippomem request failed:', err);
    return { error: 'The Hippomem server is not running.', offline: true };
  }
}

async function view(
  cwd: string,
  path: string,
  init?: (repo: string) => RequestInit,
): Promise<HippomemView> {
  const [{ url, token }, info] = await Promise.all([connection(), repoInfo(cwd)]);
  const base = { url, repo: info.repo, hooksInstalled: info.hooksInstalled };
  if (!token) {
    return { ...base, state: 'no-token', text: null, message: 'No Hippomem token on this machine.' };
  }
  const result = await call(url, token, path, init?.(info.repo));
  if ('error' in result) {
    return { ...base, state: result.offline ? 'offline' : 'error', text: null, message: result.error };
  }
  return { ...base, state: 'ok', text: result.text, message: null };
}

/** Decisions in force, as Hippomem renders them. */
export function listDecisions(cwd: string): Promise<HippomemView> {
  return view(cwd, '/api/decisions');
}

/** Search decisions, scoped to the run's repo. */
export function queryDecisions(cwd: string, text: string): Promise<HippomemView> {
  const query = text.trim().slice(0, MAX_QUERY_CHARS);
  if (!query) return listDecisions(cwd);
  return view(cwd, '/api/query', (repo) => ({
    method: 'POST',
    body: JSON.stringify({ text: query, repo, path: '', branch: '' }),
  }));
}
