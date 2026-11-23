import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { closeDb, initDbAt } from '../db/client';
import { MAX_PINNED, shortCardId, type CardSpec } from '@shared/cards';
import {
  createCard,
  dismissCard,
  findCardInSession,
  getCard,
  listPinned,
  listPollable,
  listView,
  patchCard,
  pinCard,
  reorderPinned,
  sweepOrphans,
  unpinCard,
} from './cards';
import { createSession, deleteSession } from './sessions';

const spec = (title: string, bound = true): CardSpec => ({
  title,
  blocks: [{ kind: 'markdown', text: 'hi' }],
  ...(bound ? { binding: { kind: 'gh-run' as const, repo: 'o/r', runId: 1 } } : {}),
});

let sessionId: string;

beforeEach(async () => {
  await initDbAt(':memory:');
  sessionId = (await createSession({ name: 'release-build' })).id;
});

afterEach(() => closeDb());

async function make(title: string, sid = sessionId) {
  return createCard({ sessionId: sid, runId: null, spec: spec(title), status: 'live' });
}

describe('cards repo', () => {
  test('a new card round-trips its spec and carries the session name', async () => {
    const card = await make('CI');
    expect(card.spec.title).toBe('CI');
    expect(card.originSessionName).toBe('release-build');
    expect(card.firedTriggers).toEqual([]);
    expect((await listView(sessionId)).session.map((c) => c.id)).toEqual([card.id]);
  });

  test('findCardInSession accepts full, short and id: forms, scoped to the session', async () => {
    const card = await make('CI');
    const other = (await createSession({ name: 'other' })).id;
    expect((await findCardInSession(card.id, sessionId))?.id).toBe(card.id);
    expect((await findCardInSession(`id:${shortCardId(card.id)}`, sessionId))?.id).toBe(card.id);
    expect(await findCardInSession(card.id, other)).toBeNull();
  });

  test('pinning moves a card out of the session list into pinned, in order', async () => {
    const a = await make('A');
    const b = await make('B');
    await pinCard(a.id);
    await pinCard(b.id);
    const view = await listView(sessionId);
    expect(view.session).toEqual([]);
    expect(view.pinned.map((c) => c.spec.title)).toEqual(['A', 'B']);
    // Pinned cards show for any session.
    expect((await listView(null)).pinned).toHaveLength(2);
  });

  test(`the ${MAX_PINNED + 1}th pin is refused with the pinned set, unless it replaces one`, async () => {
    for (let i = 0; i < MAX_PINNED; i++) await pinCard((await make(`P${i}`)).id);
    const extra = await make('extra');
    const res = await pinCard(extra.id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.pinned).toHaveLength(MAX_PINNED);

    const drop = (await listPinned())[0];
    const replaced = await pinCard(extra.id, drop.id);
    expect(replaced.ok).toBe(true);
    const titles = (await listPinned()).map((c) => c.spec.title);
    expect(titles).toContain('extra');
    expect(titles).not.toContain(drop.spec.title);
  });

  test('unpin returns a card to its session; reorder rewrites pin order', async () => {
    const a = await make('A');
    const b = await make('B');
    await pinCard(a.id);
    await pinCard(b.id);
    expect((await reorderPinned([b.id, a.id])).map((c) => c.spec.title)).toEqual(['B', 'A']);
    await unpinCard(a.id);
    const view = await listView(sessionId);
    expect(view.session.map((c) => c.spec.title)).toEqual(['A']);
    expect(view.pinned.map((c) => c.spec.title)).toEqual(['B']);
  });

  test('deleting a session orphans pinned cards and the sweep removes the rest', async () => {
    const kept = await make('kept');
    const lost = await make('lost');
    await pinCard(kept.id);
    await deleteSession(sessionId);

    const orphan = await getCard(kept.id);
    expect(orphan?.originSessionId).toBeNull();
    expect(orphan?.originSessionName).toBeNull();

    expect(await sweepOrphans()).toEqual([lost.id]);
    expect(await getCard(lost.id)).toBeNull();
    expect((await listPinned()).map((c) => c.id)).toEqual([kept.id]);

    // An orphan has nowhere to go back to: unpinning dismisses it.
    expect(await unpinCard(kept.id)).toBeNull();
    expect(await listPinned()).toEqual([]);
  });

  test('dismissed and settled cards stop polling; static cards never poll', async () => {
    const live = await make('live');
    const settled = await make('settled');
    const gone = await make('gone');
    await createCard({ sessionId, runId: null, spec: spec('static', false), status: 'live' });
    await patchCard(settled.id, { status: 'settled', settledAt: 1 });
    await dismissCard(gone.id);
    expect((await listPollable()).map((c) => c.id)).toEqual([live.id]);
  });

  test('patchCard stores state as JSON', async () => {
    const card = await make('CI');
    const updated = await patchCard(card.id, { state: { elapsedSec: 12 }, firedTriggers: [0] });
    expect(updated.state).toEqual({ elapsedSec: 12 });
    expect(updated.firedTriggers).toEqual([0]);
  });
});
