/**
 * The Brain — a local, standalone working surface for the human running
 * whetstone: jots (sparks), tasks (what's in hand / outstanding / done) and
 * reminders (time-triggered nudges).
 *
 * Deliberately thin. An entry is a *pointer*, not a container: enough to
 * re-light a train of thought, never the thought itself. Anything long
 * belongs in a run transcript, a doc, or session memory — not here.
 *
 * Distinct from `session-memory.ts`: that is per-Session memory written by
 * agents mid-run. This is the machine-wide brain the human keeps. `sessionId`
 * exists as a seam so the two can be joined later; nothing reads it yet.
 */

/**
 * What kind of thing an entry is. A `mission` is the one entry a Session
 * carries for why it exists: its title is the goal, its body the few lines
 * of direction. One per Session, never more.
 */
export type BrainKind = 'jot' | 'task' | 'reminder' | 'mission';

/**
 * Where an entry stands. One vocabulary across all three kinds, read
 * differently per kind (see `BRAIN_STATUS_LABELS`): a task is outstanding /
 * in hand / done, a reminder is armed / acknowledged, a jot is live / filed.
 */
export type BrainStatus = 'open' | 'doing' | 'done' | 'dropped';

/** Who wrote the entry. Agents write via the mirror seam (not yet wired). */
export type BrainAuthor = 'human' | 'agent';

export interface BrainItem {
  id: string;
  kind: BrainKind;
  /** The spark. One line, precise — it triggers a direction, it isn't the map. */
  title: string;
  /** Optional single clarifying line. Usually empty. */
  body: string;
  status: BrainStatus;
  /** Pinned entries float to the top of their lane. */
  pinned: boolean;
  /** When this should surface. Reminders always have one; tasks may. */
  dueAt: number | null;
  /** When the ticker actually surfaced it — set once, so it fires once. */
  firedAt: number | null;
  doneAt: number | null;
  /** The Session this belongs to, if any. Missions always have one. */
  sessionId: string | null;
  /** Denormalised for display: the linked Session's name, or null. */
  sessionName: string | null;
  createdBy: BrainAuthor;
  createdAt: number;
  updatedAt: number;
}

/** Everything needed to capture an entry. Title is the only real input. */
export interface CaptureBrainInput {
  kind: BrainKind;
  title: string;
  body?: string;
  dueAt?: number | null;
  sessionId?: string | null;
  createdBy?: BrainAuthor;
}

/**
 * Set or rewrite a Session's mission. Creates it if the Session has none;
 * otherwise only the fields present change. Title falls back to the
 * Session's name on creation.
 */
export interface SetMissionInput {
  sessionId: string;
  title?: string;
  body?: string;
}

/** A partial edit. Omitted fields are left alone. */
export interface UpdateBrainInput {
  id: string;
  title?: string;
  body?: string;
  status?: BrainStatus;
  pinned?: boolean;
  dueAt?: number | null;
}

/** How long a finished entry stays on the board before it drops off. */
export const DONE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** How often the main process checks for entries that have come due. */
export const REMINDER_TICK_MS = 30_000;

export const BRAIN_KIND_LABELS: Record<BrainKind, string> = {
  jot: 'Jot',
  task: 'Task',
  reminder: 'Reminder',
  mission: 'Mission',
};

/** `8f2a1c` — the id an agent quotes back from the mirror or the digest. */
export function shortBrainId(id: string): string {
  return id.replace(/-/g, '').slice(0, 6);
}

/** Status wording, read through the lens of the kind. */
export const BRAIN_STATUS_LABELS: Record<BrainKind, Record<BrainStatus, string>> = {
  jot: { open: 'Live', doing: 'Live', done: 'Filed', dropped: 'Dropped' },
  task: { open: 'Outstanding', doing: 'In hand', done: 'Done', dropped: 'Dropped' },
  reminder: { open: 'Armed', doing: 'Armed', done: 'Acknowledged', dropped: 'Dismissed' },
  mission: { open: 'Live', doing: 'Live', done: 'Closed', dropped: 'Abandoned' },
};

/** A task's status ring: outstanding → in hand → done → outstanding. */
export function nextTaskStatus(status: BrainStatus): BrainStatus {
  if (status === 'open') return 'doing';
  if (status === 'doing') return 'done';
  return 'open';
}

/** True once a dated entry has come due and is still unfinished. */
export function isDue(item: BrainItem, now: number = Date.now()): boolean {
  if (item.dueAt === null) return false;
  if (item.status === 'done' || item.status === 'dropped') return false;
  return item.dueAt <= now;
}

/**
 * Due and not yet picked up — what the Due band shows. Starting a task counts
 * as acknowledging it, so it leaves the band and carries its overdue mark into
 * In hand instead of going on shouting.
 */
export function isUnclaimed(item: BrainItem, now: number = Date.now()): boolean {
  return item.status === 'open' && isDue(item, now);
}

/** Pinned first, then by the given clock field, newest last for open work. */
export function byPinnedThen(
  field: (item: BrainItem) => number,
  direction: 'asc' | 'desc' = 'asc',
) {
  return (a: BrainItem, b: BrainItem): number => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const delta = field(a) - field(b);
    return direction === 'asc' ? delta : -delta;
  };
}
