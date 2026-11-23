/**
 * CardPoller — keeps every live card fresh from the main process, so no model
 * spends tokens watching (docs/live-cards.md §4). One timer per card: run the
 * binding's adapter, store the new state, settle when the binding says it is
 * finished, and report triggers that fired so the agent can be woken.
 *
 * Storage, broadcasting and waking are injected; the poller only schedules.
 */

import { intervalSec, type BindingKind, type LiveCard } from '@shared/cards';
import type { Adapter, AdapterContext } from './adapters/types';
import { firedTriggers, isSettled } from './triggers';
import type { CardPatchInput } from '../repo/cards';

/** Errors in a row before a card shows `error`. */
const ERROR_LIMIT = 3;
/** How often an errored card retries. */
const ERROR_RETRY_SEC = 60;
/** Interval multiplier for cards nobody is looking at. */
const OFFSCREEN_BACKOFF = 4;

export interface Viewing {
  focused: boolean;
  sessionId: string | null;
  panelOpen: boolean;
}

/** On screen = the window is focused, the Live tab open, and the card in it. */
export function isOnScreen(card: LiveCard, viewing: Viewing): boolean {
  if (!viewing.focused || !viewing.panelOpen) return false;
  return card.pinnedAt !== null || card.originSessionId === viewing.sessionId;
}

export interface PollerDeps {
  adapters: { [K in BindingKind]: Adapter<K> };
  context: Omit<AdapterContext, 'cwd' | 'signal'>;
  getCard(id: string): Promise<LiveCard | null>;
  listPollable(): Promise<LiveCard[]>;
  patchCard(id: string, patch: CardPatchInput): Promise<LiveCard>;
  /** The origin run's directory, for adapters that resolve paths or run commands. */
  cwdFor(card: LiveCard): Promise<string | null>;
  onChanged(card: LiveCard): void;
  onFired(card: LiveCard, triggerIndices: number[]): void;
}

export class CardPoller {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private inFlight = new Set<string>();
  private errors = new Map<string, number>();
  private viewing: Viewing = { focused: true, sessionId: null, panelOpen: false };
  private stopped = false;

  constructor(private deps: PollerDeps) {}

  /** Pick up every card that should be polling (app boot). */
  async start(): Promise<void> {
    this.stopped = false;
    const cards = await this.deps.listPollable();
    for (const card of cards) this.track(card);
  }

  stop(): void {
    this.stopped = true;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  /** Start (or restart) polling a card now, if it should poll at all. */
  track(card: LiveCard): void {
    this.untrack(card.id);
    if (!this.shouldPoll(card)) return;
    this.schedule(card.id, 0);
  }

  untrack(id: string): void {
    const t = this.timers.get(id);
    if (t) clearTimeout(t);
    this.timers.delete(id);
    this.errors.delete(id);
  }

  isTracking(id: string): boolean {
    return this.timers.has(id) || this.inFlight.has(id);
  }

  /** What the human is looking at; off-screen cards slow down. */
  setViewing(patch: Partial<Viewing>): void {
    this.viewing = { ...this.viewing, ...patch };
  }

  private shouldPoll(card: LiveCard): boolean {
    return (
      card.spec.binding !== undefined && (card.status === 'live' || card.status === 'error')
    );
  }

  private schedule(id: string, delaySec: number): void {
    if (this.stopped) return;
    const t = setTimeout(() => void this.tick(id), delaySec * 1000);
    this.timers.set(id, t);
  }

  private nextDelay(card: LiveCard): number {
    const base = intervalSec(card.spec.binding!);
    if (card.status === 'error') return Math.max(base, ERROR_RETRY_SEC);
    return isOnScreen(card, this.viewing) ? base : base * OFFSCREEN_BACKOFF;
  }

  async tick(id: string): Promise<void> {
    this.timers.delete(id);
    if (this.inFlight.has(id)) return;
    const card = await this.deps.getCard(id);
    if (!card || !this.shouldPoll(card)) return;
    // A dismissed card is gone from every read; getCard still returns it.
    this.inFlight.add(id);
    let next: LiveCard = card;
    try {
      next = await this.poll(card);
    } finally {
      this.inFlight.delete(id);
    }
    if (this.shouldPoll(next) && !this.timers.has(id)) this.schedule(id, this.nextDelay(next));
  }

  private async poll(card: LiveCard): Promise<LiveCard> {
    const binding = card.spec.binding!;
    const adapter = this.deps.adapters[binding.kind] as Adapter;
    const now = this.deps.context.now();
    try {
      const cwd = await this.deps.cwdFor(card);
      const state = await adapter(binding, card.state, { ...this.deps.context, cwd });
      this.errors.delete(card.id);

      const fired = firedTriggers(card.spec.wakeOn, card.state, state, card.firedTriggers);
      const settled = isSettled(card.spec, state);
      const updated = await this.deps.patchCard(card.id, {
        state,
        status: settled ? 'settled' : 'live',
        lastError: null,
        lastPolledAt: now,
        firedTriggers: fired.length ? [...card.firedTriggers, ...fired] : undefined,
        settledAt: settled ? now : undefined,
      });
      this.deps.onChanged(updated);
      if (fired.length) this.deps.onFired(updated, fired);
      return updated;
    } catch (err) {
      const count = (this.errors.get(card.id) ?? 0) + 1;
      this.errors.set(card.id, count);
      const message = err instanceof Error ? err.message : String(err);
      if (count < ERROR_LIMIT && card.status !== 'error') return card;
      const updated = await this.deps.patchCard(card.id, {
        status: 'error',
        lastError: message.slice(0, 300),
        lastPolledAt: now,
      });
      if (card.status !== 'error' || card.lastError !== updated.lastError) {
        this.deps.onChanged(updated);
      }
      return updated;
    }
  }
}
