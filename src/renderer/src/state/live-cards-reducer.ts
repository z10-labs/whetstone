/**
 * Pure upsert/remove for the Live panel's two lists. Kept separate from the
 * hook so the placement rules (pinned vs session, pinOrder, newest-first)
 * can be unit-tested without React.
 */

import type { CardChange, LiveCard, LiveCardsView } from '@shared/cards';

function byPinOrder(a: LiveCard, b: LiveCard): number {
  return (a.pinOrder ?? 0) - (b.pinOrder ?? 0);
}

function byNewest(a: LiveCard, b: LiveCard): number {
  return b.createdAt - a.createdAt;
}

/** Apply a CardChanged payload to the current view for `sessionId`. */
export function applyCardChange(
  view: LiveCardsView,
  change: CardChange,
  sessionId: string | null,
): LiveCardsView {
  if ('removedId' in change) {
    const { removedId } = change;
    return {
      session: view.session.filter((c) => c.id !== removedId),
      pinned: view.pinned.filter((c) => c.id !== removedId),
    };
  }

  const { card } = change;
  // Drop from both lists first; then put it back in the right one.
  const without = {
    session: view.session.filter((c) => c.id !== card.id),
    pinned: view.pinned.filter((c) => c.id !== card.id),
  };

  if (card.pinnedAt !== null) {
    return {
      session: without.session,
      pinned: [...without.pinned, card].sort(byPinOrder),
    };
  }

  if (sessionId !== null && card.originSessionId === sessionId) {
    return {
      session: [...without.session, card].sort(byNewest),
      pinned: without.pinned,
    };
  }

  // Another session's unpinned card — leave it out of both lists.
  return without;
}
