/**
 * AgentRun + RunEvent repository. The event log is append-only with a
 * per-run monotonic `seq`. Returns plain `shared/models` shapes. Async (libSQL).
 */

import { randomUUID } from 'node:crypto';
import { and, eq, asc, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { agentRuns, runEvents, type AgentRunRow, type RunEventRow } from '../db/schema';
import { touchSession } from './sessions';
import type {
  AgentRun,
  RunEvent,
  RunEventKind,
  RunMode,
  RunOrigin,
  RunStatus,
  ProviderId,
} from '@shared/models';
import type { CreateRunInput } from '@shared/ipc';

const DEFAULT_PROVIDER: ProviderId = 'claude-code';

function toRun(row: AgentRunRow): AgentRun {
  return {
    id: row.id,
    sessionId: row.sessionId,
    provider: row.provider as ProviderId,
    mode: row.mode as RunMode,
    externalId: row.externalId,
    origin: row.origin as RunOrigin,
    title: row.title,
    status: row.status as RunStatus,
    cwd: row.cwd,
    model: row.model,
    messageCount: row.messageCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toEvent(row: RunEventRow): RunEvent {
  return {
    id: row.id,
    runId: row.runId,
    seq: row.seq,
    kind: row.kind as RunEventKind,
    text: row.text,
    toolName: row.toolName,
    data: row.data ? safeParse(row.data) : null,
    createdAt: row.createdAt,
  };
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}

export async function listRunsBySession(sessionId: string): Promise<AgentRun[]> {
  const rows = await getDb()
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.sessionId, sessionId))
    .orderBy(asc(agentRuns.createdAt))
    .all();
  return rows.map(toRun);
}

export async function getRun(id: string): Promise<AgentRun | null> {
  const row = await getDb().select().from(agentRuns).where(eq(agentRuns.id, id)).get();
  return row ? toRun(row) : null;
}

export async function createRun(input: CreateRunInput): Promise<AgentRun> {
  const now = Date.now();
  const row: AgentRunRow = {
    id: randomUUID(),
    sessionId: input.sessionId,
    provider: DEFAULT_PROVIDER,
    mode: input.mode,
    externalId: null,
    origin: 'launched',
    title: input.title?.trim() || (input.mode === 'terminal' ? 'Terminal' : 'New run'),
    status: 'idle',
    cwd: input.cwd,
    model: null,
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().insert(agentRuns).values(row).run();
  await touchSession(input.sessionId);
  return toRun(row);
}

async function patchRun(id: string, patch: Partial<AgentRunRow>): Promise<AgentRun> {
  const db = getDb();
  const existing = await db.select().from(agentRuns).where(eq(agentRuns.id, id)).get();
  if (!existing) throw new Error(`Run not found: ${id}`);
  const next: AgentRunRow = { ...existing, ...patch, updatedAt: Date.now() };
  await db.update(agentRuns).set(next).where(eq(agentRuns.id, id)).run();
  return toRun(next);
}

export function setRunStatus(id: string, status: RunStatus): Promise<AgentRun> {
  return patchRun(id, { status });
}

/** Record the provider's native session id + model (from the init event). */
export function setRunExternal(id: string, externalId: string, model: string | null): Promise<AgentRun> {
  return patchRun(id, { externalId, model });
}

/** Record only the native session id (terminal runs capture this separately). */
export function setRunExternalId(id: string, externalId: string): Promise<AgentRun> {
  return patchRun(id, { externalId });
}

export function setRunTitle(id: string, title: string): Promise<AgentRun> {
  return patchRun(id, { title: title.trim() || 'New run' });
}

export async function moveRun(runId: string, toSessionId: string): Promise<AgentRun> {
  const run = await getRun(runId);
  if (!run) throw new Error(`Run not found: ${runId}`);
  const moved = await patchRun(runId, { sessionId: toSessionId });
  await touchSession(run.sessionId);
  await touchSession(toSessionId);
  return moved;
}

interface AppendEventInput {
  kind: RunEventKind;
  text?: string | null;
  toolName?: string | null;
  data?: unknown;
  /** Source jsonl line uuid, for mirrored terminal events (dedup on re-tail). */
  sourceUuid?: string | null;
}

export async function appendEvent(runId: string, input: AppendEventInput): Promise<RunEvent> {
  const db = getDb();
  const seqRow = await db
    .select({ max: sql<number>`COALESCE(MAX(${runEvents.seq}), -1)` })
    .from(runEvents)
    .where(eq(runEvents.runId, runId))
    .get();
  const seq = (seqRow?.max ?? -1) + 1;

  const row: RunEventRow = {
    id: randomUUID(),
    runId,
    seq,
    kind: input.kind,
    text: input.text ?? null,
    toolName: input.toolName ?? null,
    data: input.data === undefined || input.data === null ? null : JSON.stringify(input.data),
    sourceUuid: input.sourceUuid ?? null,
    createdAt: Date.now(),
  };
  await db.insert(runEvents).values(row).run();

  // Denormalized counter for cheap list rendering (system events don't count).
  if (input.kind !== 'system') {
    await db
      .update(agentRuns)
      .set({ messageCount: sql`${agentRuns.messageCount} + 1`, updatedAt: Date.now() })
      .where(eq(agentRuns.id, runId))
      .run();
  }
  return toEvent(row);
}

export async function listEvents(runId: string): Promise<RunEvent[]> {
  const rows = await getDb()
    .select()
    .from(runEvents)
    .where(eq(runEvents.runId, runId))
    .orderBy(asc(runEvents.seq))
    .all();
  return rows.map(toEvent);
}

/** Source uuids already mirrored for a run, so re-tailing never double-inserts. */
export async function listEventSourceUuids(runId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ sourceUuid: runEvents.sourceUuid })
    .from(runEvents)
    .where(eq(runEvents.runId, runId))
    .all();
  const set = new Set<string>();
  for (const row of rows) if (row.sourceUuid) set.add(row.sourceUuid);
  return set;
}

/** Guard used by the agent runner: is there already a run for this external id? */
export async function getRunByExternalId(
  provider: ProviderId,
  externalId: string,
): Promise<AgentRun | null> {
  const row = await getDb()
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.provider, provider), eq(agentRuns.externalId, externalId)))
    .get();
  return row ? toRun(row) : null;
}
