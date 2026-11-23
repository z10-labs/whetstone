import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CardPoller, intervalSec, isOnScreen, type PollerDeps } from './poller';
import type { CardPatchInput } from '../repo/cards';
import type { LiveCard } from '@shared/cards';

const NOW = Date.parse('2026-11-23T10:00:00Z');

function makeCard(over: Partial<LiveCard> = {}): LiveCard {
  return {
    id: 'c1',
    originSessionId: 's1',
    originRunId: 'r1',
    originSessionName: 'release-build',
    spec: {
      title: 'release.yml #4812',
      blocks: [],
      binding: { kind: 'gh-run', repo: 'o/r', runId: 4812 },
      wakeOn: [{ path: '/conclusion', op: 'eq', value: 'failure', note: 'run failed' }],
    },
    state: null,
    status: 'live',
    lastError: null,
    firedTriggers: [],
    bindingApprovedAt: null,
    pinnedAt: null,
    pinOrder: null,
    settledAt: null,
    lastPolledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

/** An in-memory store standing in for the repo. */
function harness(states: unknown[], card = makeCard()) {
  let stored = card;
  const ghRun = vi.fn(async () => {
    const next = states.shift();
    if (next instanceof Error) throw next;
    return next;
  });
  const deps: PollerDeps = {
    adapters: {
      'gh-run': ghRun,
      'gh-pr': vi.fn(),
      file: vi.fn(),
      command: vi.fn(),
    },
    context: { exec: vi.fn(), shell: vi.fn(), readFile: vi.fn(), now: () => Date.now() },
    getCard: async () => stored,
    listPollable: async () => [stored],
    patchCard: async (_id, patch: CardPatchInput) => {
      stored = {
        ...stored,
        ...(patch.state !== undefined ? { state: patch.state } : {}),
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.lastError !== undefined ? { lastError: patch.lastError } : {}),
        ...(patch.firedTriggers ? { firedTriggers: patch.firedTriggers } : {}),
        ...(patch.settledAt !== undefined ? { settledAt: patch.settledAt } : {}),
        ...(patch.lastPolledAt !== undefined ? { lastPolledAt: patch.lastPolledAt } : {}),
      };
      return stored;
    },
    cwdFor: async () => '/repo',
    onChanged: vi.fn(),
    onFired: vi.fn(),
  };
  const poller = new CardPoller(deps);
  poller.setViewing({ focused: true, sessionId: 's1', panelOpen: true });
  return { poller, deps, ghRun, get card() { return stored; } };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('intervalSec / isOnScreen', () => {
  test('defaults per kind and a floor of 5s', () => {
    expect(intervalSec({ kind: 'gh-run', repo: 'o/r', runId: 1 })).toBe(5);
    expect(intervalSec({ kind: 'gh-pr', repo: 'o/r', pr: 1 })).toBe(30);
    expect(intervalSec({ kind: 'command', command: 'x', everySec: 2 })).toBe(5);
  });

  test('pinned cards count as on screen in any session; others only in theirs', () => {
    const view = { focused: true, sessionId: 's2', panelOpen: true };
    expect(isOnScreen(makeCard(), view)).toBe(false);
    expect(isOnScreen(makeCard({ pinnedAt: NOW }), view)).toBe(true);
    expect(isOnScreen(makeCard({ pinnedAt: NOW }), { ...view, focused: false })).toBe(false);
  });
});

describe('CardPoller', () => {
  test('polls, stores state and reschedules at the binding interval', async () => {
    const h = harness([{ status: 'in_progress' }, { status: 'in_progress' }]);
    h.poller.track(h.card);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.ghRun).toHaveBeenCalledTimes(1);
    expect(h.card.state).toEqual({ status: 'in_progress' });
    expect(h.card.lastPolledAt).toBe(NOW);
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.ghRun).toHaveBeenCalledTimes(2);
    h.poller.stop();
  });

  test('off-screen cards back off 4x', async () => {
    const h = harness([{ status: 'in_progress' }, { status: 'in_progress' }]);
    h.poller.setViewing({ focused: false });
    h.poller.track(h.card);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.ghRun).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15000);
    expect(h.ghRun).toHaveBeenCalledTimes(2);
    h.poller.stop();
  });

  test('settles and stops when the run completes, firing its trigger once', async () => {
    const h = harness([{ status: 'completed', conclusion: 'failure' }]);
    h.poller.track(h.card);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.card.status).toBe('settled');
    expect(h.card.settledAt).toBe(NOW);
    expect(h.deps.onFired).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), [0]);
    expect(h.card.firedTriggers).toEqual([0]);
    expect(h.poller.isTracking('c1')).toBe(false);
  });

  test('three errors in a row put the card in error, then it retries every 60s', async () => {
    const boom = () => new Error('gh: HTTP 502');
    const h = harness([boom(), boom(), boom(), { status: 'in_progress' }]);
    h.poller.track(h.card);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.card.status).toBe('live');
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.card.status).toBe('error');
    expect(h.card.lastError).toBe('gh: HTTP 502');
    await vi.advanceTimersByTimeAsync(59_000);
    expect(h.ghRun).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.card.status).toBe('live');
    expect(h.card.lastError).toBeNull();
    h.poller.stop();
  });

  test('cards without a binding, or awaiting approval, never poll', async () => {
    const h = harness([], makeCard({ status: 'awaiting-approval' }));
    h.poller.track(h.card);
    h.poller.track(makeCard({ id: 'c2', spec: { title: 'static', blocks: [] } }));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.ghRun).not.toHaveBeenCalled();
  });
});
