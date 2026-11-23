/**
 * The agent-provider seam. This is the extensibility point for whetstone:
 * every backend (Claude via the Agent SDK today; Codex, Cursor, imported
 * sessions tomorrow) implements `AgentProvider`. Both "drive" (launch/resume)
 * and, later, "observe" (discover) hang off this one interface.
 */

import type { AskUserRequest, ProviderId, RunEventKind } from '@shared/models';
import type { MemoryKind, SessionMemoryEntry } from '@shared/session-memory';
import type { BrainToolInput } from '../brain/agent-tool';
import type { CardToolInput } from '../cards/agent-tool';

/** Interactive callback a run can use to ask the human a question and wait. */
export type AskUserFn = (request: AskUserRequest) => Promise<string>;

/** What the agent supplies to the `remember` tool (run/session are stamped by the runner). */
export interface RememberToolInput {
  kind: MemoryKind;
  title: string;
  body?: string;
  tags?: string[];
  cwd?: string | null;
  supersedesId?: string | null;
}

/** Write a shared-memory entry for this run's session. Returns a compact ack. */
export type RememberFn = (
  input: RememberToolInput,
) => Promise<{ id: string; kind: MemoryKind; title: string }>;

/** Read shared-memory entries for this run's session. */
export type RecallFn = (input: {
  kind?: MemoryKind;
  query?: string;
}) => Promise<SessionMemoryEntry[]>;

/** Act on the human's Brain for this run's session. Returns a one-line ack. */
export type BrainFn = (input: BrainToolInput) => Promise<string>;

/** Create, update or close a Live Card for this run's session. Returns a one-line ack. */
export type CardFn = (input: CardToolInput) => Promise<string>;

/** SDK permission postures. v1 drives everything in 'plan' (no execution). */
export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'plan'
  | 'dontAsk'
  | 'auto';

/**
 * A normalized event yielded by a provider, before persistence. The init/system
 * event additionally carries `externalId` (provider session id) and `model` so
 * the runner can stamp them onto the AgentRow.
 */
export interface NormalizedAgentEvent {
  kind: RunEventKind;
  text?: string | null;
  toolName?: string | null;
  data?: unknown;
  externalId?: string;
  model?: string;
}

export interface LaunchParams {
  prompt: string;
  cwd: string;
  model?: string | null;
  /** Provider session id to continue a prior conversation. */
  resume?: string | null;
  permissionMode: PermissionMode;
  /** The runner owns this so it can cancel the run. */
  abortController: AbortController;
  /** If provided, expose an `ask_user` tool that routes through this. */
  askUser?: AskUserFn;
  /**
   * Compiled shared-session digest, injected into the system prompt so the
   * agent is aware of sibling runs and the shared brain before it acts.
   */
  sessionContext?: string | null;
  /** If provided, expose a `remember` tool that writes to the session brain. */
  remember?: RememberFn;
  /** If provided, expose a `recall` tool that reads the session brain. */
  recall?: RecallFn;
  /** If provided, expose a `brain` tool that writes to the human's Brain. */
  brain?: BrainFn;
  /** If provided, expose a `card` tool for Live Cards. */
  card?: CardFn;
}

export interface AgentProvider {
  id: ProviderId;
  /** Drive a run, yielding normalized events until the turn completes. */
  launch(params: LaunchParams): AsyncIterable<NormalizedAgentEvent>;
}
