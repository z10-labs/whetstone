/**
 * The dock: shell and command terminals opened beside the work. Held in
 * memory only — a PTY does not outlive the app, so neither does its tab.
 * The registry owns the records; the PTY itself lives in the manager.
 */

import { randomUUID } from 'node:crypto';
import {
  dockTerminalTitle,
  type CreateDockTerminalInput,
  type DockTerminal,
  type TerminalLaunch,
} from '@shared/terminals';

const terminals = new Map<string, DockTerminal>();

export function createDockTerminal(input: CreateDockTerminalInput): DockTerminal {
  const command = input.profile === 'command' ? (input.command?.trim() ?? '') : null;
  if (input.profile === 'command' && !command) {
    throw new Error('A command terminal needs a command.');
  }
  const terminal: DockTerminal = {
    id: `term_${randomUUID()}`,
    sessionId: input.sessionId,
    title: dockTerminalTitle(input),
    cwd: input.cwd,
    profile: input.profile,
    command,
    status: 'running',
    exitCode: null,
    createdAt: Date.now(),
  };
  terminals.set(terminal.id, terminal);
  return terminal;
}

export function getDockTerminal(id: string): DockTerminal | null {
  return terminals.get(id) ?? null;
}

/** Every dock terminal, oldest first. */
export function listDockTerminals(): DockTerminal[] {
  return [...terminals.values()].sort((a, b) => a.createdAt - b.createdAt);
}

export function markDockTerminalExited(id: string, exitCode: number): DockTerminal | null {
  const current = terminals.get(id);
  if (!current) return null;
  const next: DockTerminal = { ...current, status: 'exited', exitCode };
  terminals.set(id, next);
  return next;
}

/** A restarted tab keeps its place and title. */
export function markDockTerminalRunning(id: string): DockTerminal | null {
  const current = terminals.get(id);
  if (!current) return null;
  const next: DockTerminal = { ...current, status: 'running', exitCode: null };
  terminals.set(id, next);
  return next;
}

export function removeDockTerminal(id: string): boolean {
  return terminals.delete(id);
}

export function dockLaunch(terminal: DockTerminal): TerminalLaunch {
  return terminal.profile === 'command'
    ? { profile: 'command', command: terminal.command ?? '' }
    : { profile: 'shell' };
}

/** Test seam: forget every record. */
export function resetDockTerminals(): void {
  terminals.clear();
}
