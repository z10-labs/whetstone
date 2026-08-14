/**
 * Session repository. Returns plain `shared/models` shapes — no Drizzle rows
 * escape this layer. libSQL is async, so every operation returns a Promise.
 */

import { randomUUID } from 'node:crypto';
import { eq, desc } from 'drizzle-orm';
import { getDb } from '../db/client';
import { sessions, type SessionRow } from '../db/schema';
import { listRunsBySession } from './runs';
import type { Session, SessionWithRuns } from '@shared/models';
import type { CreateSessionInput, UpdateSessionInput } from '@shared/ipc';

const DEFAULT_COLOR = 'slate';

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listSessions(): Promise<Session[]> {
  const rows = await getDb().select().from(sessions).orderBy(desc(sessions.updatedAt)).all();
  return rows.map(toSession);
}

export async function createSession(input: CreateSessionInput): Promise<Session> {
  const now = Date.now();
  const row: SessionRow = {
    id: randomUUID(),
    name: input.name.trim() || 'Untitled session',
    description: input.description?.trim() || null,
    color: input.color || DEFAULT_COLOR,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().insert(sessions).values(row).run();
  return toSession(row);
}

export async function getSessionWithRuns(id: string): Promise<SessionWithRuns | null> {
  const row = await getDb().select().from(sessions).where(eq(sessions.id, id)).get();
  if (!row) return null;
  return { ...toSession(row), runs: await listRunsBySession(id) };
}

export async function updateSession(input: UpdateSessionInput): Promise<Session> {
  const db = getDb();
  const existing = await db.select().from(sessions).where(eq(sessions.id, input.id)).get();
  if (!existing) throw new Error(`Session not found: ${input.id}`);

  const next: SessionRow = {
    ...existing,
    name: input.name?.trim() || existing.name,
    description:
      input.description === undefined ? existing.description : input.description?.trim() || null,
    color: input.color || existing.color,
    updatedAt: Date.now(),
  };
  await db.update(sessions).set(next).where(eq(sessions.id, input.id)).run();
  return toSession(next);
}

/** Touch a session's updatedAt (called when its runs change). */
export async function touchSession(id: string): Promise<void> {
  await getDb().update(sessions).set({ updatedAt: Date.now() }).where(eq(sessions.id, id)).run();
}

export async function deleteSession(id: string): Promise<void> {
  // ON DELETE CASCADE removes the session's runs and their events.
  await getDb().delete(sessions).where(eq(sessions.id, id)).run();
}
