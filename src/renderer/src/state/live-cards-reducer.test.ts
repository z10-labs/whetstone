import { describe, expect, test } from 'vitest';
import { applyCardChange } from './live-cards-reducer';
import type { LiveCard, LiveCardsView } from '@shared/cards';

const SESSION = 'sess-1';
const OTHER = 'sess-2';

function card(partial: Partial<LiveCard> & Pick<LiveCard, 'id'>): LiveCard {
  return {
    originSessionId: SESSION,
    originRunId: null,
    originSessionName: 'alpha',
    spec: { title: partial.id, blocks: [] },
    state: null,
    status: 'live',
    lastError: null,
    firedTriggers: [],
    bindingApprovedAt: null,
    pinnedAt: null,
    pinOrder: null,
    settledAt: null,
    lastPolledAt: null,
    createdAt: 1_000,
    updatedAt: 1_000,
    ...partial,
  };
}

const empty: LiveCardsView = { session: [], pinned: [] };

describe('applyCardChange', () => {
  test('upserts a session card newest-first', () => {
    const older = card({ id: 'a', createdAt: 100 });
    const newer = card({ id: 'b', createdAt: 200 });
    let view = applyCardChange(empty, { card: older }, SESSION);
    view = applyCardChange(view, { card: newer }, SESSION);
    expect(view.session.map((c) => c.id)).toEqual(['b', 'a']);
    expect(view.pinned).toEqual([]);
  });

  test('pinned upsert moves the card out of session and sorts by pinOrder', () => {
    const a = card({ id: 'a', createdAt: 100 });
    let view = applyCardChange(empty, { card: a }, SESSION);
    expect(view.session).toHaveLength(1);

    const pinnedA = card({
      id: 'a',
      pinnedAt: 50,
      pinOrder: 2,
      createdAt: 100,
    });
    const pinnedB = card({
      id: 'b',
      pinnedAt: 40,
      pinOrder: 1,
      originSessionId: OTHER,
      createdAt: 90,
    });
    view = applyCardChange(view, { card: pinnedA }, SESSION);
    view = applyCardChange(view, { card: pinnedB }, SESSION);
    expect(view.session).toEqual([]);
    expect(view.pinned.map((c) => c.id)).toEqual(['b', 'a']);
  });

  test('removal drops the card from both lists', () => {
    const a = card({ id: 'a', pinnedAt: 1, pinOrder: 0 });
    const b = card({ id: 'b', createdAt: 200 });
    let view = applyCardChange(empty, { card: a }, SESSION);
    view = applyCardChange(view, { card: b }, SESSION);
    view = applyCardChange(view, { removedId: 'a' }, SESSION);
    expect(view.pinned).toEqual([]);
    expect(view.session.map((c) => c.id)).toEqual(['b']);
    view = applyCardChange(view, { removedId: 'b' }, SESSION);
    expect(view).toEqual(empty);
  });

  test('ignores an unpinned card from another session', () => {
    const foreign = card({ id: 'x', originSessionId: OTHER, createdAt: 300 });
    const view = applyCardChange(empty, { card: foreign }, SESSION);
    expect(view).toEqual(empty);
  });

  test('updating a pinned card keeps pinOrder sort', () => {
    const a = card({ id: 'a', pinnedAt: 1, pinOrder: 0, spec: { title: 'old', blocks: [] } });
    const b = card({ id: 'b', pinnedAt: 2, pinOrder: 1, spec: { title: 'b', blocks: [] } });
    let view = applyCardChange(empty, { card: a }, SESSION);
    view = applyCardChange(view, { card: b }, SESSION);
    const updated = card({
      id: 'a',
      pinnedAt: 1,
      pinOrder: 0,
      spec: { title: 'new', blocks: [] },
    });
    view = applyCardChange(view, { card: updated }, SESSION);
    expect(view.pinned.map((c) => c.spec.title)).toEqual(['new', 'b']);
  });
});
