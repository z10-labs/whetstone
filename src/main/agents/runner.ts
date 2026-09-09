/**
 * The run orchestrator. Owns the lifecycle of a driven run: status
 * transitions, persistence of every normalized event, stamping the provider
 * session id, live emission to the renderer, and cancellation.
 *
 * It talks to providers through the seam and to storage through the repo — it
 * has no knowledge of the SDK or of Electron. The emitter is injected so this
 * stays independently testable.
 */

import { randomUUID } from 'node:crypto';
import { getProvider, DEFAULT_MODEL, DEFAULT_PERMISSION_MODE } from './registry';
import { compileDigest } from './session-context';
import type { RecallFn, RememberFn } from './types';
import {
  appendEvent,
  getRun,
  setRunExternal,
  setRunStatus,
  setRunTitle,
} from '../repo/runs';
import { remember as rememberEntry, recall as recallEntries } from '../repo/session-memory';
import type { AgentRun, AskUserRequest, RunEvent } from '@shared/models';

export interface RunEmitter {
  onEvent(event: RunEvent): void;
  onRunUpdated(run: AgentRun): void;
}

const TITLE_MAX = 80;

/** In-flight runs, keyed by run id, so they can be cancelled. */
const active = new Map<string, AbortController>();

/** Unanswered ask_user questions, keyed by questionId. */
interface PendingAsk {
  runId: string;
  emit: RunEmitter;
  resolve: (answer: string) => void;
}
const pendingAsks = new Map<string, PendingAsk>();

export function isActive(runId: string): boolean {
  return active.has(runId);
}

export function cancelRun(runId: string): void {
  active.get(runId)?.abort();
}

/** Resolve a pending ask_user question, unblocking the run's tool call. */
export async function submitAnswer(questionId: string, answer: string): Promise<void> {
  const pending = pendingAsks.get(questionId);
  if (!pending) return;
  pendingAsks.delete(questionId);
  pending.emit.onEvent(
    await appendEvent(pending.runId, { kind: 'answer', text: answer, data: { questionId } }),
  );
  pending.resolve(answer);
}

export async function startRun(runId: string, prompt: string, emit: RunEmitter): Promise<void> {
  const run = await getRun(runId);
  if (!run) throw new Error(`Run not found: ${runId}`);
  if (active.has(runId)) throw new Error(`Run already active: ${runId}`);

  const controller = new AbortController();
  active.set(runId, controller);
  let externalStamped = Boolean(run.externalId);

  try {
    // The user's prompt is the first event of the turn.
    emit.onEvent(await appendEvent(runId, { kind: 'user', text: prompt }));

    let updated = await setRunStatus(runId, 'running');
    if (updated.title === 'New run' && prompt.trim()) {
      updated = await setRunTitle(runId, prompt.trim().slice(0, TITLE_MAX));
    }
    emit.onRunUpdated(updated);

    // Interactive ask_user: persist + stream the question, then block on the
    // human's answer arriving via submitAnswer().
    const askUser = async (request: AskUserRequest): Promise<string> => {
      const questionId = randomUUID();
      emit.onEvent(
        await appendEvent(runId, {
          kind: 'ask',
          text: request.question,
          data: { questionId, ...request },
        }),
      );
      return new Promise<string>((resolve) => {
        pendingAsks.set(questionId, { runId, emit, resolve });
      });
    };

    // Shared session brain: read the digest for injection, and wire the
    // remember/recall tools. A `remember` write is mirrored as a `memory`
    // event so it's visible in the transcript and streamed to the UI.
    const sessionContext = await compileDigest(run.sessionId, runId);

    const remember: RememberFn = async (input) => {
      const entry = await rememberEntry({
        sessionId: run.sessionId,
        runId,
        cwd: input.cwd ?? run.cwd,
        kind: input.kind,
        title: input.title,
        body: input.body,
        tags: input.tags,
        supersedesId: input.supersedesId,
        createdBy: 'agent',
      });
      emit.onEvent(
        await appendEvent(runId, {
          kind: 'memory',
          text: entry.title,
          data: { entryId: entry.id, kind: entry.kind, title: entry.title },
        }),
      );
      return { id: entry.id, kind: entry.kind, title: entry.title };
    };

    const recall: RecallFn = (input) =>
      recallEntries({ sessionId: run.sessionId, kind: input.kind, query: input.query });

    const provider = getProvider(run.provider);
    for await (const ev of provider.launch({
      prompt,
      cwd: run.cwd,
      model: run.model ?? DEFAULT_MODEL,
      resume: run.externalId,
      permissionMode: DEFAULT_PERMISSION_MODE,
      abortController: controller,
      askUser,
      sessionContext,
      remember,
      recall,
    })) {
      if (ev.externalId && !externalStamped) {
        externalStamped = true;
        emit.onRunUpdated(
          await setRunExternal(runId, ev.externalId, ev.model ?? run.model ?? DEFAULT_MODEL),
        );
      }
      emit.onEvent(
        await appendEvent(runId, {
          kind: ev.kind,
          text: ev.text,
          toolName: ev.toolName,
          data: ev.data,
        }),
      );
    }

    emit.onRunUpdated(await setRunStatus(runId, 'completed'));
  } catch (err) {
    const aborted = controller.signal.aborted;
    if (!aborted) {
      const message = err instanceof Error ? err.message : String(err);
      emit.onEvent(await appendEvent(runId, { kind: 'error', text: message }));
    }
    emit.onRunUpdated(await setRunStatus(runId, aborted ? 'canceled' : 'error'));
  } finally {
    active.delete(runId);
    // Drop any questions left unanswered when the run ended.
    for (const [questionId, pending] of pendingAsks) {
      if (pending.runId === runId) {
        pendingAsks.delete(questionId);
        pending.resolve('(run ended before this was answered)');
      }
    }
  }
}
