/**
 * The IPC contract between renderer and main. This is the single typed
 * surface the preload bridge exposes on `window.whetstone`. Keeping it in
 * one shared file means the renderer and main can never drift apart.
 */

import type { AgentRun, RunEvent, Session, SessionWithRuns } from './models';

/** Channel names for request/response (ipcRenderer.invoke) calls. */
export const IpcChannel = {
  SessionsList: 'sessions:list',
  SessionsCreate: 'sessions:create',
  SessionsGet: 'sessions:get',
  SessionsUpdate: 'sessions:update',
  SessionsDelete: 'sessions:delete',
  RunsCreate: 'runs:create',
  RunsListEvents: 'runs:list-events',
  RunsMove: 'runs:move',
  AgentStart: 'agent:start',
  AgentCancel: 'agent:cancel',
  DialogPickDirectory: 'dialog:pick-directory',
} as const;

/** Channel names for main → renderer streaming (webContents.send). */
export const IpcEvent = {
  /** A newly persisted RunEvent for a live run. */
  RunEvent: 'stream:run-event',
  /** A run's status/metadata changed (e.g. externalId assigned, completed). */
  RunUpdated: 'stream:run-updated',
} as const;

export interface CreateSessionInput {
  name: string;
  description?: string | null;
  color?: string;
}

export interface UpdateSessionInput {
  id: string;
  name?: string;
  description?: string | null;
  color?: string;
}

export interface CreateRunInput {
  sessionId: string;
  cwd: string;
  title?: string;
}

export interface StartAgentInput {
  runId: string;
  prompt: string;
}

/**
 * The API shape exposed to the renderer via `window.whetstone`.
 * Every method is async and crosses the process boundary.
 */
export interface WhetstoneApi {
  sessions: {
    list(): Promise<Session[]>;
    create(input: CreateSessionInput): Promise<Session>;
    get(id: string): Promise<SessionWithRuns | null>;
    update(input: UpdateSessionInput): Promise<Session>;
    remove(id: string): Promise<void>;
  };
  runs: {
    create(input: CreateRunInput): Promise<AgentRun>;
    listEvents(runId: string): Promise<RunEvent[]>;
    move(runId: string, toSessionId: string): Promise<AgentRun>;
  };
  agent: {
    start(input: StartAgentInput): Promise<void>;
    cancel(runId: string): Promise<void>;
  };
  dialog: {
    /** Native folder picker. Returns the chosen absolute path, or null. */
    pickDirectory(): Promise<string | null>;
  };
  /** Subscribe to live run events. Returns an unsubscribe function. */
  onRunEvent(listener: (event: RunEvent) => void): () => void;
  /** Subscribe to run metadata updates. Returns an unsubscribe function. */
  onRunUpdated(listener: (run: AgentRun) => void): () => void;
}
