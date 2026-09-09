/**
 * Session memory repository — the shared brain's storage. Append-only with
 * `supersedes`: an edit inserts a new row and flips the prior row to
 * `superseded`, preserving how a fact evolved. Returns plain
 * `shared/session-memory` shapes; no Drizzle rows escape. Async (libSQL).
 */

import { randomUUID } from 'node:crypto';
import { and, eq, asc, desc, like, or } from 'drizzle-orm';
import { getDb } from '../db/client';
import { sessionMemory, type SessionMemoryRow } from '../db/schema';
import { touchSession } from './sessions';
import type {
  MemoryAuthor,
  MemoryKind,
  MemoryStatus,
  RecallQuery,
  RememberInput,
  SessionMemoryEntry,
} from '@shared/session-memory';

function toEntry(row: SessionMemoryRow): SessionMemoryEntry {
  return {
    id: row.id,
    sessionId: row.sessionId,
    runId: row.runId,
    cwd: row.cwd,
    kind: row.kind as MemoryKind,
    title: row.title,
    body: row.body,
    tags: parseTags(row.tags),
    status: row.status as MemoryStatus,
    supersedesId: row.supersedesId,
    createdBy: row.createdBy as MemoryAuthor,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseTags(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Write an entry. If `supersedesId` is given, retire that entry first. */
export async function remember(input: RememberInput): Promise<SessionMemoryEntry> {
  const db = getDb();
  const now = Date.now();

  if (input.supersedesId) {
    await db
      .update(sessionMemory)
      .set({ status: 'superseded', updatedAt: now })
      .where(eq(sessionMemory.id, input.supersedesId))
      .run();
  }

  const row: SessionMemoryRow = {
    id: randomUUID(),
    sessionId: input.sessionId,
    runId: input.runId ?? null,
    cwd: input.cwd ?? null,
    kind: input.kind,
    title: input.title.trim() || 'Untitled',
    body: input.body?.trim() ?? '',
    tags: input.tags && input.tags.length > 0 ? JSON.stringify(input.tags) : null,
    status: 'active',
    supersedesId: input.supersedesId ?? null,
    createdBy: input.createdBy ?? 'agent',
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(sessionMemory).values(row).run();
  await touchSession(input.sessionId);
  return toEntry(row);
}

/** Read entries for a run's on-demand `recall` tool. Active only, newest first. */
export async function recall(query: RecallQuery): Promise<SessionMemoryEntry[]> {
  const filters = [eq(sessionMemory.sessionId, query.sessionId), eq(sessionMemory.status, 'active')];
  if (query.kind) filters.push(eq(sessionMemory.kind, query.kind));
  if (query.query?.trim()) {
    const needle = `%${query.query.trim()}%`;
    const match = or(like(sessionMemory.title, needle), like(sessionMemory.body, needle));
    if (match) filters.push(match);
  }
  const rows = await getDb()
    .select()
    .from(sessionMemory)
    .where(and(...filters))
    .orderBy(desc(sessionMemory.createdAt))
    .all();
  return rows.map(toEntry);
}

/** Active entries for a session, oldest first — the source for the digest. */
export async function listActiveBySession(sessionId: string): Promise<SessionMemoryEntry[]> {
  const rows = await getDb()
    .select()
    .from(sessionMemory)
    .where(and(eq(sessionMemory.sessionId, sessionId), eq(sessionMemory.status, 'active')))
    .orderBy(asc(sessionMemory.createdAt))
    .all();
  return rows.map(toEntry);
}

/** Every entry for a session (including superseded), for the Brain panel. */
export async function listBySession(sessionId: string): Promise<SessionMemoryEntry[]> {
  const rows = await getDb()
    .select()
    .from(sessionMemory)
    .where(eq(sessionMemory.sessionId, sessionId))
    .orderBy(desc(sessionMemory.createdAt))
    .all();
  return rows.map(toEntry);
}
