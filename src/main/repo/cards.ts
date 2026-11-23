/**
 * Live Cards repository — storage for agent-made cards and the human's pins.
 * Returns plain `shared/cards` shapes; no Drizzle rows escape. Async (libSQL).
 *
 * Every read joins the origin Session's name so a pinned card can say where it
 * came from. Dismissed cards are kept as rows (`dismissed_at`) but never read
 * back; unpinned cards whose Session is gone are swept for good.
 */

import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { getDb } from '../db/client';
import { liveCards, sessions, type LiveCardRow } from '../db/schema';
import {
  MAX_PINNED,
  shortCardId,
  type CardSpec,
  type CardStatus,
  type LiveCard,
  type LiveCardsView,
} from '@shared/cards';
import type { PinResult } from '@shared/ipc';

interface Joined {
  card: LiveCardRow;
  sessionName: string | null;
}

function parseJson<T>(text: string | null, fallback: T): T {
  if (text === null) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function toCard({ card: row, sessionName }: Joined): LiveCard {
  return {
    id: row.id,
    originSessionId: row.originSessionId,
    originRunId: row.originRunId,
    originSessionName: sessionName,
    spec: parseJson<CardSpec>(row.spec, { title: '(unreadable card)', blocks: [] }),
    state: parseJson<unknown>(row.state, null),
    status: row.status as CardStatus,
    lastError: row.lastError,
    firedTriggers: parseJson<number[]>(row.firedTriggers, []),
    bindingApprovedAt: row.bindingApprovedAt,
    pinnedAt: row.pinnedAt,
    pinOrder: row.pinOrder,
    settledAt: row.settledAt,
    lastPolledAt: row.lastPolledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function selectJoined() {
  return getDb()
    .select({ card: liveCards, sessionName: sessions.name })
    .from(liveCards)
    .leftJoin(sessions, eq(liveCards.originSessionId, sessions.id));
}

export interface CreateCardInput {
  sessionId: string;
  runId: string | null;
  spec: CardSpec;
  status: CardStatus;
}

export async function createCard(input: CreateCardInput): Promise<LiveCard> {
  const now = Date.now();
  const id = randomUUID();
  await getDb()
    .insert(liveCards)
    .values({
      id,
      originSessionId: input.sessionId,
      originRunId: input.runId,
      spec: JSON.stringify(input.spec),
      status: input.status,
      createdAt: now,
      updatedAt: now,
    });
  const card = await getCard(id);
  if (!card) throw new Error('Card vanished after insert');
  return card;
}

export async function getCard(id: string): Promise<LiveCard | null> {
  const rows = await selectJoined().where(eq(liveCards.id, id)).limit(1);
  return rows[0] ? toCard(rows[0]) : null;
}

/** A card of this Session by its short id (`3fa9c1` or `id:3fa9c1`) or full id. */
export async function findCardInSession(ref: string, sessionId: string): Promise<LiveCard | null> {
  const needle = ref.trim().replace(/^id:/, '').toLowerCase();
  const cards = await listSessionCards(sessionId, { includePinned: true });
  return cards.find((c) => c.id === needle || shortCardId(c.id) === needle) ?? null;
}

/** Cards a Session made that are still around, newest first. */
export async function listSessionCards(
  sessionId: string,
  opts: { includePinned?: boolean } = {},
): Promise<LiveCard[]> {
  const rows = await selectJoined()
    .where(
      and(
        eq(liveCards.originSessionId, sessionId),
        isNull(liveCards.dismissedAt),
        opts.includePinned ? undefined : isNull(liveCards.pinnedAt),
      ),
    )
    .orderBy(desc(liveCards.createdAt));
  return rows.map(toCard);
}

export async function listPinned(): Promise<LiveCard[]> {
  const rows = await selectJoined()
    .where(and(isNotNull(liveCards.pinnedAt), isNull(liveCards.dismissedAt)))
    .orderBy(asc(liveCards.pinOrder), asc(liveCards.pinnedAt));
  return rows.map(toCard);
}

/** The Live tab: a Session's unpinned cards plus every pinned card. */
export async function listView(sessionId: string | null): Promise<LiveCardsView> {
  const [session, pinned] = await Promise.all([
    sessionId ? listSessionCards(sessionId) : Promise.resolve([]),
    listPinned(),
  ]);
  return { session, pinned };
}

/** Cards the poller should be running: not dismissed, not settled, with a binding. */
export async function listPollable(): Promise<LiveCard[]> {
  const rows = await selectJoined().where(
    and(isNull(liveCards.dismissedAt), inArray(liveCards.status, ['live', 'error'])),
  );
  return rows.map(toCard).filter((c) => c.spec.binding !== undefined);
}

export interface CardPatchInput {
  spec?: CardSpec;
  state?: unknown;
  status?: CardStatus;
  lastError?: string | null;
  firedTriggers?: number[];
  settledAt?: number | null;
  lastPolledAt?: number | null;
  bindingApprovedAt?: number | null;
}

export async function patchCard(id: string, patch: CardPatchInput): Promise<LiveCard> {
  const values: Partial<LiveCardRow> = { updatedAt: Date.now() };
  if (patch.spec !== undefined) values.spec = JSON.stringify(patch.spec);
  if (patch.state !== undefined) values.state = JSON.stringify(patch.state);
  if (patch.status !== undefined) values.status = patch.status;
  if (patch.lastError !== undefined) values.lastError = patch.lastError;
  if (patch.firedTriggers !== undefined) values.firedTriggers = JSON.stringify(patch.firedTriggers);
  if (patch.settledAt !== undefined) values.settledAt = patch.settledAt;
  if (patch.lastPolledAt !== undefined) values.lastPolledAt = patch.lastPolledAt;
  if (patch.bindingApprovedAt !== undefined) values.bindingApprovedAt = patch.bindingApprovedAt;
  await getDb().update(liveCards).set(values).where(eq(liveCards.id, id));
  const card = await getCard(id);
  if (!card) throw new Error(`No card ${id}`);
  return card;
}

/**
 * Pin a card. At the cap, nothing changes and the pinned set comes back so
 * the human can choose what to drop — unless `replaceId` names one to unpin
 * in the same move.
 */
export async function pinCard(id: string, replaceId?: string): Promise<PinResult> {
  const card = await getCard(id);
  if (!card) throw new Error(`No card ${id}`);
  if (card.pinnedAt !== null) return { ok: true, card };

  if (replaceId) await unpinCard(replaceId);
  const pinned = await listPinned();
  if (pinned.length >= MAX_PINNED) return { ok: false, reason: 'cap', pinned };

  const last = pinned.at(-1)?.pinOrder ?? -1;
  const now = Date.now();
  await getDb()
    .update(liveCards)
    .set({ pinnedAt: now, pinOrder: last + 1, updatedAt: now })
    .where(eq(liveCards.id, id));
  return { ok: true, card: (await getCard(id))! };
}

/**
 * Back to its origin Session. An orphan has nowhere to go back to, so
 * unpinning it dismisses it. Returns the card, or null when it was dismissed.
 */
export async function unpinCard(id: string): Promise<LiveCard | null> {
  const card = await getCard(id);
  if (!card) return null;
  if (card.originSessionId === null) {
    await dismissCard(id);
    return null;
  }
  await getDb()
    .update(liveCards)
    .set({ pinnedAt: null, pinOrder: null, updatedAt: Date.now() })
    .where(eq(liveCards.id, id));
  return getCard(id);
}

/** Rewrite pin order to match `ids`; pinned cards not listed keep their place after them. */
export async function reorderPinned(ids: string[]): Promise<LiveCard[]> {
  const pinned = await listPinned();
  const known = new Set(pinned.map((c) => c.id));
  const ordered = [
    ...ids.filter((id) => known.has(id)),
    ...pinned.map((c) => c.id).filter((id) => !ids.includes(id)),
  ];
  const db = getDb();
  await Promise.all(
    ordered.map((id, i) => db.update(liveCards).set({ pinOrder: i }).where(eq(liveCards.id, id))),
  );
  return listPinned();
}

export async function dismissCard(id: string): Promise<void> {
  const now = Date.now();
  await getDb()
    .update(liveCards)
    .set({ dismissedAt: now, pinnedAt: null, pinOrder: null, updatedAt: now })
    .where(eq(liveCards.id, id));
}

/**
 * Delete unpinned cards whose Session is gone. Pinned orphans stay: the human
 * chose to keep them. Returns the swept ids so the UI can drop them.
 */
export async function sweepOrphans(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ id: liveCards.id })
    .from(liveCards)
    .where(and(isNull(liveCards.originSessionId), isNull(liveCards.pinnedAt)));
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) await db.delete(liveCards).where(inArray(liveCards.id, ids));
  return ids;
}

/** Give an orphan a new home: the Session and run started from it. */
export async function rehomeCard(id: string, sessionId: string, runId: string): Promise<LiveCard> {
  await getDb()
    .update(liveCards)
    .set({ originSessionId: sessionId, originRunId: runId, updatedAt: Date.now() })
    .where(eq(liveCards.id, id));
  const card = await getCard(id);
  if (!card) throw new Error(`No card ${id}`);
  return card;
}
