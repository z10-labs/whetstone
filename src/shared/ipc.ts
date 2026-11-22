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
import type { BrainItem, CaptureBrainInput, SetMissionInput, UpdateBrainInput } from './brain';
import type { CreateDockTerminalInput, DockTerminal } from './terminals';
import type { HippomemQueryInput, HippomemView } from './hippomem';

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
  BrainSetMission: 'brain:set-mission',
  BrainMirrorPath: 'brain:mirror-path',
  AgentStart: 'agent:start',
  AgentCancel: 'agent:cancel',
  AgentAnswer: 'agent:answer',
  DialogPickDirectory: 'dialog:pick-directory',
  TerminalAttach: 'terminal:attach',
  TerminalInput: 'terminal:input',
  TerminalResize: 'terminal:resize',
  TerminalKill: 'terminal:kill',
  DockList: 'dock:list',
  DockCreate: 'dock:create',
  DockRestart: 'dock:restart',
  DockClose: 'dock:close',
  HippomemDecisions: 'hippomem:decisions',
  HippomemQuery: 'hippomem:query',
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
  /** Raw PTY output for any terminal: { terminalId, data }. */
  TerminalData: 'stream:terminal-data',
  /** A terminal's PTY exited: { terminalId, exitCode }. */
  TerminalExit: 'stream:terminal-exit',
  /** The dock's terminals changed — carries every dock terminal. */
  DockChanged: 'stream:dock-changed',
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

/**
 * Attach to a terminal by id: a terminal run's id or a dock terminal's id.
 * Main decides what to launch and where from its own records — the renderer
 * never supplies a command or a directory here.
 */
export interface TerminalAttachInput {
  terminalId: string;
  cols: number;
  rows: number;
}

export interface TerminalResizeInput {
  terminalId: string;
  cols: number;
  rows: number;
}

/** Payload of the TerminalData stream event. */
export interface TerminalDataPayload {
  terminalId: string;
  data: string;
}

/** Payload of the TerminalExit stream event. */
export interface TerminalExitPayload {
  terminalId: string;
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
    /** Set or rewrite a Session's mission (created on demand). */
    setMission(input: SetMissionInput): Promise<BrainItem>;
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
    /** Attach to (spawning if needed) the PTY for a terminal run or dock tab. */
    attach(input: TerminalAttachInput): Promise<void>;
    /** Send user keystrokes to the PTY. */
    input(terminalId: string, data: string): void;
    /** Resize the PTY. */
    resize(input: TerminalResizeInput): void;
    /** Terminate the PTY. */
    kill(terminalId: string): void;
  };
  dock: {
    /** Every shell/command tab, across Sessions. */
    list(): Promise<DockTerminal[]>;
    /** Open a tab; its PTY starts when a view attaches. */
    create(input: CreateDockTerminalInput): Promise<DockTerminal>;
    /** Start an exited tab again, in place. */
    restart(id: string): Promise<DockTerminal>;
    /** Kill the PTY and drop the tab. */
    close(id: string): Promise<void>;
  };
  hippomem: {
    /** Decisions in force, with the repo `cwd` belongs to. */
    decisions(cwd: string): Promise<HippomemView>;
    /** Search decisions, scoped to the repo `cwd` belongs to. */
    query(input: HippomemQueryInput): Promise<HippomemView>;
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
  /** Subscribe to dock changes. Returns an unsubscribe function. */
  onDockChanged(listener: (terminals: DockTerminal[]) => void): () => void;
  /** Subscribe to spec-review updates. Returns an unsubscribe function. */
  onExplainPrUpdated(listener: (detail: SpecReviewDetail) => void): () => void;
  /** Subscribe to brain changes (edits elsewhere, reminders firing). */
  onBrainChanged(listener: (items: BrainItem[]) => void): () => void;
}
