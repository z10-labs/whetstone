/**
 * Brain repository — storage for the human's jots, tasks, reminders and each
 * Session's mission. Returns plain `shared/brain` shapes; no Drizzle rows
 * escape. Async (libSQL).
 *
 * Every read joins the Session name so a linked entry can say where it
 * belongs without a second round trip. Reads are deliberately narrow: the
 * board only ever shows live work plus a short tail of finished entries. A
 * brain that grows without bound stops being a brain, so `listBrain` drops
 * anything finished longer ago than `DONE_WINDOW_MS` rather than paginating.
 */

import { randomUUID } from 'node:crypto';
import { and, asc, eq, gte, inArray, isNull, like, lte, or } from 'drizzle-orm';
import { getDb } from '../db/client';
import { brainItems, sessions, type BrainItemRow } from '../db/schema';
import {
  DONE_WINDOW_MS,
  type BrainAuthor,
  type BrainItem,
  type BrainKind,
  type BrainStatus,
  type CaptureBrainInput,
  type SetMissionInput,
  type UpdateBrainInput,
} from '@shared/brain';

const LIVE: BrainStatus[] = ['open', 'doing'];
const FINISHED: BrainStatus[] = ['done', 'dropped'];

interface Joined {
  item: BrainItemRow;
  sessionName: string | null;
}

function toItem({ item: row, sessionName }: Joined): BrainItem {
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
    sessionName,
    createdBy: row.createdBy as BrainAuthor,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Every read goes through here so the Session name always rides along. */
function selectJoined() {
  return getDb()
    .select({ item: brainItems, sessionName: sessions.name })
    .from(brainItems)
    .leftJoin(sessions, eq(brainItems.sessionId, sessions.id));
}

/**
 * Everything the board shows: all live entries, plus entries finished inside
 * the done window. Oldest first — the UI sorts each lane for itself.
 */
export async function listBrain(now: number = Date.now()): Promise<BrainItem[]> {
  const live = inArray(brainItems.status, LIVE);
  const recentlyFinished = and(
    inArray(brainItems.status, FINISHED),
    gte(brainItems.updatedAt, now - DONE_WINDOW_MS),
  );
  const rows = await selectJoined()
    .where(or(live, recentlyFinished))
    .orderBy(asc(brainItems.createdAt))
    .all();
  return rows.map(toItem);
}

/** Live entries linked to one Session, mission included. Oldest first. */
export async function listBrainBySession(sessionId: string): Promise<BrainItem[]> {
  const rows = await selectJoined()
    .where(and(eq(brainItems.sessionId, sessionId), inArray(brainItems.status, LIVE)))
    .orderBy(asc(brainItems.createdAt))
    .all();
  return rows.map(toItem);
}

/** Read one entry, or null if it is gone. */
export async function getBrainItem(id: string): Promise<BrainItem | null> {
  const rows = await selectJoined().where(eq(brainItems.id, id)).all();
  return rows.length > 0 ? toItem(rows[0]) : null;
}

/**
 * Resolve the reference an agent quotes: a full id, or the short
 * `id:8f2a1c` form from the mirror and the digest. Null if nothing matches;
 * an error if a short reference is ambiguous. Ids are hex, so anything else
 * (including LIKE wildcards) is simply not an id. With `sessionId`, only that
 * Session's entries can be found — the boundary the agent tool relies on.
 */
export async function findBrainItemByShortId(
  ref: string,
  sessionId?: string,
): Promise<BrainItem | null> {
  const raw = ref.trim().replace(/^id:/i, '');
  if (!raw || !/^[0-9a-f-]+$/i.test(raw)) return null;
  const within = sessionId ? eq(brainItems.sessionId, sessionId) : undefined;
  const match = raw.length >= 32 ? eq(brainItems.id, raw) : like(brainItems.id, `${raw}%`);
  const rows = await selectJoined().where(and(match, within)).all();
  if (rows.length > 1) throw new Error(`Brain reference ${raw} is ambiguous`);
  return rows.length === 1 ? toItem(rows[0]) : null;
}

/** A Session's live mission, or null if it has none. */
export async function getMission(sessionId: string): Promise<BrainItem | null> {
  const rows = await selectJoined()
    .where(
      and(
        eq(brainItems.sessionId, sessionId),
        eq(brainItems.kind, 'mission'),
        inArray(brainItems.status, LIVE),
      ),
    )
    .all();
  return rows.length > 0 ? toItem(rows[0]) : null;
}

/** Write a new entry. Empty titles are rejected — a spark needs words. */
export async function captureBrainItem(input: CaptureBrainInput): Promise<BrainItem> {
  if (input.kind === 'mission') {
    if (!input.sessionId) throw new Error('A mission needs a Session');
    return setMission({ sessionId: input.sessionId, title: input.title, body: input.body });
  }
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
  return (await getBrainItem(row.id)) as BrainItem;
}

/**
 * Set or rewrite a Session's mission. One per Session: if a live mission
 * exists it is edited in place, otherwise one is created with the Session's
 * own name as the goal until the human rewords it. The unique index on live
 * missions is the real guard: if two callers race past the read, the second
 * insert fails and falls back to editing the winner.
 */
export async function setMission(input: SetMissionInput): Promise<BrainItem> {
  const existing = await getMission(input.sessionId);
  if (existing) {
    return updateBrainItem({ id: existing.id, title: input.title, body: input.body });
  }
  try {
    return await insertMission(input);
  } catch (err) {
    const raced = await getMission(input.sessionId);
    if (!raced) throw err;
    return updateBrainItem({ id: raced.id, title: input.title, body: input.body });
  }
}

async function insertMission(input: SetMissionInput): Promise<BrainItem> {
  const session = await getDb()
    .select({ name: sessions.name })
    .from(sessions)
    .where(eq(sessions.id, input.sessionId))
    .get();
  if (!session) throw new Error(`Session ${input.sessionId} not found`);

  const now = Date.now();
  const row: BrainItemRow = {
    id: randomUUID(),
    kind: 'mission',
    title: input.title?.trim() || session.name,
    body: input.body?.trim() ?? '',
    status: 'open',
    pinned: 0,
    dueAt: null,
    firedAt: null,
    doneAt: null,
    sessionId: input.sessionId,
    createdBy: 'human',
    createdAt: now,
    updatedAt: now,
  };
  await getDb().insert(brainItems).values(row).run();
  return (await getBrainItem(row.id)) as BrainItem;
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

/**
 * Drop a Session's mission when the Session goes. Its other entries stay,
 * unlinked by the foreign key, because a task you wrote is still a task.
 */
export async function removeMissionForSession(sessionId: string): Promise<void> {
  await getDb()
    .delete(brainItems)
    .where(and(eq(brainItems.sessionId, sessionId), eq(brainItems.kind, 'mission')))
    .run();
}

/** Sweep every finished entry off the board for good. */
export async function clearFinishedBrainItems(): Promise<void> {
  await getDb().delete(brainItems).where(inArray(brainItems.status, FINISHED)).run();
}

/**
 * Entries whose time has come and that have not been surfaced yet. The claim
 * is a single `UPDATE … RETURNING`, so stamping `firedAt` and reading the
 * winners is one statement: two overlapping ticks can never both walk away
 * with the same entry, and a reminder fires exactly once.
 */
export async function claimDueBrainItems(now: number = Date.now()): Promise<BrainItem[]> {
  // `dueAt <= now` is already false for a NULL dueAt, so undated entries
  // never match.
  const due = and(
    inArray(brainItems.status, LIVE),
    isNull(brainItems.firedAt),
    lte(brainItems.dueAt, now),
  );
  const rows = await getDb().update(brainItems).set({ firedAt: now }).where(due).returning();
  return rows.map((item) => toItem({ item, sessionName: null }));
}
