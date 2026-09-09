/**
 * Session memory — the shared "brain" that spans the runs inside a Session.
 * Plain serializable shapes crossing the IPC boundary, mirroring the pattern in
 * `models.ts` and `explain-pr.ts`. Working memory (curated, session-wide), as
 * opposed to the raw per-run `RunEvent` log it is distilled from.
 */

/** The five kinds of thing worth remembering across a session. */
export type MemoryKind = 'decision' | 'artifact' | 'open_question' | 'next_step' | 'note';

/** Lifecycle of an entry. Append-only: edits supersede rather than mutate. */
export type MemoryStatus = 'active' | 'resolved' | 'superseded';

/** Who authored an entry. `distiller` = a future auto-summarizer (deferred). */
export type MemoryAuthor = 'agent' | 'human' | 'distiller';

export interface SessionMemoryEntry {
  id: string;
  sessionId: string;
  /** Run that authored the entry (the handover trail), if any. */
  runId: string | null;
  /** Repo/dir the fact pertains to. */
  cwd: string | null;
  kind: MemoryKind;
  title: string;
  body: string;
  tags: string[];
  status: MemoryStatus;
  /** Prior entry this one replaces. */
  supersedesId: string | null;
  createdBy: MemoryAuthor;
  createdAt: number;
  updatedAt: number;
}

/** Repository input for writing an entry. */
export interface RememberInput {
  sessionId: string;
  runId?: string | null;
  cwd?: string | null;
  kind: MemoryKind;
  title: string;
  body?: string;
  tags?: string[];
  supersedesId?: string | null;
  createdBy?: MemoryAuthor;
}

/** Repository query for reading entries. */
export interface RecallQuery {
  sessionId: string;
  kind?: MemoryKind;
  /** Case-insensitive substring match over title + body. */
  query?: string;
}

/** Display order + labels for the UI and the compiled digest. */
export const MEMORY_KINDS: MemoryKind[] = [
  'decision',
  'open_question',
  'next_step',
  'artifact',
  'note',
];

export const MEMORY_KIND_LABELS: Record<MemoryKind, string> = {
  decision: 'Decisions',
  open_question: 'Open questions',
  next_step: 'Next steps',
  artifact: 'Artifacts',
  note: 'Notes',
};

export const MEMORY_KIND_SINGULAR: Record<MemoryKind, string> = {
  decision: 'Decision',
  open_question: 'Open question',
  next_step: 'Next step',
  artifact: 'Artifact',
  note: 'Note',
};
