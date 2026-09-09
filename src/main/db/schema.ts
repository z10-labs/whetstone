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
    /** Source line uuid for jsonl-mirrored events — used to dedup on re-tail. */
    sourceUuid: text('source_uuid'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('run_events_run_seq_idx').on(t.runId, t.seq),
    index('run_events_source_uuid_idx').on(t.runId, t.sourceUuid),
  ],
);

/**
 * Session memory — the shared "brain" for a Session. Working memory (curated,
 * session-wide), distinct from the raw per-run `run_events` log. Append-only:
 * an edit inserts a new row and points `supersedesId` at the old one, which is
 * flipped to `superseded`. The launch digest only reads `status = 'active'`.
 */
export const sessionMemory = sqliteTable(
  'session_memory',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    /** Run that authored the entry — the handover trail. */
    runId: text('run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    /** Repo/dir the fact pertains to (scoping for future relevance routing). */
    cwd: text('cwd'),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    /** JSON string[] of freeform tags. */
    tags: text('tags'),
    status: text('status').notNull().default('active'),
    /** Prior entry this one replaces (append-only edit). */
    supersedesId: text('supersedes_id'),
    createdBy: text('created_by').notNull().default('agent'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('session_memory_session_idx').on(t.sessionId, t.status),
    index('session_memory_supersedes_idx').on(t.supersedesId),
  ],
);

/**
 * The Brain — the human's local working surface: jots, tasks and reminders.
 * One table with a `kind` discriminator: the three share every column and the
 * UI reads them together, so splitting them would buy nothing. `sessionId` is
 * a seam for future Session linkage and is null for everything today.
 */
export const brainItems = sqliteTable(
  'brain_items',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    status: text('status').notNull().default('open'),
    pinned: integer('pinned').notNull().default(0),
    /** When the entry should surface (reminders always; tasks optionally). */
    dueAt: integer('due_at'),
    /** Set once the ticker surfaced it, so a reminder never fires twice. */
    firedAt: integer('fired_at'),
    doneAt: integer('done_at'),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    createdBy: text('created_by').notNull().default('human'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('brain_items_kind_status_idx').on(t.kind, t.status),
    // Drives the reminder ticker's "what has come due" scan.
    index('brain_items_due_idx').on(t.dueAt),
  ],
);

export const specReviews = sqliteTable(
  'spec_reviews',
  {
    id: text('id').primaryKey(),
    cwd: text('cwd').notNull(),
    prNumber: integer('pr_number').notNull(),
    prUrl: text('pr_url'),
    title: text('title').notNull(),
    author: text('author'),
    base: text('base'),
    head: text('head'),
    state: text('state'),
    commitCount: integer('commit_count').notNull().default(0),
    intent: text('intent'),
    status: text('status').notNull().default('fetching'),
    error: text('error'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('spec_reviews_updated_idx').on(t.updatedAt)],
);

export const specGoals = sqliteTable(
  'spec_goals',
  {
    id: text('id').primaryKey(),
    reviewId: text('review_id')
      .notNull()
      .references(() => specReviews.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    blurb: text('blurb').notNull().default(''),
    color: text('color').notNull().default('slate'),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [index('spec_goals_review_idx').on(t.reviewId)],
);

export const specFiles = sqliteTable(
  'spec_files',
  {
    id: text('id').primaryKey(),
    reviewId: text('review_id')
      .notNull()
      .references(() => specReviews.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    additions: integer('additions').notNull().default(0),
    deletions: integer('deletions').notNull().default(0),
    changeType: text('change_type').notNull().default('modified'),
    spec: text('spec'),
    connects: text('connects'),
    behaviorChange: text('behavior_change'),
    isTest: integer('is_test').notNull().default(0),
    reviewed: integer('reviewed').notNull().default(0),
    hunk: text('hunk'),
    patch: text('patch'),
  },
  (t) => [index('spec_files_review_idx').on(t.reviewId)],
);

export const specFileGoals = sqliteTable(
  'spec_file_goals',
  {
    fileId: text('file_id')
      .notNull()
      .references(() => specFiles.id, { onDelete: 'cascade' }),
    goalId: text('goal_id')
      .notNull()
      .references(() => specGoals.id, { onDelete: 'cascade' }),
  },
  (t) => [index('spec_file_goals_file_idx').on(t.fileId)],
);

export const specFileDeps = sqliteTable(
  'spec_file_deps',
  {
    id: text('id').primaryKey(),
    fileId: text('file_id')
      .notNull()
      .references(() => specFiles.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    note: text('note').notNull().default(''),
  },
  (t) => [index('spec_file_deps_file_idx').on(t.fileId)],
);

export type SessionRow = typeof sessions.$inferSelect;
export type AgentRunRow = typeof agentRuns.$inferSelect;
export type RunEventRow = typeof runEvents.$inferSelect;
export type SessionMemoryRow = typeof sessionMemory.$inferSelect;
export type BrainItemRow = typeof brainItems.$inferSelect;
export type SpecReviewRow = typeof specReviews.$inferSelect;
export type SpecGoalRow = typeof specGoals.$inferSelect;
export type SpecFileRow = typeof specFiles.$inferSelect;
export type SpecFileGoalRow = typeof specFileGoals.$inferSelect;
export type SpecFileDepRow = typeof specFileDeps.$inferSelect;
