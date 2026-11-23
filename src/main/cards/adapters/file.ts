/**
 * `file` binding: read a path as JSON or as the last N lines of text. Also
 * exports the path helpers the poller uses to decide whether a binding needs
 * human approval (spec §7: outside session cwd and `~/.whetstone`).
 */

import os from 'node:os';
import path from 'node:path';
import { EXEC_MAX_BUFFER, type Adapter } from './types';

export function resolveBindingPath(filePath: string, cwd: string | null): string {
  if (filePath === '~') return os.homedir();
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  if (path.isAbsolute(filePath)) return path.normalize(filePath);
  if (!cwd) {
    throw new Error(`relative file path requires a session cwd: ${filePath}`);
  }
  return path.resolve(cwd, filePath);
}

/**
 * True when `filePath` sits under one of `roots`. Paths are normalised (`.` /
 * `..` collapsed) but symlinks are not followed — the poller only needs a
 * cheap containment check.
 */
export function isPathInside(filePath: string, roots: string[]): boolean {
  const target = path.resolve(filePath);
  return roots.some((root) => {
    const base = path.resolve(root);
    if (target === base) return true;
    const prefix = base.endsWith(path.sep) ? base : base + path.sep;
    return target.startsWith(prefix);
  });
}

function tailLines(text: string, n: number): string[] {
  const trimmed = text.replace(/(?:\r?\n)+$/, '');
  if (trimmed === '') return [];
  return trimmed.split(/\r?\n/).slice(-n);
}

export const fileAdapter: Adapter<'file'> = async (binding, _prev, ctx) => {
  const resolved = resolveBindingPath(binding.path, ctx.cwd);
  let text = await ctx.readFile(resolved);

  if (text.length > EXEC_MAX_BUFFER) {
    if (binding.parse === 'json') {
      throw new Error(`file too large to parse as JSON: ${resolved}`);
    }
    // Tail only needs the end; keep the last megabyte of bytes-as-chars.
    text = text.slice(-EXEC_MAX_BUFFER);
  }

  if (binding.parse === 'json') {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error(`failed to parse ${resolved} as JSON`);
    }
  }

  return { lines: tailLines(text, binding.lines ?? 20) };
};
