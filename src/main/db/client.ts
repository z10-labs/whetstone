/**
 * SQLite via libSQL (@libsql/client) + Drizzle. libSQL is a Node-API (N-API)
 * module: ABI-stable across Node and Electron, so it needs no per-runtime
 * native rebuild — the reason we use it over better-sqlite3 in an Electron
 * main process. Storage is a local file; the same client can later point at a
 * remote libSQL/Turso URL without touching the repositories.
 *
 * Schema is bootstrapped with idempotent DDL on boot (see note in the plan) —
 * the Drizzle schema in `schema.ts` stays the source of truth for queries.
 */

import { app } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';

const BOOTSTRAP_DDL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT NOT NULL DEFAULT 'slate',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,
  mode          TEXT NOT NULL DEFAULT 'sdk',
  external_id   TEXT,
  origin        TEXT NOT NULL DEFAULT 'launched',
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'idle',
  cwd           TEXT NOT NULL,
  model         TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_runs_session_idx ON agent_runs(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS agent_runs_provider_external_idx
  ON agent_runs(provider, external_id);

CREATE TABLE IF NOT EXISTS run_events (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  text        TEXT,
  tool_name   TEXT,
  data        TEXT,
  source_uuid TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS run_events_run_seq_idx ON run_events(run_id, seq);
`;

/**
 * Additive, idempotent column migrations for databases created before a column
 * existed. `CREATE TABLE IF NOT EXISTS` never alters an existing table, so new
 * columns are added here.
 */
async function ensureColumns(client: Client): Promise<void> {
  const runs = await client.execute('PRAGMA table_info(agent_runs)');
  const runCols = new Set(runs.rows.map((r) => String(r.name)));
  if (!runCols.has('mode')) {
    await client.execute("ALTER TABLE agent_runs ADD COLUMN mode TEXT NOT NULL DEFAULT 'sdk'");
  }

  const events = await client.execute('PRAGMA table_info(run_events)');
  const eventCols = new Set(events.rows.map((r) => String(r.name)));
  if (!eventCols.has('source_uuid')) {
    await client.execute('ALTER TABLE run_events ADD COLUMN source_uuid TEXT');
  }
  // Created here (not in bootstrap) so the column is guaranteed to exist first.
  await client.execute(
    'CREATE INDEX IF NOT EXISTS run_events_source_uuid_idx ON run_events(run_id, source_uuid)',
  );
}

export type Db = LibSQLDatabase<typeof schema>;

let dbSingleton: Db | null = null;
let clientSingleton: Client | null = null;

/** Open the database and bootstrap the schema. Call once at app startup. */
export async function initDb(): Promise<Db> {
  if (dbSingleton) return dbSingleton;

  const dir = join(app.getPath('userData'), 'whetstone');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'whetstone.db');

  const client = createClient({ url: `file:${file}` });
  await client.executeMultiple(BOOTSTRAP_DDL);
  await ensureColumns(client);

  clientSingleton = client;
  dbSingleton = drizzle(client, { schema });
  return dbSingleton;
}

/** Access the initialized database. Throws if `initDb()` hasn't run. */
export function getDb(): Db {
  if (!dbSingleton) throw new Error('Database not initialized — call initDb() first');
  return dbSingleton;
}

/** Close the underlying connection on shutdown. */
export function closeDb(): void {
  clientSingleton?.close();
  clientSingleton = null;
  dbSingleton = null;
}
