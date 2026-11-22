/**
 * Terminal transport. Spawns and owns one PTY per terminal id — a Claude Code
 * terminal run, or a shell/command tab in the dock (see `launch.ts` for how
 * each profile starts). Streams raw bytes to the renderer (xterm.js) and feeds
 * keystrokes back.
 *
 * node-pty is a Node-API module (ABI-stable) so it loads under Electron with no
 * per-runtime rebuild — verified before wiring. The only install fixup is the
 * spawn-helper exec bit (see scripts/fix-native.mjs).
 *
 * Resume (Claude profile only): a terminal run has no session handle of its own, but Claude Code
 * persists every session to `~/.claude/projects/<cwd>/<session_id>.jsonl`. On a
 * fresh spawn we watch for that file (matched by the `cwd` recorded inside it)
 * and report the session id back so it can be stored as the run's externalId.
 * On a later attach with a known id we relaunch `claude --resume <id>`, so the
 * conversation comes back after the app is closed and reopened.
 */

import { spawn, type IPty } from 'node-pty';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import type { TerminalLaunch } from '@shared/terminals';
import { launchArgs } from './launch';

const SHELL = process.env.SHELL || '/bin/zsh';

/** Cap the replay buffer so long sessions don't grow unbounded. */
const BUFFER_LIMIT = 256 * 1024;

/** Session-id capture polling. */
const CAPTURE_INTERVAL_MS = 1200;
const CAPTURE_MAX_TICKS = 150; // ~3 minutes
const HEAD_BYTES = 16 * 1024;

interface Session {
  pty: IPty;
  buffer: string;
}

export interface TerminalEmitter {
  onData(terminalId: string, data: string): void;
  onExit(terminalId: string, exitCode: number): void;
  /** Reports the captured Claude Code session id for a fresh Claude terminal. */
  onSession(terminalId: string, sessionId: string): void;
}

const sessions = new Map<string, Session>();
const captureTimers = new Map<string, NodeJS.Timeout>();
/** Session ids already bound to a run, so concurrent runs in one cwd don't collide. */
const claimedSessionIds = new Set<string>();

function appendBuffer(session: Session, data: string): void {
  session.buffer += data;
  if (session.buffer.length > BUFFER_LIMIT) {
    session.buffer = session.buffer.slice(session.buffer.length - BUFFER_LIMIT);
  }
}

/** Read the first bytes of a file without loading the whole thing. */
function readHead(path: string): string {
  let fd: number | null = null;
  try {
    fd = openSync(path, 'r');
    const buf = Buffer.alloc(HEAD_BYTES);
    const n = readSync(fd, buf, 0, HEAD_BYTES, 0);
    return buf.toString('utf8', 0, n);
  } catch {
    return '';
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

/**
 * Find the Claude Code session id for a run by scanning its project logs for a
 * recently-written `.jsonl` whose recorded `cwd` matches. Returns null until
 * Claude Code has written the file (usually after the first turn).
 */
function findSessionId(cwd: string, sinceMs: number): string | null {
  const root = join(homedir(), '.claude', 'projects');
  const needle = `"cwd":"${cwd}"`;
  let dirs: string[];
  try {
    dirs = readdirSync(root);
  } catch {
    return null;
  }
  for (const dir of dirs) {
    const dirPath = join(root, dir);
    let files: string[];
    try {
      files = readdirSync(dirPath);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const sessionId = file.slice(0, -'.jsonl'.length);
      if (claimedSessionIds.has(sessionId)) continue;
      const full = join(dirPath, file);
      try {
        if (statSync(full).mtimeMs < sinceMs) continue;
      } catch {
        continue;
      }
      if (readHead(full).includes(needle)) return sessionId;
    }
  }
  return null;
}

function stopCapture(id: string): void {
  const timer = captureTimers.get(id);
  if (timer) {
    clearInterval(timer);
    captureTimers.delete(id);
  }
}

function startCapture(id: string, cwd: string, emit: TerminalEmitter): void {
  const since = Date.now() - 3000;
  let ticks = 0;
  const timer = setInterval(() => {
    ticks += 1;
    const sessionId = findSessionId(cwd, since);
    if (sessionId) {
      claimedSessionIds.add(sessionId);
      stopCapture(id);
      emit.onSession(id, sessionId);
    } else if (ticks >= CAPTURE_MAX_TICKS) {
      stopCapture(id);
    }
  }, CAPTURE_INTERVAL_MS);
  captureTimers.set(id, timer);
}

/**
 * Attach to a terminal. Spawns the PTY on first attach — with the given launch
 * profile — and replays buffered scrollback on a re-attach so a remounted
 * xterm shows history.
 */
export function attachTerminal(
  id: string,
  cwd: string,
  cols: number,
  rows: number,
  launch: TerminalLaunch,
  emit: TerminalEmitter,
): void {
  const existing = sessions.get(id);
  if (existing) {
    existing.pty.resize(cols, rows);
    if (existing.buffer) emit.onData(id, existing.buffer);
    return;
  }

  const pty = spawn(SHELL, launchArgs(launch, SHELL), {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  const session: Session = { pty, buffer: '' };
  sessions.set(id, session);

  pty.onData((data) => {
    appendBuffer(session, data);
    emit.onData(id, data);
  });

  pty.onExit(({ exitCode }) => {
    // A PTY killed on purpose was already removed by killTerminal — and the id
    // may belong to a fresh PTY by now (a restarted tab), so stay quiet.
    if (sessions.get(id) !== session) return;
    sessions.delete(id);
    stopCapture(id);
    emit.onExit(id, exitCode);
  });

  if (launch.profile !== 'claude') return;
  if (launch.resume) {
    // Already known — just guard it from being re-captured by another run.
    claimedSessionIds.add(launch.resume);
  } else {
    startCapture(id, cwd, emit);
  }
}

export function isTerminalAlive(id: string): boolean {
  return sessions.has(id);
}

export function writeTerminal(id: string, data: string): void {
  sessions.get(id)?.pty.write(data);
}

export function resizeTerminal(id: string, cols: number, rows: number): void {
  sessions.get(id)?.pty.resize(cols, rows);
}

export function killTerminal(id: string): void {
  stopCapture(id);
  const session = sessions.get(id);
  if (!session) return;
  session.pty.kill();
  sessions.delete(id);
}

/** Kill every PTY (called on app shutdown). */
export function killAllTerminals(): void {
  for (const [id] of sessions) killTerminal(id);
}
