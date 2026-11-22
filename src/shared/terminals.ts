/**
 * Terminals — every PTY whetstone owns, whatever runs inside it.
 *
 * Two families share one transport:
 *  - a terminal *run* drives the Claude Code CLI; it is an AgentRun, lives in
 *    the sidebar, resumes across restarts and is mirrored into RunEvents.
 *  - a *dock* terminal is a plain shell or a command (a dev server, a test
 *    watcher) opened beside the work. It belongs to a Session, sits in the
 *    bottom dock, and lives as long as the app does — like a terminal tab.
 *
 * A terminal is addressed by id: the run id for run terminals, a `term_…` id
 * for dock terminals.
 */

/** What a dock terminal runs. */
export type DockProfile = 'shell' | 'command';

/** Everything the PTY layer needs to know to start a terminal. */
export type TerminalLaunch =
  | { profile: 'claude'; resume: string | null }
  | { profile: 'shell' }
  | { profile: 'command'; command: string };

export type DockTerminalStatus = 'running' | 'exited';

export interface DockTerminal {
  id: string;
  /** The Session the tab was opened in; null for a loose terminal. */
  sessionId: string | null;
  title: string;
  cwd: string;
  profile: DockProfile;
  /** The command for `command` terminals; null for a shell. */
  command: string | null;
  status: DockTerminalStatus;
  exitCode: number | null;
  createdAt: number;
}

export interface CreateDockTerminalInput {
  sessionId: string | null;
  cwd: string;
  profile: DockProfile;
  command?: string;
  title?: string;
}

/** Default tab title: the command's first word, or the folder's name. */
export function dockTerminalTitle(input: CreateDockTerminalInput): string {
  const given = input.title?.trim();
  if (given) return given;
  if (input.profile === 'command' && input.command?.trim()) {
    return input.command.trim().split(/\s+/).slice(0, 3).join(' ');
  }
  const folder = input.cwd.replace(/\/+$/, '').split('/').pop();
  return folder || 'shell';
}
