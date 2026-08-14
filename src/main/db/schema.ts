/**
 * Drizzle schema — the storage shape of the domain model in `shared/models.ts`.
 * SQLite via better-sqlite3. Timestamps are epoch-millis integers; JSON blobs
 * are stored as text. Drizzle never leaves the repository layer.
 */

import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color').notNull().default('slate'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const agentRuns = sqliteTable(
  'agent_runs',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    mode: text('mode').notNull().default('sdk'),
    externalId: text('external_id'),
    origin: text('origin').notNull().default('launched'),
    title: text('title').notNull(),
    status: text('status').notNull().default('idle'),
    cwd: text('cwd').notNull(),
    model: text('model'),
    messageCount: integer('message_count').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('agent_runs_session_idx').on(t.sessionId),
    // Reconciliation key: a launched run and a future imported copy share
    // (provider, external_id) and must never duplicate.
    uniqueIndex('agent_runs_provider_external_idx').on(t.provider, t.externalId),
  ],
);

export const runEvents = sqliteTable(
  'run_events',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    kind: text('kind').notNull(),
    text: text('text'),
    toolName: text('tool_name'),
    data: text('data'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('run_events_run_seq_idx').on(t.runId, t.seq)],
);

export type SessionRow = typeof sessions.$inferSelect;
export type AgentRunRow = typeof agentRuns.$inferSelect;
export type RunEventRow = typeof runEvents.$inferSelect;
