/**
 * Brain repository — storage for the human's jots, tasks and reminders.
 * Returns plain `shared/brain` shapes; no Drizzle rows escape. Async (libSQL).
 *
 * Reads are deliberately narrow: the board only ever shows live work plus a
 * short tail of finished entries. A brain that grows without bound stops being
 * a brain, so `listBrain` drops anything finished longer ago than
 * `DONE_WINDOW_MS` rather than paginating it.
 */

import { randomUUID } from 'node:crypto';
import { and, asc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { getDb } from '../db/client';
import { brainItems, type BrainItemRow } from '../db/schema';
import {
  DONE_WINDOW_MS,
  type BrainAuthor,
  type BrainItem,
  type BrainKind,
  type BrainStatus,
  type CaptureBrainInput,
  type UpdateBrainInput,
} from '@shared/brain';

const FINISHED: BrainStatus[] = ['done', 'dropped'];

function toItem(row: BrainItemRow): BrainItem {
  return {
    id: row.id,
    kind: row.kind as BrainKind,
    title: row.title,
    body: row.body,
    status: row.status as BrainStatus,
    pinned: row.pinned === 1,
    dueAt: row.dueAt,
    firedAt: row.firedAt,
    doneAt: row.doneAt,
    sessionId: row.sessionId,
    createdBy: row.createdBy as BrainAuthor,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Everything the board shows: all live entries, plus entries finished inside
 * the done window. Oldest first — the UI sorts each lane for itself.
 */
export async function listBrain(now: number = Date.now()): Promise<BrainItem[]> {
  const live = inArray(brainItems.status, ['open', 'doing']);
  const recentlyFinished = and(
    inArray(brainItems.status, FINISHED),
    gte(brainItems.updatedAt, now - DONE_WINDOW_MS),
  );
  const rows = await getDb()
    .select()
    .from(brainItems)
    .where(or(live, recentlyFinished))
    .orderBy(asc(brainItems.createdAt))
    .all();
  return rows.map(toItem);
}

/** Read one entry, or null if it is gone. */
export async function getBrainItem(id: string): Promise<BrainItem | null> {
  const rows = await getDb().select().from(brainItems).where(eq(brainItems.id, id)).all();
  return rows.length > 0 ? toItem(rows[0]) : null;
}

/** Write a new entry. Empty titles are rejected — a spark needs words. */
export async function captureBrainItem(input: CaptureBrainInput): Promise<BrainItem> {
  const title = input.title.trim();
  if (!title) throw new Error('A brain entry needs a title');

  const now = Date.now();
  const row: BrainItemRow = {
    id: randomUUID(),
    kind: input.kind,
    title,
    body: input.body?.trim() ?? '',
    status: 'open',
    pinned: 0,
    dueAt: input.dueAt ?? null,
    firedAt: null,
    doneAt: null,
    sessionId: input.sessionId ?? null,
    createdBy: input.createdBy ?? 'human',
    createdAt: now,
    updatedAt: now,
  };
  await getDb().insert(brainItems).values(row).run();
  return toItem(row);
}

/**
 * Patch an entry. Only the fields present in `input` change.
 * Finishing stamps `doneAt`; reopening clears it, and rearming a reminder
 * clears `firedAt` so the ticker can surface it again.
 */
export async function updateBrainItem(input: UpdateBrainInput): Promise<BrainItem> {
  const existing = await getBrainItem(input.id);
  if (!existing) throw new Error(`Brain entry ${input.id} not found`);

  const now = Date.now();
  const status = input.status ?? existing.status;
  const dueAt = input.dueAt === undefined ? existing.dueAt : input.dueAt;
  const isFinished = status === 'done' || status === 'dropped';
  const rescheduled = dueAt !== existing.dueAt;

  const next: BrainItem = {
    ...existing,
    title: input.title?.trim() || existing.title,
    body: input.body === undefined ? existing.body : input.body.trim(),
    status,
    pinned: input.pinned ?? existing.pinned,
    dueAt,
    // Rescheduling rearms the entry so the ticker can surface it again.
    firedAt: rescheduled ? null : existing.firedAt,
    doneAt: isFinished ? (existing.doneAt ?? now) : null,
    updatedAt: now,
  };

  await getDb()
    .update(brainItems)
    .set({
      title: next.title,
      body: next.body,
      status: next.status,
      pinned: next.pinned ? 1 : 0,
      dueAt: next.dueAt,
      firedAt: next.firedAt,
      doneAt: next.doneAt,
      updatedAt: next.updatedAt,
    })
    .where(eq(brainItems.id, next.id))
    .run();

  return next;
}

/** Delete an entry outright. The brain forgets on purpose. */
export async function removeBrainItem(id: string): Promise<void> {
  await getDb().delete(brainItems).where(eq(brainItems.id, id)).run();
}

/** Sweep every finished entry off the board for good. */
export async function clearFinishedBrainItems(): Promise<void> {
  await getDb().delete(brainItems).where(inArray(brainItems.status, FINISHED)).run();
}

/**
 * Entries whose time has come and that have not been surfaced yet. Claiming
 * them stamps `firedAt` in the same call, so a reminder fires exactly once
 * even if two ticks overlap.
 */
export async function claimDueBrainItems(now: number = Date.now()): Promise<BrainItem[]> {
  const db = getDb();
  // `dueAt <= now` is already false for a NULL dueAt, so undated entries
  // never match.
  const due = and(
    inArray(brainItems.status, ['open', 'doing']),
    isNull(brainItems.firedAt),
    lte(brainItems.dueAt, now),
  );
  const rows = await db.select().from(brainItems).where(due).all();
  if (rows.length === 0) return [];

  await db
    .update(brainItems)
    .set({ firedAt: now })
    .where(
      inArray(
        brainItems.id,
        rows.map((r) => r.id),
      ),
    )
    .run();

  return rows.map((row) => toItem({ ...row, firedAt: now }));
}
