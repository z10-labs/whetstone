/**
 * How each terminal profile is started. Every profile goes through the user's
 * login shell so their PATH and rc files load even under a GUI launch.
 */

import type { TerminalLaunch } from '@shared/terminals';

/** Claude Code session ids are UUIDs; anything else never reaches a shell. */
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSessionId(value: string): boolean {
  return SESSION_ID.test(value);
}

/** Arguments for `$SHELL` that start the given profile. */
export function launchArgs(launch: TerminalLaunch, shell: string): string[] {
  switch (launch.profile) {
    case 'claude': {
      if (launch.resume && !isSessionId(launch.resume)) {
        throw new Error(`Not a Claude Code session id: ${launch.resume}`);
      }
      // `exec` hands the PTY straight to the CLI, so its exit ends the tab.
      return ['-lic', launch.resume ? `exec claude --resume ${launch.resume}` : 'exec claude'];
    }
    case 'shell':
      return ['-l'];
    case 'command': {
      const command = launch.command.trim();
      if (!command) throw new Error('A command terminal needs a command.');
      // Drop back to a shell when the command ends (or is ^C'd), so its output
      // stays readable and the tab can be reused.
      return ['-lic', `${command}; exec ${shell} -l`];
    }
  }
}
