import { describe, expect, test } from 'vitest';
import {
  bindingSourceLabel,
  formatBudgetLabel,
  formatDuration,
  formatFinishedAgo,
} from './format';
import type { Binding } from '@shared/cards';

describe('formatDuration', () => {
  test('renders m:ss under an hour', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(9 * 60 + 12)).toBe('9:12');
  });
  test('renders h:mm:ss from an hour up', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3600 + 2 * 60 + 3)).toBe('1:02:03');
  });
  test('floors fractional seconds and clamps negatives', () => {
    expect(formatDuration(65.9)).toBe('1:05');
    expect(formatDuration(-4)).toBe('0:00');
  });
});

describe('formatBudgetLabel', () => {
  test('formats seconds as compact minutes', () => {
    expect(formatBudgetLabel(9 * 60, 'sec')).toBe('9m');
    expect(formatBudgetLabel(45, 'sec')).toBe('45s');
    expect(formatBudgetLabel(3600, 'sec')).toBe('1h');
    expect(formatBudgetLabel(3600 + 5 * 60, 'sec')).toBe('1h5m');
  });
  test('formats counts as whole numbers', () => {
    expect(formatBudgetLabel(12, 'count')).toBe('12');
    expect(formatBudgetLabel(12.6, 'count')).toBe('13');
  });
});

describe('formatFinishedAgo', () => {
  const NOW = new Date(2026, 8, 12, 10, 0, 0, 0).getTime();

  test('reads just now inside a minute', () => {
    expect(formatFinishedAgo(NOW - 20_000, NOW)).toBe('finished just now');
  });
  test('steps through minutes, hours, days', () => {
    expect(formatFinishedAgo(NOW - 14 * 60_000, NOW)).toBe('finished 14m ago');
    expect(formatFinishedAgo(NOW - 2 * 3_600_000, NOW)).toBe('finished 2h ago');
    expect(formatFinishedAgo(NOW - 3 * 86_400_000, NOW)).toBe('finished 3d ago');
  });
});

describe('bindingSourceLabel', () => {
  test('names each binding kind with its interval', () => {
    expect(bindingSourceLabel({ kind: 'gh-run', repo: 'a/b', runId: 1 })).toBe(
      'gh run view · every 5s',
    );
    expect(bindingSourceLabel({ kind: 'gh-run', repo: 'a/b', runId: 1, everySec: 10 })).toBe(
      'gh run view · every 10s',
    );
    expect(bindingSourceLabel({ kind: 'gh-pr', repo: 'a/b', pr: 2 })).toBe(
      'gh pr view · every 30s',
    );
    const cmd: Binding = { kind: 'command', command: 'npm run stats', everySec: 20 };
    expect(bindingSourceLabel(cmd)).toBe('command · every 20s');
    expect(bindingSourceLabel({ kind: 'file', path: '/tmp/x', parse: 'json' })).toBe('file');
  });
});
