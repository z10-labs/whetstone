/**
 * Structured mirroring for terminal runs (Phase 2).
 *
 * Claude Code persists every terminal session to
 * `~/.claude/projects/<cwd>/<session_id>.jsonl` as newline-delimited JSON — the
 * same typed records the SDK streams. We tail that file and map each new line
 * into the run's structured `RunEvent`s, so terminal runs feed the same store
 * (and therefore memory/search) as SDK runs. This is pure deterministic
 * parsing — no model calls.
 *
 * Dedup is by the line's own `uuid`, seeded from what's already persisted, so
 * re-tailing after a resume never double-inserts.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { appendEvent, getRun, listEventSourceUuids, setRunTitle } from '../repo/runs';
import type { AgentRun, RunEvent, RunEventKind } from '@shared/models';

const POLL_MS = 1000;
const DEFAULT_TITLE = 'Terminal';

export interface TailEmitter {
  onEvent(event: RunEvent): void;
  onRunUpdated(run: AgentRun): void;
}

interface TailState {
  path: string;
  offset: number;
  partial: string;
  seen: Set<string>;
  timer: NodeJS.Timeout;
  reading: boolean;
  pending: boolean;
  emit: TailEmitter;
}

interface EventDraft {
  kind: RunEventKind;
  text?: string | null;
  toolName?: string | null;
  data?: unknown;
}

interface Block {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
}

interface JsonlRecord {
  type?: string;
  uuid?: string;
  aiTitle?: string;
  message?: { role?: string; content?: unknown };
}

const tails = new Map<string, TailState>();

function locateSessionFile(sessionId: string): string | null {
  const root = join(homedir(), '.claude', 'projects');
  let dirs: string[];
  try {
    dirs = readdirSync(root);
  } catch {
    return null;
  }
  for (const dir of dirs) {
    const candidate = join(root, dir, `${sessionId}.jsonl`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function readFrom(path: string, offset: number): { chunk: string; next: number } {
  let fd: number | null = null;
  try {
    const size = statSync(path).size;
    if (size <= offset) return { chunk: '', next: offset };
    const length = size - offset;
    const buf = Buffer.alloc(length);
    fd = openSync(path, 'r');
    const read = readSync(fd, buf, 0, length, offset);
    return { chunk: buf.toString('utf8', 0, read), next: offset + read };
  } catch {
    return { chunk: '', next: offset };
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

/** Map one jsonl record into normalized event drafts (deterministic). */
function mapRecord(rec: JsonlRecord): EventDraft[] {
  const content = rec.message?.content;

  if (rec.type === 'user') {
    if (typeof content === 'string') return content.trim() ? [{ kind: 'user', text: content }] : [];
    if (Array.isArray(content)) {
      const out: EventDraft[] = [];
      for (const block of content as Block[]) {
        if (block.type === 'text' && block.text) out.push({ kind: 'user', text: block.text });
        else if (block.type === 'tool_result') {
          out.push({ kind: 'tool_result', data: { id: block.tool_use_id, content: block.content } });
        }
      }
      return out;
    }
    return [];
  }

  if (rec.type === 'assistant' && Array.isArray(content)) {
    const out: EventDraft[] = [];
    for (const block of content as Block[]) {
      if (block.type === 'text' && block.text) out.push({ kind: 'assistant_text', text: block.text });
      else if (block.type === 'thinking' && block.thinking) {
        out.push({ kind: 'assistant_thinking', text: block.thinking });
      } else if (block.type === 'tool_use') {
        out.push({ kind: 'tool_use', toolName: block.name ?? 'tool', data: { id: block.id, input: block.input } });
      }
    }
    return out;
  }

  return [];
}

async function handleLine(runId: string, line: string, state: TailState): Promise<number> {
  let rec: JsonlRecord;
  try {
    rec = JSON.parse(line) as JsonlRecord;
  } catch {
    return 0;
  }

  if (rec.uuid) {
    if (state.seen.has(rec.uuid)) return 0;
    state.seen.add(rec.uuid);
  }

  // Give the run a real title from Claude Code's generated one.
  if (rec.type === 'ai-title' && rec.aiTitle) {
    const run = await getRun(runId);
    if (run && run.title === DEFAULT_TITLE) {
      state.emit.onRunUpdated(await setRunTitle(runId, rec.aiTitle));
    }
    return 0;
  }

  let count = 0;
  for (const draft of mapRecord(rec)) {
    const saved = await appendEvent(runId, { ...draft, sourceUuid: rec.uuid ?? null });
    state.emit.onEvent(saved);
    count += 1;
  }
  return count;
}

async function drain(runId: string): Promise<void> {
  const state = tails.get(runId);
  if (!state) return;
  if (state.reading) {
    state.pending = true;
    return;
  }
  state.reading = true;
  try {
    const { chunk, next } = readFrom(state.path, state.offset);
    state.offset = next;
    if (!chunk) return;

    state.partial += chunk;
    const lines = state.partial.split('\n');
    state.partial = lines.pop() ?? '';

    let persisted = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) persisted += await handleLine(runId, trimmed, state);
    }

    if (persisted > 0) {
      const run = await getRun(runId);
      if (run) state.emit.onRunUpdated(run);
    }
  } finally {
    state.reading = false;
    if (state.pending) {
      state.pending = false;
      void drain(runId);
    }
  }
}

/** Begin mirroring a terminal run's Claude Code session into RunEvents. */
export async function startTail(runId: string, sessionId: string, emit: TailEmitter): Promise<void> {
  if (tails.has(runId)) return;
  const path = locateSessionFile(sessionId);
  if (!path) return;

  const seen = await listEventSourceUuids(runId);
  const timer = setInterval(() => void drain(runId), POLL_MS);
  tails.set(runId, { path, offset: 0, partial: '', seen, timer, reading: false, pending: false, emit });
  void drain(runId);
}

export function stopTail(runId: string): void {
  const state = tails.get(runId);
  if (!state) return;
  clearInterval(state.timer);
  tails.delete(runId);
}

export function stopAllTails(): void {
  for (const [runId] of tails) stopTail(runId);
}
