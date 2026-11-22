/**
 * The agent-facing face of the Brain: a single markdown file at
 * `~/.whetstone/brain.md`, rewritten on every change.
 *
 * The point is proximity. Any agent on this machine — a Claude Code run in any
 * repo, a script, a cron job — can `cat` one well-known path and know what the
 * human has in hand, without whetstone having to be running or an API to speak.
 * One direction for now: whetstone writes, everyone reads.
 */

import { app } from 'electron';
import { join } from 'node:path';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { isUnclaimed, shortBrainId, type BrainItem } from '@shared/brain';

/**
 * The marker in each line's brackets, so a glance down the left edge reads as
 * both kind and state: a task is a checkbox, a jot a bullet, a reminder a
 * clock's `@`. Finished always wins — done is done whatever it was.
 */
function mark(item: BrainItem): string {
  if (item.status === 'done') return 'x';
  if (item.status === 'dropped') return '-';
  if (item.status === 'doing') return '~';
  if (item.kind === 'jot') return '.';
  if (item.kind === 'reminder') return '@';
  if (item.kind === 'mission') return '*';
  return ' ';
}

/** Directory holding everything whetstone exposes to the rest of the machine. */
export function brainDir(): string {
  return join(app.getPath('home'), '.whetstone');
}

export function brainFilePath(): string {
  return join(brainDir(), 'brain.md');
}

function stamp(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * One entry as one markdown line — the same shape in the mirror and in the
 * digest a run is launched with, so an agent reads it the same way in both.
 */
export function brainLine(item: BrainItem): string {
  const parts = [`- [${mark(item)}] ${item.title}`];
  if (item.body) parts.push(`— ${item.body}`);
  if (item.dueAt !== null) parts.push(`(due ${stamp(item.dueAt)})`);
  if (item.sessionName) parts.push(`· ${item.sessionName}`);
  parts.push(`\`id:${shortBrainId(item.id)}\``);
  return parts.join(' ');
}

const line = brainLine;

/** A live mission: the Session, its goal, and the direction beneath. */
function missionBlock(item: BrainItem): string {
  // A fresh mission still carries its Session's name as the goal; say it once.
  const head =
    item.sessionName && item.sessionName !== item.title
      ? `${item.sessionName} — ${item.title}`
      : item.title;
  const lines = [`### ${head} \`id:${shortBrainId(item.id)}\``];
  if (item.body) lines.push(item.body);
  return lines.join('\n') + '\n';
}

function section(heading: string, items: BrainItem[], emptyNote?: string): string {
  if (items.length === 0) return emptyNote ? `## ${heading}\n\n_${emptyNote}_\n` : '';
  return `## ${heading}\n\n${items.map(line).join('\n')}\n`;
}

/** Render the whole brain as the markdown an agent will read. */
export function renderBrainMarkdown(items: BrainItem[], now: number = Date.now()): string {
  return [
    '<!-- Written by whetstone. Edits here are overwritten — change entries in the app. -->',
    '',
    '# Brain',
    '',
    "The working state of the human running this machine: what's in hand, what's",
    'outstanding, what has been done, and what is waiting on a clock. Entries are',
    'pointers, not context — read one as a direction to follow, not a briefing.',
    '',
    `_Updated ${stamp(now)}_`,
    '',
    items.length === 0 ? '_The brain is empty._\n' : renderSections(items, now),
  ].join('\n');
}

/** The lanes, in the order a reader should meet them. */
function renderSections(items: BrainItem[], now: number): string {
  const live = items.filter((i) => i.status === 'open' || i.status === 'doing');
  const due = live.filter((i) => isUnclaimed(i, now));
  const dueIds = new Set(due.map((i) => i.id));
  const missions = live.filter((i) => i.kind === 'mission');
  const rest = live.filter((i) => !dueIds.has(i.id) && i.kind !== 'mission');

  const tasks = rest.filter((i) => i.kind === 'task');
  const byDue = (a: BrainItem, b: BrainItem) => (a.dueAt ?? 0) - (b.dueAt ?? 0);

  return [
    missions.length > 0 ? `## Missions\n\n${missions.map(missionBlock).join('\n')}` : '',
    section('Due now', due),
    section(
      'In hand',
      tasks.filter((i) => i.status === 'doing'),
      'nothing in progress',
    ),
    section(
      'Outstanding',
      tasks.filter((i) => i.status === 'open'),
      'nothing outstanding',
    ),
    section(
      'Watching',
      rest.filter((i) => i.kind === 'reminder').sort(byDue),
    ),
    section(
      'Jots',
      rest.filter((i) => i.kind === 'jot'),
    ),
    section(
      'Done recently',
      items.filter((i) => i.status === 'done'),
    ),
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Write the mirror atomically (temp file + rename), so an agent reading the
 * path mid-write always sees a complete document rather than a truncated one.
 */
export async function writeBrainMirror(items: BrainItem[]): Promise<void> {
  const dir = brainDir();
  const target = brainFilePath();
  const temp = `${target}.tmp`;
  await mkdir(dir, { recursive: true });
  await writeFile(temp, renderBrainMarkdown(items), 'utf8');
  await rename(temp, target);
}
