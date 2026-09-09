/**
 * The IPC contract between renderer and main. This is the single typed
 * surface the preload bridge exposes on `window.whetstone`. Keeping it in
 * one shared file means the renderer and main can never drift apart.
 */

import type {
  GhPrListItem,
  SpecReview,
  SpecReviewDetail,
  SpecReviewListItem,
} from './explain-pr';
import type { AgentRun, RunEvent, RunMode, Session, SessionWithRuns } from './models';
import type { SessionMemoryEntry } from './session-memory';
import type { BrainItem, CaptureBrainInput, UpdateBrainInput } from './brain';

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
  MemoryListBySession: 'memory:list-by-session',
  BrainList: 'brain:list',
  BrainCapture: 'brain:capture',
  BrainUpdate: 'brain:update',
  BrainRemove: 'brain:remove',
  BrainClearFinished: 'brain:clear-finished',
  BrainMirrorPath: 'brain:mirror-path',
  AgentStart: 'agent:start',
  AgentCancel: 'agent:cancel',
  AgentAnswer: 'agent:answer',
  DialogPickDirectory: 'dialog:pick-directory',
  TerminalAttach: 'terminal:attach',
  TerminalInput: 'terminal:input',
  TerminalResize: 'terminal:resize',
  TerminalKill: 'terminal:kill',
  ExplainPrList: 'explain-pr:list',
  ExplainPrListOpen: 'explain-pr:list-open',
  ExplainPrStart: 'explain-pr:start',
  ExplainPrGet: 'explain-pr:get',
  ExplainPrSetReviewed: 'explain-pr:set-reviewed',
  ExplainPrCancel: 'explain-pr:cancel',
} as const;

/** Channel names for main → renderer streaming (webContents.send). */
export const IpcEvent = {
  /** A newly persisted RunEvent for a live run. */
  RunEvent: 'stream:run-event',
  /** A run's status/metadata changed (e.g. externalId assigned, completed). */
  RunUpdated: 'stream:run-updated',
  /** Raw PTY output for a terminal run: { runId, data }. */
  TerminalData: 'stream:terminal-data',
  /** A terminal run's PTY exited: { runId, exitCode }. */
  TerminalExit: 'stream:terminal-exit',
  /** Spec review changed (fetch progress, a new emit, reviewed toggle). */
  ExplainPrUpdated: 'stream:explain-pr-updated',
  /** The brain changed — carries the whole board, which is small by design. */
  BrainChanged: 'stream:brain-changed',
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
  mode: RunMode;
  title?: string;
}

export interface TerminalAttachInput {
  runId: string;
  cwd: string;
  cols: number;
  rows: number;
  /** Claude Code session id to resume, if this run has one. */
  resume?: string | null;
}

export interface TerminalResizeInput {
  runId: string;
  cols: number;
  rows: number;
}

/** Payload of the TerminalData stream event. */
export interface TerminalDataPayload {
  runId: string;
  data: string;
}

/** Payload of the TerminalExit stream event. */
export interface TerminalExitPayload {
  runId: string;
  exitCode: number;
}

export interface StartAgentInput {
  runId: string;
  prompt: string;
}

export interface AnswerAgentInput {
  questionId: string;
  answer: string;
}

export interface StartExplainPrInput {
  cwd: string;
  /** PR number (`178`), `#178`, or a GitHub pull URL. */
  pr: string;
}

export interface SetReviewedInput {
  reviewId: string;
  path: string;
  reviewed: boolean;
}

/**
 * The API shape exposed to the renderer via `window.whetstone`.
 * Every method is async and crosses the process boundary.
 */
export interface WhetstoneApi {
  sessions: {
    list(): Promise<SessionWithRuns[]>;
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
  memory: {
    /** The session brain: every entry (including superseded) for a session. */
    listBySession(sessionId: string): Promise<SessionMemoryEntry[]>;
  };
  brain: {
    /** Live entries plus a short tail of finished ones. */
    list(): Promise<BrainItem[]>;
    capture(input: CaptureBrainInput): Promise<BrainItem>;
    update(input: UpdateBrainInput): Promise<BrainItem>;
    remove(id: string): Promise<void>;
    /** Sweep every finished entry off the board for good. */
    clearFinished(): Promise<void>;
    /** Path of the markdown mirror agents read. */
    mirrorPath(): Promise<string>;
  };
  agent: {
    start(input: StartAgentInput): Promise<void>;
    cancel(runId: string): Promise<void>;
    /** Answer a pending ask_user question, unblocking the run. */
    answer(input: AnswerAgentInput): Promise<void>;
  };
  dialog: {
    /** Native folder picker. Returns the chosen absolute path, or null. */
    pickDirectory(): Promise<string | null>;
  };
  terminal: {
    /** Attach to (spawning if needed) the PTY for a terminal run. */
    attach(input: TerminalAttachInput): Promise<void>;
    /** Send user keystrokes to the PTY. */
    input(runId: string, data: string): void;
    /** Resize the PTY. */
    resize(input: TerminalResizeInput): void;
    /** Terminate the PTY. */
    kill(runId: string): void;
  };
  explainPr: {
    list(): Promise<SpecReviewListItem[]>;
    /** Open PRs in a local checkout, via `gh pr list`. */
    listOpen(cwd: string): Promise<GhPrListItem[]>;
    start(input: StartExplainPrInput): Promise<SpecReview>;
    get(id: string): Promise<SpecReviewDetail | null>;
    setReviewed(input: SetReviewedInput): Promise<SpecReviewDetail>;
    cancel(id: string): Promise<void>;
  };
  /** Subscribe to live run events. Returns an unsubscribe function. */
  onRunEvent(listener: (event: RunEvent) => void): () => void;
  /** Subscribe to run metadata updates. Returns an unsubscribe function. */
  onRunUpdated(listener: (run: AgentRun) => void): () => void;
  /** Subscribe to raw PTY output. Returns an unsubscribe function. */
  onTerminalData(listener: (payload: TerminalDataPayload) => void): () => void;
  /** Subscribe to PTY exit. Returns an unsubscribe function. */
  onTerminalExit(listener: (payload: TerminalExitPayload) => void): () => void;
  /** Subscribe to spec-review updates. Returns an unsubscribe function. */
  onExplainPrUpdated(listener: (detail: SpecReviewDetail) => void): () => void;
  /** Subscribe to brain changes (edits elsewhere, reminders firing). */
  onBrainChanged(listener: (items: BrainItem[]) => void): () => void;
}
