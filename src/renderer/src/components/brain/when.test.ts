import { describe, expect, test } from 'vitest';
import { QUICK_WHENS, formatDue, fromLocalInputValue, toLocalInputValue } from './when';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A fixed local morning so day-boundary maths is deterministic in any TZ. */
const NOW = new Date(2026, 8, 12, 10, 0, 0, 0).getTime(); // Sat 12 Sep 2026 10:00 local

describe('formatDue', () => {
  test('reads as "now" inside a minute either way', () => {
    expect(formatDue(NOW + 30_000, NOW)).toBe('now');
    expect(formatDue(NOW - 30_000, NOW)).toBe('now');
  });
  test('counts down in minutes inside the hour', () => {
    expect(formatDue(NOW + 25 * MINUTE, NOW)).toBe('in 25m');
  });
  test('anchors to a clock time later today', () => {
    expect(formatDue(NOW + 4 * HOUR, NOW)).toBe('14:00 today');
  });
  test('anchors to tomorrow', () => {
    expect(formatDue(NOW + DAY, NOW)).toBe('10:00 tomorrow');
  });
  test('reads overdue in plain minutes, then hours, then days', () => {
    expect(formatDue(NOW - 14 * MINUTE, NOW)).toBe('14m late');
    expect(formatDue(NOW - 3 * HOUR, NOW)).toBe('3h late');
    expect(formatDue(NOW - 2 * DAY, NOW)).toBe('2d late');
  });
});

describe('QUICK_WHENS', () => {
  const at = (label: string) => {
    const q = QUICK_WHENS.find((w) => w.label === label);
    if (!q) throw new Error(`no quick when ${label}`);
    return q.at(NOW);
  };
  test('relative chips add to now', () => {
    expect(at('30m')).toBe(NOW + 30 * MINUTE);
    expect(at('2h')).toBe(NOW + 2 * HOUR);
  });
  test('Tonight is 18:00 today when that is still ahead', () => {
    expect(at('Tonight')).toBe(new Date(2026, 8, 12, 18, 0).getTime());
  });
  test('Tomorrow is 09:00 the next day', () => {
    expect(at('Tomorrow')).toBe(new Date(2026, 8, 13, 9, 0).getTime());
  });
});

describe('datetime-local round trip', () => {
  test('survives a trip through the input value format', () => {
    const ms = new Date(2026, 8, 12, 14, 30).getTime();
    expect(toLocalInputValue(ms)).toBe('2026-09-12T14:30');
    expect(fromLocalInputValue('2026-09-12T14:30')).toBe(ms);
  });
  test('empty or garbage input is null', () => {
    expect(fromLocalInputValue('')).toBeNull();
    expect(fromLocalInputValue('not a date')).toBeNull();
  });
});
