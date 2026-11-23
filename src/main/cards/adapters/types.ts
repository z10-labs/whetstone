/**
 * The binding-adapter seam. An adapter turns one binding into a fresh state
 * object for its card. Adapters never touch the database or the renderer —
 * the poller owns that — and they shell out only through the injected `exec`,
 * so every adapter is testable with a fake.
 */

import type { Binding, BindingKind } from '@shared/cards';

export interface ExecOptions {
  cwd?: string;
  timeoutMs: number;
  maxBuffer: number;
  signal?: AbortSignal;
}

/** Run a binary with args (no shell) and resolve its stdout. Rejects on non-zero exit. */
export type ExecFn = (file: string, args: string[], opts: ExecOptions) => Promise<string>;

/** Run a command line through the user's shell. Only the `command` adapter uses it. */
export type ShellFn = (command: string, opts: ExecOptions) => Promise<string>;

/** Read a UTF-8 file. Injected so the `file` adapter is testable. */
export type ReadFileFn = (path: string) => Promise<string>;

export interface AdapterContext {
  /** The origin run's working directory, if the card has one. */
  cwd: string | null;
  exec: ExecFn;
  shell: ShellFn;
  readFile: ReadFileFn;
  signal?: AbortSignal;
  now: () => number;
}

/**
 * Produce the card's next state. `prev` is the last state (null on the first
 * tick) so an adapter can carry slow-changing facts forward instead of
 * refetching them every tick. Throw a readable Error on failure.
 */
export type Adapter<K extends BindingKind = BindingKind> = (
  binding: Extract<Binding, { kind: K }>,
  prev: unknown,
  ctx: AdapterContext,
) => Promise<unknown>;

/** Output limits every adapter shares (spec §7). */
export const EXEC_TIMEOUT_MS = 10_000;
export const EXEC_MAX_BUFFER = 1024 * 1024;
