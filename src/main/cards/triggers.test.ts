import { describe, expect, test } from 'vitest';
import { defaultSettle, firedTriggers, isSettled, matches } from './triggers';
import type { Trigger } from '@shared/cards';

describe('matches', () => {
  const state = { status: 'in_progress', elapsedSec: 2200, nested: { n: 1 } };

  test('eq / ne', () => {
    expect(matches({ path: '/status', op: 'eq', value: 'in_progress' }, state)).toBe(true);
    expect(matches({ path: '/status', op: 'ne', value: 'completed' }, state)).toBe(true);
    // A missing field is not "not equal": nothing to compare yet.
    expect(matches({ path: '/missing', op: 'ne', value: 'x' }, state)).toBe(false);
  });

  test('gt / lt only compare numbers', () => {
    expect(matches({ path: '/elapsedSec', op: 'gt', value: 2100 }, state)).toBe(true);
    expect(matches({ path: '/elapsedSec', op: 'lt', value: 2100 }, state)).toBe(false);
    expect(matches({ path: '/status', op: 'gt', value: 1 }, state)).toBe(false);
  });

  test('changed never fires on the first tick, then compares deeply', () => {
    expect(matches({ path: '/nested', op: 'changed' }, state, null)).toBe(false);
    expect(matches({ path: '/nested', op: 'changed' }, state, { nested: { n: 1 } })).toBe(false);
    expect(matches({ path: '/nested', op: 'changed' }, state, { nested: { n: 0 } })).toBe(true);
  });
});

describe('firedTriggers', () => {
  const wakeOn: Trigger[] = [
    { path: '/conclusion', op: 'eq', value: 'failure', note: 'run failed' },
    { path: '/elapsedSec', op: 'gt', value: 2100, note: 'passed 35 min' },
  ];

  test('returns the indices that fire now', () => {
    expect(firedTriggers(wakeOn, null, { elapsedSec: 2200 }, [])).toEqual([1]);
  });

  test('a trigger fires only once', () => {
    expect(firedTriggers(wakeOn, null, { elapsedSec: 2300 }, [1])).toEqual([]);
  });

  test('no wakeOn, nothing fires', () => {
    expect(firedTriggers(undefined, null, {}, [])).toEqual([]);
  });
});

describe('settling', () => {
  test('gh-run settles when completed, gh-pr when no longer open', () => {
    expect(defaultSettle({ kind: 'gh-run', repo: 'o/r', runId: 1 })?.value).toBe('completed');
    expect(defaultSettle({ kind: 'gh-pr', repo: 'o/r', pr: 1 })?.op).toBe('ne');
    expect(defaultSettle({ kind: 'file', path: 'x', parse: 'json' })).toBeNull();
  });

  test('isSettled prefers the spec condition over the default', () => {
    const binding = { kind: 'gh-run' as const, repo: 'o/r', runId: 1 };
    expect(isSettled({ title: 't', blocks: [], binding }, { status: 'completed' })).toBe(true);
    expect(
      isSettled(
        { title: 't', blocks: [], binding, settleOn: { path: '/done', op: 'eq', value: true } },
        { status: 'completed' },
      ),
    ).toBe(false);
    expect(isSettled({ title: 't', blocks: [] }, {})).toBe(false);
  });
});
