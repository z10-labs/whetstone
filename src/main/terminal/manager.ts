/**
 * Terminal run transport. Spawns and owns one PTY per terminal-mode run,
 * running the `claude` CLI in the run's working directory. Streams raw bytes
 * to the renderer (xterm.js) and feeds keystrokes back.
 *
 * node-pty is a Node-API module (ABI-stable) so it loads under Electron with no
 * per-runtime rebuild — verified before wiring. The only install fixup is the
 * spawn-helper exec bit (see scripts/fix-native.mjs).
 *
 * It keeps a rolling output buffer per run so that re-attaching (switching back
 * to a run) can replay recent scrollback into a freshly mounted xterm.
 */

import { spawn, type IPty } from 'node-pty';

/** Command that fills a terminal run. A login+interactive shell loads the
 *  user's PATH/rc (so `claude` resolves even under a GUI launch), then hands
 *  the session straight to the CLI. */
const SHELL = process.env.SHELL || '/bin/zsh';
const LAUNCH_ARGS = ['-lic', 'exec claude'];

/** Cap the replay buffer so long sessions don't grow unbounded. */
const BUFFER_LIMIT = 256 * 1024;

interface Session {
  pty: IPty;
  buffer: string;
}

export interface TerminalEmitter {
  onData(runId: string, data: string): void;
  onExit(runId: string, exitCode: number): void;
}

const sessions = new Map<string, Session>();

function appendBuffer(session: Session, data: string): void {
  session.buffer += data;
  if (session.buffer.length > BUFFER_LIMIT) {
    session.buffer = session.buffer.slice(session.buffer.length - BUFFER_LIMIT);
  }
}

/**
 * Attach to a run's terminal. Spawns the PTY on first attach; on a re-attach it
 * replays the buffered scrollback so the remounted xterm shows history.
 */
export function attachTerminal(
  runId: string,
  cwd: string,
  cols: number,
  rows: number,
  emit: TerminalEmitter,
): void {
  const existing = sessions.get(runId);
  if (existing) {
    existing.pty.resize(cols, rows);
    if (existing.buffer) emit.onData(runId, existing.buffer);
    return;
  }

  const pty = spawn(SHELL, LAUNCH_ARGS, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  const session: Session = { pty, buffer: '' };
  sessions.set(runId, session);

  pty.onData((data) => {
    appendBuffer(session, data);
    emit.onData(runId, data);
  });

  pty.onExit(({ exitCode }) => {
    sessions.delete(runId);
    emit.onExit(runId, exitCode);
  });
}

export function writeTerminal(runId: string, data: string): void {
  sessions.get(runId)?.pty.write(data);
}

export function resizeTerminal(runId: string, cols: number, rows: number): void {
  sessions.get(runId)?.pty.resize(cols, rows);
}

export function killTerminal(runId: string): void {
  const session = sessions.get(runId);
  if (!session) return;
  session.pty.kill();
  sessions.delete(runId);
}

/** Kill every PTY (called on app shutdown). */
export function killAllTerminals(): void {
  for (const [runId] of sessions) killTerminal(runId);
}
