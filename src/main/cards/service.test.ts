import { describe, expect, test } from 'vitest';
import { actionMessage, seedMessage, wakeMessage } from './service';
import type { LiveCard } from '@shared/cards';

const card: LiveCard = {
  id: '3fa9c1aa-0000-4000-8000-000000000000',
  originSessionId: 's1',
  originRunId: 'r1',
  originSessionName: 'release-build',
  spec: {
    title: 'release.yml #4812',
    blocks: [],
    wakeOn: [
      { path: '/conclusion', op: 'eq', value: 'failure', note: 'run failed' },
      { path: '/elapsedSec', op: 'gt', value: 2100, note: 'passed 35 min' },
    ],
  },
  state: { status: 'completed', conclusion: 'failure' },
  status: 'settled',
  lastError: null,
  firedTriggers: [0, 1],
  bindingApprovedAt: null,
  pinnedAt: null,
  pinOrder: null,
  settledAt: 1,
  lastPolledAt: 1,
  createdAt: 1,
  updatedAt: 1,
};

describe('card messages', () => {
  test('a wake names the card, every fired note, and the state', () => {
    const text = wakeMessage(card, [0, 1]);
    expect(text.startsWith('[card id:3fa9c1 · release.yml #4812] trigger: run failed; passed 35 min')).toBe(true);
    expect(text).toContain('"conclusion": "failure"');
  });

  test('a huge state is truncated', () => {
    const big = { ...card, state: { log: 'x'.repeat(10_000) } };
    expect(wakeMessage(big, [0])).toContain('… (truncated)');
    expect(wakeMessage(big, [0]).length).toBeLessThan(4300);
  });

  test('an action is the card label plus what was clicked', () => {
    expect(actionMessage(card, 'Approve')).toBe('[card id:3fa9c1 · release.yml #4812] Approve');
  });

  test('a seed message carries spec and state', () => {
    const text = seedMessage(card);
    expect(text).toContain('You now own it');
    expect(text).toContain('"title": "release.yml #4812"');
  });
});
