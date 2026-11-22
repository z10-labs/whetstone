import { describe, expect, test } from 'vitest';
import {
  byPinnedThen,
  isDue,
  isUnclaimed,
  nextTaskStatus,
  type BrainItem,
} from './brain';

const NOW = 1_800_000_000_000;

function item(over: Partial<BrainItem> = {}): BrainItem {
  return {
    id: 'a',
    kind: 'task',
    title: 't',
    body: '',
    status: 'open',
    pinned: false,
    dueAt: null,
    firedAt: null,
    doneAt: null,
    sessionId: null,
    sessionName: null,
    createdBy: 'human',
    createdAt: NOW - 1000,
    updatedAt: NOW - 1000,
    ...over,
  };
}

describe('nextTaskStatus', () => {
  test('rings outstanding → in hand → done → outstanding', () => {
    expect(nextTaskStatus('open')).toBe('doing');
    expect(nextTaskStatus('doing')).toBe('done');
    expect(nextTaskStatus('done')).toBe('open');
    expect(nextTaskStatus('dropped')).toBe('open');
  });
});

describe('isDue', () => {
  test('is false for an undated entry', () => {
    expect(isDue(item(), NOW)).toBe(false);
  });
  test('is true once the clock passes dueAt', () => {
    expect(isDue(item({ dueAt: NOW - 1 }), NOW)).toBe(true);
    expect(isDue(item({ dueAt: NOW }), NOW)).toBe(true);
    expect(isDue(item({ dueAt: NOW + 1 }), NOW)).toBe(false);
  });
  test('is false once the entry is finished', () => {
    expect(isDue(item({ dueAt: NOW - 1, status: 'done' }), NOW)).toBe(false);
    expect(isDue(item({ dueAt: NOW - 1, status: 'dropped' }), NOW)).toBe(false);
  });
});

describe('isUnclaimed', () => {
  test('a due task that has been started leaves the Due band', () => {
    expect(isUnclaimed(item({ dueAt: NOW - 1, status: 'open' }), NOW)).toBe(true);
    expect(isUnclaimed(item({ dueAt: NOW - 1, status: 'doing' }), NOW)).toBe(false);
  });
});

describe('byPinnedThen', () => {
  test('pinned entries float above unpinned regardless of the field', () => {
    const a = item({ id: 'a', createdAt: 1 });
    const b = item({ id: 'b', createdAt: 2, pinned: true });
    const c = item({ id: 'c', createdAt: 3 });
    const sorted = [a, b, c].sort(byPinnedThen((i) => i.createdAt, 'desc'));
    expect(sorted.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });
  test('ascending puts the smaller field first', () => {
    const a = item({ id: 'a', dueAt: 20 });
    const b = item({ id: 'b', dueAt: 10 });
    const sorted = [a, b].sort(byPinnedThen((i) => i.dueAt ?? Infinity));
    expect(sorted.map((i) => i.id)).toEqual(['b', 'a']);
  });
});
