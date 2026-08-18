/**
 * Explain PR — a standalone spec-first artifact, unrelated to Sessions/Runs.
 * Claude maps a pull request into intent + sub-goals + per-file explainers
 * so a human can review the change themselves. The model does not review.
 */

export type SpecReviewStatus = 'fetching' | 'mapping' | 'ready' | 'error';

export type SpecChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

export interface SpecGoal {
  id: string;
  reviewId: string;
  key: string;
  label: string;
  blurb: string;
  color: string;
  sort: number;
}

export interface SpecFileDep {
  id: string;
  fileId: string;
  path: string;
  note: string;
}

export interface SpecFile {
  id: string;
  reviewId: string;
  path: string;
  additions: number;
  deletions: number;
  changeType: SpecChangeType;
  spec: string | null;
  connects: string | null;
  behaviorChange: string | null;
  isTest: boolean;
  reviewed: boolean;
  hunk: string | null;
  patch: string | null;
  goals: SpecGoal[];
  deps: SpecFileDep[];
}

export interface SpecReview {
  id: string;
  cwd: string;
  prNumber: number;
  prUrl: string | null;
  title: string;
  author: string | null;
  base: string | null;
  head: string | null;
  state: string | null;
  commitCount: number;
  intent: string | null;
  status: SpecReviewStatus;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Full review for the spec column. */
export interface SpecReviewDetail extends SpecReview {
  goals: SpecGoal[];
  files: SpecFile[];
}

/** Compact row for the tool's start screen. */
export interface SpecReviewListItem extends SpecReview {
  fileCount: number;
  reviewedCount: number;
}

/** One open PR from `gh pr list`, used by the picker. */
export interface GhPrListItem {
  number: number;
  title: string;
  author: string;
  headRefName: string;
  baseRefName: string;
  state: string;
  updatedAt: string;
}
