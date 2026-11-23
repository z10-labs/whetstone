/**
 * The Live Cards service: owns the one CardPoller, publishes every card change
 * to the windows, wakes origin runs when triggers fire, and carries out what
 * the human does on a card (pin, approve, click, start a session from it).
 *
 * Electron and the runner are injected through `initCards`, so this module —
 * which the runner imports for `cardWritten` — never imports either back.
 */

import { readPointer, shortCardId, type CardChange, type LiveCard } from '@shared/cards';
import type { CardActionInput, CardsViewingInput, PinResult } from '@shared/ipc';
import * as repo from '../repo/cards';
import { getRun, createRun } from '../repo/runs';
import { createSession } from '../repo/sessions';
import { CardPoller } from './poller';
import { adapters } from './adapters';
import { realExec, realReadFile, realShell } from './adapters/exec';

/** State sent with a wake message is capped so a big binding can't flood the turn. */
const WAKE_STATE_MAX = 4000;

export interface CardServiceDeps {
  broadcast(change: CardChange): void;
  /** Send a message into a run as its next turn (now, or after the current one). */
  deliver(runId: string, text: string): void;
  /** Desktop notification; `onClick` focuses the app. */
  notify(title: string, body: string): void;
  isFocused(): boolean;
  /** Seed a new Session's mission, as creating one from the UI does. */
  onSessionCreated(sessionId: string, name: string): Promise<void>;
}

let deps: CardServiceDeps | null = null;
let poller: CardPoller | null = null;

function need(): { deps: CardServiceDeps; poller: CardPoller } {
  if (!deps || !poller) throw new Error('Card service not initialised');
  return { deps, poller };
}

function publish(card: LiveCard): void {
  deps?.broadcast({ card });
}

function publishRemoved(id: string): void {
  deps?.broadcast({ removedId: id });
}

const label = (card: LiveCard) => `[card id:${shortCardId(card.id)} · ${card.spec.title}]`;

/** The message an origin run is resumed with when triggers fire. */
export function wakeMessage(card: LiveCard, fired: number[]): string {
  const notes = fired.map((i) => card.spec.wakeOn?.[i]?.note).filter(Boolean);
  let state = JSON.stringify(card.state, null, 2) ?? 'null';
  if (state.length > WAKE_STATE_MAX) state = `${state.slice(0, WAKE_STATE_MAX)}\n… (truncated)`;
  return `${label(card)} trigger: ${notes.join('; ')}\n\nCurrent card state:\n\`\`\`json\n${state}\n\`\`\``;
}

/** The message a card button or choice sends. */
export function actionMessage(card: LiveCard, value: string): string {
  return `${label(card)} ${value}`;
}

/** The first message of a Session started from an orphaned card. */
export function seedMessage(card: LiveCard): string {
  return (
    `${label(card)} This card was pinned from a session that no longer exists. You now own it: ` +
    'it will wake you when its triggers fire. Its spec and current state follow; take it from here.\n\n' +
    `Spec:\n\`\`\`json\n${JSON.stringify(card.spec, null, 2)}\n\`\`\`\n\n` +
    `State:\n\`\`\`json\n${JSON.stringify(card.state, null, 2) ?? 'null'}\n\`\`\``
  );
}

/** The run a card can talk to, if it still has one that can be resumed. */
async function originRun(card: LiveCard) {
  if (!card.originSessionId || !card.originRunId) return null;
  const run = await getRun(card.originRunId);
  return run && run.mode === 'sdk' ? run : null;
}

async function onFired(card: LiveCard, fired: number[]): Promise<void> {
  const { deps } = need();
  const run = await originRun(card);
  const notes = fired.map((i) => card.spec.wakeOn?.[i]?.note).filter(Boolean).join('; ');
  if (run) deps.deliver(run.id, wakeMessage(card, fired));
  // Orphans can only notify; anyone not looking at the app should hear either way.
  if (!run || !deps.isFocused()) {
    deps.notify(card.spec.title, run ? notes : `${notes} — no session to wake. Open the card to start one.`);
  }
}

export async function initCards(serviceDeps: CardServiceDeps): Promise<void> {
  deps = serviceDeps;
  poller = new CardPoller({
    adapters,
    context: { exec: realExec, shell: realShell, readFile: realReadFile, now: () => Date.now() },
    getCard: repo.getCard,
    listPollable: repo.listPollable,
    patchCard: repo.patchCard,
    cwdFor: async (card) => (card.originRunId ? ((await getRun(card.originRunId))?.cwd ?? null) : null),
    onChanged: publish,
    onFired: (card, fired) => {
      void onFired(card, fired).catch((err) => console.error('[whetstone] card wake failed:', err));
    },
  });
  for (const id of await repo.sweepOrphans()) publishRemoved(id);
  await poller.start();
}

export function stopCards(): void {
  poller?.stop();
}

/** A card was created or changed by an agent: (re)start polling and publish it. */
export function cardWritten(card: LiveCard): void {
  if (card.status === 'settled') poller?.untrack(card.id);
  else poller?.track(card);
  publish(card);
}

export function setViewing(input: CardsViewingInput): void {
  poller?.setViewing({ sessionId: input.sessionId, panelOpen: input.panelOpen });
}

export function setFocused(focused: boolean): void {
  poller?.setViewing({ focused });
}

export const listView = repo.listView;

export async function pin(id: string, replaceId?: string): Promise<PinResult> {
  const result = await repo.pinCard(id, replaceId);
  if (replaceId) {
    const replaced = await repo.getCard(replaceId);
    if (replaced && replaced.pinnedAt === null && !replaced.originSessionId) publishRemoved(replaceId);
    else if (replaced) publish(replaced);
  }
  if (result.ok) publish(result.card);
  return result;
}

export async function unpin(id: string): Promise<void> {
  const card = await repo.unpinCard(id);
  if (card) {
    publish(card);
  } else {
    need().poller.untrack(id);
    publishRemoved(id);
  }
}

export async function reorder(ids: string[]): Promise<void> {
  for (const card of await repo.reorderPinned(ids)) publish(card);
}

export async function dismiss(id: string): Promise<void> {
  need().poller.untrack(id);
  await repo.dismissCard(id);
  publishRemoved(id);
}

export async function approveBinding(id: string): Promise<LiveCard> {
  const card = await repo.getCard(id);
  if (!card) throw new Error(`No card ${id}`);
  if (card.status !== 'awaiting-approval') return card;
  const updated = await repo.patchCard(id, { status: 'live', bindingApprovedAt: Date.now() });
  cardWritten(updated);
  return updated;
}

/** A human clicked a card's button or picked a choice: say so to the origin run. */
export async function action(input: CardActionInput): Promise<void> {
  const card = await repo.getCard(input.cardId);
  if (!card) throw new Error('That card is gone');
  const block = card.spec.blocks[input.blockIndex];
  const allowed =
    block?.kind === 'actions'
      ? block.items.some((a) => 'send' in a && a.label === input.value)
      : block?.kind === 'choice'
        ? block.options.includes(input.value)
        : false;
  if (!allowed) throw new Error('That action is not on this card');
  const run = await originRun(card);
  if (!run) throw new Error('No session to send to');
  need().deps.deliver(run.id, actionMessage(card, input.value));
}

/** Start a Session from an orphaned card: it becomes that Session's card. */
export async function startSession(id: string, cwd: string): Promise<string> {
  const { deps } = need();
  const card = await repo.getCard(id);
  if (!card) throw new Error(`No card ${id}`);
  const session = await createSession({ name: card.spec.title });
  await deps.onSessionCreated(session.id, session.name);
  const run = await createRun({ sessionId: session.id, cwd, mode: 'sdk', title: card.spec.title });
  const rehomed = await repo.rehomeCard(id, session.id, run.id);
  publish(rehomed);
  deps.deliver(run.id, seedMessage(rehomed));
  return session.id;
}

/**
 * After a Session is deleted: its unpinned cards are swept, its pinned ones
 * live on as orphans. Call with the cards listed before the delete.
 */
export async function sessionDeleted(before: LiveCard[]): Promise<void> {
  const swept = new Set(await repo.sweepOrphans());
  for (const card of before) {
    if (swept.has(card.id)) {
      poller?.untrack(card.id);
      publishRemoved(card.id);
      continue;
    }
    const now = await repo.getCard(card.id);
    if (now) publish(now);
  }
}

/** Short lines for the session digest: what this Session is watching. */
export async function digestLines(sessionId: string): Promise<string[]> {
  const cards = await repo.listSessionCards(sessionId, { includePinned: true });
  return cards
    .filter((c) => c.status !== 'settled')
    .map((c) => {
      const status = readPointer(c.state, '/status');
      const pinned = c.pinnedAt !== null ? ' · pinned by the human' : '';
      const s = typeof status === 'string' ? ` · ${status}` : '';
      return `- id:${shortCardId(c.id)} ${c.spec.title} · ${c.status}${s}${pinned}`;
    });
}
