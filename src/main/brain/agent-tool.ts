/**
 * What an agent can do to the human's Brain, behind the `brain` tool: add a
 * task, jot or reminder to the Session it is running in, mark something done,
 * or set the Session's mission. Deliberately narrow — an agent adds to the
 * board and closes things on it; it does not reorganise it.
 *
 * Pure over the repository so it is testable without Electron. The runner
 * publishes the board and writes the transcript event after this returns.
 */

import {
  BRAIN_KIND_LABELS,
  shortBrainId,
  type BrainItem,
  type BrainKind,
} from '@shared/brain';
import {
  captureBrainItem,
  findBrainItemByShortId,
  setMission,
  updateBrainItem,
} from '../repo/brain';

const MINUTE = 60_000;

export type BrainToolAction = 'add' | 'done' | 'mission';
export type BrainToolKind = Exclude<BrainKind, 'mission'>;

export interface BrainToolInput {
  action: BrainToolAction;
  /** For `add`. Defaults to `task`. */
  kind?: BrainToolKind;
  title?: string;
  body?: string;
  /** For `add`: surface the entry this many minutes from now. Required for reminders. */
  inMinutes?: number;
  /** For `done`: the entry's id, full or the short `id:8f2a1c` form. */
  id?: string;
}

export interface BrainToolResult {
  item: BrainItem;
  /** One line back to the agent. */
  ack: string;
}

function ref(item: BrainItem): string {
  return `id:${shortBrainId(item.id)}`;
}

async function add(input: BrainToolInput, sessionId: string): Promise<BrainToolResult> {
  const title = input.title?.trim();
  if (!title) throw new Error('`add` needs a title');
  const kind: BrainToolKind = input.kind ?? 'task';
  if (kind === 'reminder' && !input.inMinutes) {
    throw new Error('A reminder needs `inMinutes` — when should it surface?');
  }
  const dueAt = input.inMinutes ? Date.now() + input.inMinutes * MINUTE : null;
  const item = await captureBrainItem({
    kind,
    title,
    body: input.body,
    dueAt,
    sessionId,
    createdBy: 'agent',
  });
  const when = input.inMinutes ? ` (in ${input.inMinutes}m)` : '';
  return { item, ack: `Added ${BRAIN_KIND_LABELS[kind].toLowerCase()}: ${title}${when} ${ref(item)}` };
}

async function done(input: BrainToolInput, sessionId: string): Promise<BrainToolResult> {
  if (!input.id?.trim()) throw new Error('`done` needs the entry id');
  // Scoped to the run's own Session: an agent closes what it can see, no more.
  const found = await findBrainItemByShortId(input.id, sessionId);
  if (!found) throw new Error(`No brain entry matches ${input.id} in this session`);
  const item = await updateBrainItem({ id: found.id, status: 'done' });
  return { item, ack: `Done: ${item.title} ${ref(item)}` };
}

async function mission(input: BrainToolInput, sessionId: string): Promise<BrainToolResult> {
  const item = await setMission({ sessionId, title: input.title, body: input.body });
  return { item, ack: `Mission: ${item.title}${item.body ? ` — ${item.body}` : ''} ${ref(item)}` };
}

/** Apply one tool call for the Session a run belongs to. Throws on bad input. */
export async function applyBrainTool(
  input: BrainToolInput,
  sessionId: string,
): Promise<BrainToolResult> {
  switch (input.action) {
    case 'add':
      return add(input, sessionId);
    case 'done':
      return done(input, sessionId);
    case 'mission':
      return mission(input, sessionId);
    default:
      throw new Error(`Unknown brain action: ${String(input.action)}`);
  }
}
