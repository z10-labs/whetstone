/**
 * Trigger evaluation for Live Cards (docs/live-cards.md §6). Pure: given the
 * previous and next state, which `wakeOn` triggers fire now, and has the card
 * reached its settle condition. Each trigger fires once per card.
 */

import { readPointer, type Binding, type CardSpec, type Trigger } from '@shared/cards';

type Condition = Omit<Trigger, 'note'>;

/** Does `state` satisfy the condition right now? `changed` needs `prev`. */
export function matches(cond: Condition, state: unknown, prev?: unknown): boolean {
  const v = readPointer(state, cond.path);
  switch (cond.op) {
    case 'eq':
      return v === cond.value;
    case 'ne':
      return v !== undefined && v !== cond.value;
    case 'gt':
      return typeof v === 'number' && typeof cond.value === 'number' && v > cond.value;
    case 'lt':
      return typeof v === 'number' && typeof cond.value === 'number' && v < cond.value;
    case 'changed': {
      // The first tick has nothing to compare with: it never counts as a change.
      if (prev === null || prev === undefined) return false;
      return JSON.stringify(v) !== JSON.stringify(readPointer(prev, cond.path));
    }
  }
}

/** Indices of `wakeOn` triggers that fire on this tick and have not fired before. */
export function firedTriggers(
  wakeOn: Trigger[] | undefined,
  prev: unknown,
  next: unknown,
  alreadyFired: number[],
): number[] {
  if (!wakeOn) return [];
  const done = new Set(alreadyFired);
  return wakeOn.flatMap((t, i) => (!done.has(i) && matches(t, next, prev) ? [i] : []));
}

/** The settle condition a binding gets when the spec does not give one. */
export function defaultSettle(binding: Binding): Condition | null {
  switch (binding.kind) {
    case 'gh-run':
      return { path: '/status', op: 'eq', value: 'completed' };
    case 'gh-pr':
      return { path: '/state', op: 'ne', value: 'OPEN' };
    default:
      return null;
  }
}

export function isSettled(spec: CardSpec, state: unknown): boolean {
  const cond = spec.settleOn ?? (spec.binding ? defaultSettle(spec.binding) : null);
  return cond !== null && matches(cond, state);
}
