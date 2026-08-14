/**
 * The agent-provider seam. This is the extensibility point for whetstone:
 * every backend (Claude via the Agent SDK today; Codex, Cursor, imported
 * sessions tomorrow) implements `AgentProvider`. Both "drive" (launch/resume)
 * and, later, "observe" (discover) hang off this one interface.
 */

import type { AskUserRequest, ProviderId, RunEventKind } from '@shared/models';

/** Interactive callback a run can use to ask the human a question and wait. */
export type AskUserFn = (request: AskUserRequest) => Promise<string>;

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
}

export interface AgentProvider {
  id: ProviderId;
  /** Drive a run, yielding normalized events until the turn completes. */
  launch(params: LaunchParams): AsyncIterable<NormalizedAgentEvent>;
}
