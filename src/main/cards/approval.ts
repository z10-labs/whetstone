/**
 * Which bindings may start polling on their own (docs/live-cards.md §7).
 * `gh-*` bindings are read-only by construction. A `command` binding starts
 * only if it is on the read-only allow-list; a `file` binding only if it reads
 * inside the run's directory or ~/.whetstone. Everything else waits for the
 * human to allow it, once, on that card.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Binding } from '@shared/cards';
import { isReadOnlyCommand } from './adapters/command';
import { isPathInside, resolveBindingPath } from './adapters/file';

export function bindingNeedsApproval(binding: Binding, cwd: string | null): boolean {
  switch (binding.kind) {
    case 'gh-run':
    case 'gh-pr':
      return false;
    case 'command':
      return !isReadOnlyCommand(binding.command);
    case 'file': {
      let path: string;
      try {
        path = resolveBindingPath(binding.path, cwd);
      } catch {
        return true;
      }
      const roots = [join(homedir(), '.whetstone'), ...(cwd ? [cwd] : [])];
      return !isPathInside(path, roots);
    }
  }
}
