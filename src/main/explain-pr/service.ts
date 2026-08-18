/**
 * Explain PR orchestrator: fetch via gh, persist stubs, map with Claude,
 * broadcast each update. Not an AgentRun — this artifact lives on its own.
 */

import type {
  GhPrListItem,
  SpecReview,
  SpecReviewDetail,
  SpecReviewListItem,
} from '@shared/explain-pr';
import type { StartExplainPrInput } from '@shared/ipc';
import * as repo from '../repo/explain-pr';
import { mapPr } from './claude';
import { diffPr, listOpenPrs, parsePrRef, splitDiffByFile, viewPr } from './gh';

export type ExplainPrEmitter = (detail: SpecReviewDetail) => void;

const active = new Map<string, AbortController>();

export function listReviews(): Promise<SpecReviewListItem[]> {
  return repo.listReviews();
}

export function listOpen(cwd: string): Promise<GhPrListItem[]> {
  return listOpenPrs(cwd);
}

export function getReview(id: string): Promise<SpecReviewDetail | null> {
  return repo.getReviewDetail(id);
}

export async function startReview(
  input: StartExplainPrInput,
  emit: ExplainPrEmitter,
): Promise<SpecReview> {
  const prNumber = parsePrRef(input.pr);
  const review = await repo.createReview({ cwd: input.cwd, prNumber });
  const controller = new AbortController();
  active.set(review.id, controller);

  void runPipeline(review.id, input.cwd, prNumber, controller, emit).catch((err) => {
    console.error('[whetstone] explain-pr failed:', err);
  });

  return review;
}

export function cancelReview(id: string): void {
  active.get(id)?.abort();
}

export async function setReviewed(
  reviewId: string,
  path: string,
  reviewed: boolean,
  emit: ExplainPrEmitter,
): Promise<SpecReviewDetail> {
  await repo.setFileReviewed(reviewId, path, reviewed);
  const detail = await requireDetail(reviewId);
  emit(detail);
  return detail;
}

async function runPipeline(
  reviewId: string,
  cwd: string,
  prNumber: number,
  controller: AbortController,
  emit: ExplainPrEmitter,
): Promise<void> {
  try {
    await broadcast(reviewId, emit);

    const [view, rawDiff] = await Promise.all([viewPr(cwd, prNumber), diffPr(cwd, prNumber)]);
    if (controller.signal.aborted) {
      await repo.patchReview(reviewId, { status: 'error', error: 'Canceled.' });
      await broadcast(reviewId, emit);
      return;
    }

    const patches = splitDiffByFile(rawDiff);
    await repo.patchReview(reviewId, {
      prUrl: view.url || null,
      title: view.title,
      author: view.author || null,
      base: view.base || null,
      head: view.head || null,
      state: view.state || null,
      commitCount: view.commitCount,
      status: 'mapping',
      error: null,
    });
    await repo.replaceFileStubs(
      reviewId,
      view.files.map((file) => {
        const patch = patches.get(file.path);
        return {
          path: file.path,
          additions: file.additions,
          deletions: file.deletions,
          changeType: file.changeType,
          isTest: isProbablyTest(file.path),
          hunk: patch?.hunk ?? null,
          patch: patch?.patch ?? null,
        };
      }),
    );
    await broadcast(reviewId, emit);

    await mapPr({
      cwd,
      pr: view,
      diffs: view.files.map((file) => ({
        path: file.path,
        patch: patches.get(file.path)?.patch ?? '',
      })),
      abortController: controller,
      handlers: {
        onIntent: async (input) => {
          await repo.patchReview(reviewId, { intent: input.intent });
          await repo.replaceGoals(
            reviewId,
            input.goals.map((g) => ({ key: g.id, label: g.label, blurb: g.blurb })),
          );
          await broadcast(reviewId, emit);
        },
        onFile: async (input) => {
          await repo.applyFileExplain(reviewId, {
            path: input.path,
            goalKeys: input.goals,
            spec: input.spec,
            connects: input.connects,
            behaviorChange: input.behaviorChange,
            isTest: input.isTest,
            deps: input.deps.map((d) => ({ path: d.file, note: d.note })),
          });
          await broadcast(reviewId, emit);
        },
        onDone: async () => {
          await repo.patchReview(reviewId, { status: 'ready', error: null });
          await broadcast(reviewId, emit);
        },
      },
    });
  } catch (err) {
    const aborted = controller.signal.aborted;
    const message = aborted
      ? 'Canceled.'
      : err instanceof Error
        ? err.message
        : String(err);
    await repo.patchReview(reviewId, { status: 'error', error: message });
    await broadcast(reviewId, emit);
  } finally {
    active.delete(reviewId);
  }
}

async function broadcast(reviewId: string, emit: ExplainPrEmitter): Promise<void> {
  emit(await requireDetail(reviewId));
}

async function requireDetail(reviewId: string): Promise<SpecReviewDetail> {
  const detail = await repo.getReviewDetail(reviewId);
  if (!detail) throw new Error(`Spec review not found: ${reviewId}`);
  return detail;
}

function isProbablyTest(path: string): boolean {
  return (
    /(?:^|\/)(?:__tests?__|tests?|spec)(?:\/|$)/i.test(path) ||
    /\.(?:test|spec)\.[^/]+$/i.test(path) ||
    /_test\.[^/]+$/i.test(path)
  );
}
