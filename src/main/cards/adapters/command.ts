/**
 * `command` binding: run a shell command whose stdout is JSON. Commands that
 * match the read-only allow-list (spec §7) start without approval; everything
 * else waits for a per-card human OK.
 */

import { EXEC_MAX_BUFFER, EXEC_TIMEOUT_MS, type Adapter } from './types';

/** Segment heads that are treated as read-only. Multi-word heads must match
 * as a full prefix (`gh run view …`, not `gh run …`). */
const ALLOWED_HEADS = [
  'gh run view',
  'gh run list',
  'gh pr view',
  'gh pr list',
  'gh pr checks',
  'git status',
  'git log',
  'git rev-parse',
  'cat',
  'tail',
  'head',
  'wc',
  'jq',
] as const;

/** Flags that turn `gh api` into a write (body / non-GET method). */
const GH_API_WRITE_FLAGS = new Set(['-f', '-F', '--field', '--raw-field', '--input']);

/**
 * True only when every `|`-separated segment is on the allow-list and the
 * command contains none of the shell operators that would let a "read" do
 * something else. Conservative: when unsure, false.
 */
export function isReadOnlyCommand(command: string): boolean {
  if (/[;<>`\n\r]/.test(command)) return false;
  if (command.includes('&&') || command.includes('||')) return false;
  if (command.includes('$(')) return false;
  // Background `&` (also covers `&&` already rejected above).
  if (command.includes('&')) return false;

  const segments = splitPipes(command);
  return segments !== null && segments.every(isAllowedSegment);
}

/**
 * Split on `|` outside quotes, so `jq '.a | .b'` stays one segment. Returns
 * null for an unterminated quote: when unsure, not read-only.
 */
function splitPipes(command: string): string[] | null {
  const segments: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (const ch of command) {
    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === '|') {
      segments.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (quote) return null;
  segments.push(current);
  return segments;
}

function isAllowedSegment(segment: string): boolean {
  const s = segment.trim();
  if (!s) return false;

  if (/^gh\s+api(?:\s|$)/.test(s)) return isReadOnlyGhApi(s);
  // `git log --output=<file>` writes; `--ext-diff` runs configured programs.
  if (/^git\s/.test(s) && /\s--(output|ext-diff)\b/.test(s)) return false;

  return ALLOWED_HEADS.some((head) => s === head || s.startsWith(head + ' '));
}

function isReadOnlyGhApi(cmd: string): boolean {
  const tokens = cmd.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  // tokens[0]=gh, tokens[1]=api
  for (let i = 2; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (GH_API_WRITE_FLAGS.has(t)) return false;
    // Compact forms: -fKEY=val / -FKEY=val
    if (/^-F./.test(t) || (/^-f./.test(t) && !t.startsWith('--'))) return false;

    if (t === '-X' || t === '--method') {
      const method = (tokens[++i] ?? '').replace(/^['"]|['"]$/g, '');
      if (method.toUpperCase() !== 'GET') return false;
      continue;
    }
    if (t.startsWith('-X') && t.length > 2) {
      if (t.slice(2).toUpperCase() !== 'GET') return false;
      continue;
    }
    if (t.startsWith('--method=')) {
      if (t.slice('--method='.length).toUpperCase() !== 'GET') return false;
    }
  }
  return true;
}

export const commandAdapter: Adapter<'command'> = async (binding, _prev, ctx) => {
  const out = await ctx.shell(binding.command, {
    cwd: binding.cwd ?? ctx.cwd ?? undefined,
    timeoutMs: EXEC_TIMEOUT_MS,
    maxBuffer: EXEC_MAX_BUFFER,
    signal: ctx.signal,
  });
  try {
    return JSON.parse(out) as unknown;
  } catch {
    throw new Error(`command output is not JSON: ${out.slice(0, 80)}`);
  }
};
