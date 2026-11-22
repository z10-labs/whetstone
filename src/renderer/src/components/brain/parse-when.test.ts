import { describe, expect, test } from 'vitest';
import { parseCapture, parseWhen } from './parse-when';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Sat 12 Sep 2026 10:00 local. */
const NOW = new Date(2026, 8, 12, 10, 0, 0, 0).getTime();
const local = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).getTime();

describe('parseWhen — relative', () => {
  test('lifts a trailing "in 30m" out of the title', () => {
    expect(parseWhen('ping the reviewer in 30m', NOW)).toEqual({
      title: 'ping the reviewer',
      dueAt: NOW + 30 * MINUTE,
      matched: 'in 30m',
    });
  });
  test('accepts spelled-out units', () => {
    expect(parseWhen('check CI in 2 hours', NOW).dueAt).toBe(NOW + 2 * HOUR);
    expect(parseWhen('rotate keys in 3 days', NOW).dueAt).toBe(local(15, 10));
    expect(parseWhen('nudge in 1 week', NOW).dueAt).toBe(local(19, 10));
  });
  test('accepts a leading phrase with a separator', () => {
    expect(parseWhen('in 20 min: rerun the flaky suite', NOW)).toEqual({
      title: 'rerun the flaky suite',
      dueAt: NOW + 20 * MINUTE,
      matched: 'in 20 min',
    });
  });
});

describe('parseWhen — clock', () => {
  test('"at 3pm" is later today', () => {
    expect(parseWhen('standup notes at 3pm', NOW).dueAt).toBe(local(12, 15));
  });
  test('"at 3" without a meridiem reads as afternoon', () => {
    expect(parseWhen('deploy at 3', NOW).dueAt).toBe(local(12, 15));
  });
  test('"at 9" that has already passed rolls to tomorrow', () => {
    expect(parseWhen('coffee at 9', NOW).dueAt).toBe(local(13, 9));
  });
  test('accepts HH:MM without "at"', () => {
    expect(parseWhen('release branch 16:45', NOW).dueAt).toBe(local(12, 16, 45));
  });
  test('a bare number is never a time', () => {
    const r = parseWhen('build task 33', NOW);
    expect(r.dueAt).toBeNull();
    expect(r.title).toBe('build task 33');
  });
});

describe('parseWhen — day words', () => {
  test('"tomorrow" alone lands at 09:00', () => {
    expect(parseWhen('review the PR tomorrow', NOW).dueAt).toBe(local(13, 9));
  });
  test('"tomorrow at 2pm" combines', () => {
    expect(parseWhen('review the PR tomorrow at 2pm', NOW)).toEqual({
      title: 'review the PR',
      dueAt: local(13, 14),
      matched: 'tomorrow at 2pm',
    });
  });
  test('"tonight" is 18:00 today when still ahead', () => {
    expect(parseWhen('close the laptop tonight', NOW).dueAt).toBe(local(12, 18));
  });
  test('a weekday is the next one strictly after today', () => {
    // NOW is a Saturday; Monday is the 14th.
    expect(parseWhen('kick off sprint mon', NOW).dueAt).toBe(local(14, 9));
    expect(parseWhen('kick off sprint on Monday 10am', NOW).dueAt).toBe(local(14, 10));
    // "sat" from a Saturday means next Saturday, not today.
    expect(parseWhen('weekly tidy sat', NOW).dueAt).toBe(local(19, 9));
  });
});

describe('parseWhen — the whole line is the time', () => {
  test('a bare relative phrase keeps its words as the title and still dates', () => {
    expect(parseWhen('in 30m', NOW)).toEqual({
      title: 'in 30m',
      dueAt: NOW + 30 * MINUTE,
      matched: 'in 30m',
    });
  });
  test('a day word with a clock keeps the typed clock, not the default hour', () => {
    expect(parseWhen('tomorrow at 10am', NOW).dueAt).toBe(local(13, 10));
    expect(parseWhen('tonight at 8', NOW).dueAt).toBe(local(12, 20));
    expect(parseWhen('tuesday 3pm', NOW).dueAt).toBe(local(15, 15));
    expect(parseWhen('next mon 10am', NOW).dueAt).toBe(local(14, 10));
  });
  test('never leaves half a phrase behind as the title', () => {
    expect(parseWhen('tomorrow at 10am', NOW).title).toBe('tomorrow at 10am');
  });
});

describe('parseWhen — no match', () => {
  test('leaves ordinary text untouched', () => {
    expect(parseWhen('think about the monorepo', NOW)).toEqual({
      title: 'think about the monorepo',
      dueAt: null,
      matched: null,
    });
  });
  test('does not eat words that merely contain a unit letter', () => {
    expect(parseWhen('tidy the admin panel', NOW).dueAt).toBeNull();
    expect(parseWhen('inspect the thing', NOW).dueAt).toBeNull();
  });
});

describe('parseCapture', () => {
  test('strips a "remind me to" prefix and switches kind to reminder', () => {
    expect(parseCapture('remind me to build task 33 at 4pm', 'jot', NOW)).toEqual({
      kind: 'reminder',
      title: 'build task 33',
      dueAt: local(12, 16),
      matched: 'at 4pm',
    });
  });
  test('a jot that names a time becomes a reminder', () => {
    expect(parseCapture('water the plants in 2h', 'jot', NOW).kind).toBe('reminder');
  });
  test('a task that names a time stays a task, with the due carried', () => {
    const r = parseCapture('ship the fix tomorrow', 'task', NOW);
    expect(r.kind).toBe('task');
    expect(r.dueAt).toBe(local(13, 9));
  });
  test('a bare reminder with no time is left for the chips to date', () => {
    expect(parseCapture('remind me to breathe', 'reminder', NOW)).toEqual({
      kind: 'reminder',
      title: 'breathe',
      dueAt: null,
      matched: null,
    });
  });
});
