/**
 * Spec-review repository. Returns plain `shared/explain-pr` shapes — no
 * Drizzle rows escape this layer.
 */

import { randomUUID } from 'node:crypto';
import { desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client';
import {
  specFileDeps,
  specFileGoals,
  specFiles,
  specGoals,
  specReviews,
  type SpecFileDepRow,
  type SpecFileRow,
  type SpecGoalRow,
  type SpecReviewRow,
} from '../db/schema';
import type {
  SpecChangeType,
  SpecFile,
  SpecFileDep,
  SpecGoal,
  SpecReview,
  SpecReviewDetail,
  SpecReviewListItem,
  SpecReviewStatus,
} from '@shared/explain-pr';

const GOAL_COLORS = ['violet', 'cyan', 'emerald', 'amber', 'rose', 'slate'] as const;

function toReview(row: SpecReviewRow): SpecReview {
  return {
    id: row.id,
    cwd: row.cwd,
    prNumber: row.prNumber,
    prUrl: row.prUrl,
    title: row.title,
    author: row.author,
    base: row.base,
    head: row.head,
    state: row.state,
    commitCount: row.commitCount,
    intent: row.intent,
    status: row.status as SpecReviewStatus,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toGoal(row: SpecGoalRow): SpecGoal {
  return {
    id: row.id,
    reviewId: row.reviewId,
    key: row.key,
    label: row.label,
    blurb: row.blurb,
    color: row.color,
    sort: row.sort,
  };
}

function toDep(row: SpecFileDepRow): SpecFileDep {
  return { id: row.id, fileId: row.fileId, path: row.path, note: row.note };
}

function toFile(
  row: SpecFileRow,
  goals: SpecGoal[],
  deps: SpecFileDep[],
): SpecFile {
  return {
    id: row.id,
    reviewId: row.reviewId,
    path: row.path,
    additions: row.additions,
    deletions: row.deletions,
    changeType: row.changeType as SpecChangeType,
    spec: row.spec,
    connects: row.connects,
    behaviorChange: row.behaviorChange,
    isTest: row.isTest === 1,
    reviewed: row.reviewed === 1,
    hunk: row.hunk,
    patch: row.patch,
    goals,
    deps,
  };
}

export async function listReviews(): Promise<SpecReviewListItem[]> {
  const db = getDb();
  const rows = await db.select().from(specReviews).orderBy(desc(specReviews.updatedAt)).all();
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const fileRows = await db.select().from(specFiles).where(inArray(specFiles.reviewId, ids)).all();
  const byReview = new Map<string, { fileCount: number; reviewedCount: number }>();
  for (const id of ids) byReview.set(id, { fileCount: 0, reviewedCount: 0 });
  for (const file of fileRows) {
    const bucket = byReview.get(file.reviewId);
    if (!bucket) continue;
    bucket.fileCount += 1;
    if (file.reviewed === 1) bucket.reviewedCount += 1;
  }

  return rows.map((row) => {
    const counts = byReview.get(row.id) ?? { fileCount: 0, reviewedCount: 0 };
    return { ...toReview(row), ...counts };
  });
}

export async function getReview(id: string): Promise<SpecReview | null> {
  const row = await getDb().select().from(specReviews).where(eq(specReviews.id, id)).get();
  return row ? toReview(row) : null;
}

export async function getReviewDetail(id: string): Promise<SpecReviewDetail | null> {
  const db = getDb();
  const row = await db.select().from(specReviews).where(eq(specReviews.id, id)).get();
  if (!row) return null;

  const goalRows = await db
    .select()
    .from(specGoals)
    .where(eq(specGoals.reviewId, id))
    .all();
  const goals = goalRows.map(toGoal).sort((a, b) => a.sort - b.sort);
  const goalsById = new Map(goals.map((g) => [g.id, g]));

  const fileRows = await db.select().from(specFiles).where(eq(specFiles.reviewId, id)).all();
  const fileIds = fileRows.map((f) => f.id);

  const linkRows =
    fileIds.length === 0
      ? []
      : await db.select().from(specFileGoals).where(inArray(specFileGoals.fileId, fileIds)).all();
  const depRows =
    fileIds.length === 0
      ? []
      : await db.select().from(specFileDeps).where(inArray(specFileDeps.fileId, fileIds)).all();

  const goalsByFile = new Map<string, SpecGoal[]>();
  for (const link of linkRows) {
    const goal = goalsById.get(link.goalId);
    if (!goal) continue;
    const list = goalsByFile.get(link.fileId) ?? [];
    goalsByFile.set(link.fileId, [...list, goal]);
  }

  const depsByFile = new Map<string, SpecFileDep[]>();
  for (const dep of depRows) {
    const list = depsByFile.get(dep.fileId) ?? [];
    depsByFile.set(dep.fileId, [...list, toDep(dep)]);
  }

  const files = fileRows.map((file) =>
    toFile(file, goalsByFile.get(file.id) ?? [], depsByFile.get(file.id) ?? []),
  );

  return { ...toReview(row), goals, files };
}

export interface CreateReviewInput {
  cwd: string;
  prNumber: number;
}

export async function createReview(input: CreateReviewInput): Promise<SpecReview> {
  const now = Date.now();
  const row: SpecReviewRow = {
    id: randomUUID(),
    cwd: input.cwd,
    prNumber: input.prNumber,
    prUrl: null,
    title: `PR #${input.prNumber}`,
    author: null,
    base: null,
    head: null,
    state: null,
    commitCount: 0,
    intent: null,
    status: 'fetching',
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().insert(specReviews).values(row).run();
  return toReview(row);
}

export async function patchReview(
  id: string,
  patch: Partial<
    Pick<
      SpecReviewRow,
      | 'prUrl'
      | 'title'
      | 'author'
      | 'base'
      | 'head'
      | 'state'
      | 'commitCount'
      | 'intent'
      | 'status'
      | 'error'
    >
  >,
): Promise<SpecReview> {
  const db = getDb();
  const existing = await db.select().from(specReviews).where(eq(specReviews.id, id)).get();
  if (!existing) throw new Error(`Spec review not found: ${id}`);
  const next: SpecReviewRow = { ...existing, ...patch, updatedAt: Date.now() };
  await db.update(specReviews).set(next).where(eq(specReviews.id, id)).run();
  return toReview(next);
}

export interface FileStubInput {
  path: string;
  additions: number;
  deletions: number;
  changeType: SpecChangeType;
  isTest: boolean;
  hunk: string | null;
  patch: string | null;
}

export async function replaceFileStubs(reviewId: string, stubs: FileStubInput[]): Promise<void> {
  const db = getDb();
  const existing = await db.select().from(specFiles).where(eq(specFiles.reviewId, reviewId)).all();
  for (const file of existing) {
    await db.delete(specFileDeps).where(eq(specFileDeps.fileId, file.id)).run();
    await db.delete(specFileGoals).where(eq(specFileGoals.fileId, file.id)).run();
  }
  await db.delete(specFiles).where(eq(specFiles.reviewId, reviewId)).run();

  if (stubs.length === 0) return;
  await db
    .insert(specFiles)
    .values(
      stubs.map((stub) => ({
        id: randomUUID(),
        reviewId,
        path: stub.path,
        additions: stub.additions,
        deletions: stub.deletions,
        changeType: stub.changeType,
        spec: null,
        connects: null,
        behaviorChange: null,
        isTest: stub.isTest ? 1 : 0,
        reviewed: 0,
        hunk: stub.hunk,
        patch: stub.patch,
      })),
    )
    .run();
}

export interface GoalInput {
  key: string;
  label: string;
  blurb: string;
}

export async function replaceGoals(reviewId: string, goals: GoalInput[]): Promise<SpecGoal[]> {
  const db = getDb();
  const existingFiles = await db.select().from(specFiles).where(eq(specFiles.reviewId, reviewId)).all();
  for (const file of existingFiles) {
    await db.delete(specFileGoals).where(eq(specFileGoals.fileId, file.id)).run();
  }
  await db.delete(specGoals).where(eq(specGoals.reviewId, reviewId)).run();

  if (goals.length === 0) return [];

  const rows: SpecGoalRow[] = goals.map((goal, index) => ({
    id: randomUUID(),
    reviewId,
    key: goal.key,
    label: goal.label,
    blurb: goal.blurb,
    color: GOAL_COLORS[index % GOAL_COLORS.length],
    sort: index,
  }));
  await db.insert(specGoals).values(rows).run();
  return rows.map(toGoal);
}

export interface FileExplainInput {
  path: string;
  goalKeys: string[];
  spec: string;
  connects: string;
  behaviorChange: string;
  isTest?: boolean;
  deps: { path: string; note: string }[];
}

export async function applyFileExplain(reviewId: string, input: FileExplainInput): Promise<void> {
  const db = getDb();
  const files = await db.select().from(specFiles).where(eq(specFiles.reviewId, reviewId)).all();
  const file = matchFile(files, input.path);
  if (!file) return;

  await db
    .update(specFiles)
    .set({
      spec: input.spec,
      connects: input.connects,
      behaviorChange: input.behaviorChange,
      isTest: input.isTest === undefined ? file.isTest : input.isTest ? 1 : 0,
    })
    .where(eq(specFiles.id, file.id))
    .run();

  await db.delete(specFileGoals).where(eq(specFileGoals.fileId, file.id)).run();
  await db.delete(specFileDeps).where(eq(specFileDeps.fileId, file.id)).run();

  if (input.goalKeys.length > 0) {
    const goals = await db.select().from(specGoals).where(eq(specGoals.reviewId, reviewId)).all();
    const links = input.goalKeys
      .map((key) => goals.find((g) => g.key === key || g.label === key))
      .filter((g): g is SpecGoalRow => Boolean(g))
      .map((g) => ({ fileId: file.id, goalId: g.id }));
    if (links.length > 0) await db.insert(specFileGoals).values(links).run();
  }

  if (input.deps.length > 0) {
    await db
      .insert(specFileDeps)
      .values(
        input.deps.map((dep) => ({
          id: randomUUID(),
          fileId: file.id,
          path: dep.path,
          note: dep.note,
        })),
      )
      .run();
  }

  await db.update(specReviews).set({ updatedAt: Date.now() }).where(eq(specReviews.id, reviewId)).run();
}

export async function setFileReviewed(
  reviewId: string,
  path: string,
  reviewed: boolean,
): Promise<void> {
  const db = getDb();
  const files = await db.select().from(specFiles).where(eq(specFiles.reviewId, reviewId)).all();
  const file = matchFile(files, path);
  if (!file) throw new Error(`File not found in review: ${path}`);
  await db
    .update(specFiles)
    .set({ reviewed: reviewed ? 1 : 0 })
    .where(eq(specFiles.id, file.id))
    .run();
  await db.update(specReviews).set({ updatedAt: Date.now() }).where(eq(specReviews.id, reviewId)).run();
}

/** Exact path, then suffix, then basename — Claude often emits a short name. */
function matchFile(files: SpecFileRow[], path: string): SpecFileRow | undefined {
  const exact = files.find((f) => f.path === path);
  if (exact) return exact;
  const suffix = files.find((f) => f.path.endsWith(`/${path}`) || f.path.endsWith(path));
  if (suffix) return suffix;
  const base = path.split('/').pop();
  if (!base) return undefined;
  const matches = files.filter((f) => f.path.split('/').pop() === base);
  return matches.length === 1 ? matches[0] : undefined;
}
