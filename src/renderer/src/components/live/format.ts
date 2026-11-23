/**
 * Pure label helpers for Live Cards — duration ticks, budget markers,
 * binding source lines, and the "finished 2h ago" footer.
 */

import { intervalSec, type Binding } from '@shared/cards';

const MINUTE = 60;
const HOUR = 60 * MINUTE;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Seconds → `m:ss` or `h:mm:ss`. */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / HOUR);
  const m = Math.floor((s % HOUR) / MINUTE);
  const rem = s % MINUTE;
  if (h > 0) return `${h}:${pad(m)}:${pad(rem)}`;
  return `${m}:${pad(rem)}`;
}

/** Budget axis label: `9m` for seconds, plain number for counts. */
export function formatBudgetLabel(value: number, unit: 'sec' | 'count'): string {
  if (unit === 'count') return String(Math.round(value));
  const s = Math.max(0, Math.round(value));
  if (s < MINUTE) return `${s}s`;
  const h = Math.floor(s / HOUR);
  const m = Math.round((s % HOUR) / MINUTE);
  if (h > 0) return m > 0 ? `${h}h${m}m` : `${h}h`;
  return `${Math.round(s / MINUTE)}m`;
}

/** Settled footer: `finished 2h ago`. */
export function formatFinishedAgo(settledAt: number, now: number = Date.now()): string {
  const sec = Math.max(0, Math.round((now - settledAt) / 1000));
  if (sec < MINUTE) return 'finished just now';
  const mins = Math.round(sec / MINUTE);
  if (mins < 60) return `finished ${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `finished ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `finished ${days}d ago`;
}

/** Dim footer source for a live binding, e.g. `gh run view · every 5s`. */
export function bindingSourceLabel(binding: Binding): string {
  const every = `every ${intervalSec(binding)}s`;
  switch (binding.kind) {
    case 'gh-run':
      return `gh run view · ${every}`;
    case 'gh-pr':
      return `gh pr view · ${every}`;
    case 'command':
      return `command · ${every}`;
    case 'file':
      return `file · ${every}`;
  }
}
