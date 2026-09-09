/**
 * Compiles a Session's shared brain into a markdown digest that is injected
 * into every run at launch (via the SDK's `systemPrompt.append`). This is what
 * makes an agent *session-aware*: it sees the sibling runs and the curated
 * memory before it acts, so work hands off between runs by construction.
 *
 * v1 injects everything active (§7 of docs/session-memory.md). Budgeting and
 * relevance routing are deferred — the shape here leaves room for both.
 */

import { getSessionWithRuns } from '../repo/sessions';
import { listActiveBySession } from '../repo/session-memory';
import { MEMORY_KINDS, MEMORY_KIND_LABELS, type MemoryKind } from '@shared/session-memory';
import type { SessionMemoryEntry } from '@shared/session-memory';
import type { AgentRun } from '@shared/models';

const PREAMBLE =
  'You are one of several agents working in a shared Whetstone session. The state ' +
  'below is the shared source of truth across every run in this session — read it ' +
  'before acting. When you make a decision, produce an artifact, or hit an open ' +
  'question that another agent would need, record it with the `remember` tool so ' +
  'work can hand off. Use `recall` to pull older detail. Do not repeat an entry ' +
  'that is already listed; supersede it instead if it has changed.';

/** Shorten an absolute path to a readable tail for the digest. */
function tail(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, '~');
}

function rosterLine(run: AgentRun, currentRunId: string | null): string {
  const here = run.id === currentRunId ? '  ← this run' : '';
  return `- ${run.title} · ${run.status} · ${tail(run.cwd)}${here}`;
}

function entryLine(entry: SessionMemoryEntry): string {
  const where = entry.cwd ? ` (${tail(entry.cwd)})` : '';
  const body = entry.body ? ` — ${entry.body}` : '';
  return `- ${entry.title}${body}${where}`;
}

/**
 * Build the digest for a run about to launch. `currentRunId` annotates which
 * roster entry is the launching run. Returns null only if the session is gone.
 */
export async function compileDigest(
  sessionId: string,
  currentRunId: string | null,
): Promise<string | null> {
  const session = await getSessionWithRuns(sessionId);
  if (!session) return null;

  const entries = await listActiveBySession(sessionId);
  const byKind = new Map<MemoryKind, SessionMemoryEntry[]>();
  for (const entry of entries) {
    const list = byKind.get(entry.kind) ?? [];
    list.push(entry);
    byKind.set(entry.kind, list);
  }

  const lines: string[] = [];
  lines.push('# Shared session context', '', PREAMBLE, '');

  lines.push('## Session');
  lines.push(session.description ? `${session.name} — ${session.description}` : session.name);
  lines.push('');

  lines.push(`## Runs in this session (${session.runs.length})`);
  if (session.runs.length === 0) {
    lines.push('- (none yet)');
  } else {
    for (const run of session.runs) lines.push(rosterLine(run, currentRunId));
  }
  lines.push('');

  lines.push('## Shared memory');
  if (entries.length === 0) {
    lines.push("No shared memory recorded yet — you're the first. Start writing it as you learn.");
  } else {
    for (const kind of MEMORY_KINDS) {
      const list = byKind.get(kind);
      if (!list || list.length === 0) continue;
      lines.push(`### ${MEMORY_KIND_LABELS[kind]}`);
      for (const entry of list) lines.push(entryLine(entry));
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd();
}
