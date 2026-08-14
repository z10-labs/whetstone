/**
 * Core domain model for whetstone, shared between the main (Node) and
 * renderer (React) processes. These are plain serializable shapes — no
 * Drizzle, no Electron types leak across the IPC boundary.
 *
 * The hierarchy is the foundation everything else builds on:
 *
 *   Session  (a grouping of related work)
 *     └─ AgentRun   (one driven agent conversation — provider + external id)
 *          └─ RunEvent  (one structured message/tool-use in that run)
 */

export type RunStatus = 'idle' | 'running' | 'completed' | 'error' | 'canceled';

/** How a run entered whetstone. `launched` = we drove it via an SDK/CLI. */
export type RunOrigin = 'launched' | 'imported';

/**
 * How a run is driven — the experiment axis:
 *  - `sdk`      structured drive via the Claude Agent SDK (normalized events)
 *  - `terminal` a live PTY running the `claude` CLI, streamed to an xterm view
 */
export type RunMode = 'sdk' | 'terminal';

/** Identifier of the agent backend that produced a run. */
export type ProviderId = 'claude-code';

export interface Session {
  id: string;
  name: string;
  description: string | null;
  /** Accent color token used by the UI (e.g. "amber", "violet"). */
  color: string;
  createdAt: number;
  updatedAt: number;
}

export interface AgentRun {
  id: string;
  sessionId: string;
  provider: ProviderId;
  mode: RunMode;
  /** The provider's own session id (e.g. Claude Agent SDK session_id). */
  externalId: string | null;
  origin: RunOrigin;
  title: string;
  status: RunStatus;
  /** Working directory the agent runs in. */
  cwd: string;
  model: string | null;
  /** Denormalized counters for cheap list rendering. */
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

/** Kinds of structured events we persist from a run's stream. */
export type RunEventKind =
  | 'user'
  | 'assistant_text'
  | 'assistant_thinking'
  | 'tool_use'
  | 'tool_result'
  | 'system'
  | 'result'
  | 'error'
  | 'ask'
  | 'answer';

/** One selectable option for an `ask_user` question. */
export interface AskOption {
  label: string;
  description?: string;
  /** Optional richer preview text (mirrors the SDK's AskUserQuestion preview). */
  preview?: string;
}

/** Payload the agent sends when it asks the human a clarifying question. */
export interface AskUserRequest {
  question: string;
  options?: AskOption[];
  multiSelect?: boolean;
}

/** The `data` shape stored on an `ask` RunEvent. */
export interface AskEventData extends AskUserRequest {
  questionId: string;
}

export interface RunEvent {
  id: string;
  runId: string;
  seq: number;
  kind: RunEventKind;
  /** Human-readable text payload (assistant text, user prompt, error message). */
  text: string | null;
  /** Tool name for tool_use / tool_result events. */
  toolName: string | null;
  /** Structured payload (tool input, usage, raw block) as JSON. */
  data: unknown | null;
  createdAt: number;
}

/** A Session together with its runs, for detail views. */
export interface SessionWithRuns extends Session {
  runs: AgentRun[];
}
