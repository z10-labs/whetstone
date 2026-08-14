/** Small presentational helpers shared across renderer components. */

import type { RunStatus } from '@shared/models';

export const SESSION_COLORS = ['slate', 'amber', 'violet', 'emerald', 'rose', 'cyan'] as const;
export type SessionColor = (typeof SESSION_COLORS)[number];

/** CSS var for a session accent swatch. */
export function sessionColorVar(color: string): string {
  return `var(--c-${color})`;
}

/** CSS var for a run status color. */
export function statusColorVar(status: RunStatus): string {
  switch (status) {
    case 'running':
      return 'var(--run)';
    case 'completed':
      return 'var(--ok)';
    case 'error':
      return 'var(--err)';
    case 'canceled':
      return 'var(--warn)';
    default:
      return 'var(--idle)';
  }
}

export function statusLabel(status: RunStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Shorten an absolute path to a readable tail (~/… form). */
export function prettyPath(path: string): string {
  const home = /^\/Users\/[^/]+/;
  return path.replace(home, '~');
}

export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.round(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
