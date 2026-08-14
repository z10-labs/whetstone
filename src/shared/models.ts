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
  | 'error';

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
