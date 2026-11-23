/**
 * What an agent can do with Live Cards, behind the `card` tool: create one,
 * update one it (or a sibling run in its Session) made, or close one. Pinning
 * is deliberately absent — the pinned area is the human's (spec §5); an agent
 * can only set `suggestPin`.
 *
 * Pure over the repository so it is testable without Electron. The runner
 * starts polling, broadcasts and writes the transcript event after this returns.
 */

import {
  cardPatchSchema,
  cardSpecSchema,
  describeSpecError,
  shortCardId,
  type CardSpec,
  type LiveCard,
} from '@shared/cards';
import { createCard, findCardInSession, patchCard } from '../repo/cards';
import { bindingNeedsApproval } from './approval';

export type CardToolAction = 'create' | 'update' | 'close';

export interface CardToolInput {
  action: CardToolAction;
  /** For `create`: the whole card. */
  spec?: unknown;
  /** For `update` and `close`: the card id, full or `id:3fa9c1`. */
  id?: string;
  /** For `update`: fields to replace (title, blocks, wakeOn…). The binding cannot change. */
  patch?: unknown;
}

export interface CardToolResult {
  card: LiveCard;
  action: CardToolAction;
  /** One line back to the agent. */
  ack: string;
}

export interface CardToolScope {
  sessionId: string;
  runId: string;
  cwd: string | null;
}

const ref = (card: LiveCard) => `id:${shortCardId(card.id)}`;

async function create(input: CardToolInput, scope: CardToolScope): Promise<CardToolResult> {
  const parsed = cardSpecSchema.safeParse(input.spec);
  if (!parsed.success) throw new Error(`Invalid card spec:\n${describeSpecError(parsed.error)}`);
  const spec: CardSpec = parsed.data;
  const waits = spec.binding ? bindingNeedsApproval(spec.binding, scope.cwd) : false;
  const card = await createCard({
    sessionId: scope.sessionId,
    runId: scope.runId,
    spec,
    // A static card is `live` too: the poller only runs cards with a binding.
    status: waits ? 'awaiting-approval' : 'live',
  });
  const note = waits
    ? ' The human must allow its binding before it starts polling.'
    : spec.binding
      ? ' Whetstone refreshes it; you will be woken if a wakeOn trigger fires.'
      : '';
  return { card, action: 'create', ack: `Card created ${ref(card)} · ${spec.title}.${note}` };
}

async function find(input: CardToolInput, scope: CardToolScope): Promise<LiveCard> {
  if (!input.id?.trim()) throw new Error(`\`${input.action}\` needs the card id`);
  // Scoped to the run's own Session: an agent edits what its Session made.
  const card = await findCardInSession(input.id, scope.sessionId);
  if (!card) throw new Error(`No card matches ${input.id} in this session`);
  return card;
}

async function update(input: CardToolInput, scope: CardToolScope): Promise<CardToolResult> {
  const card = await find(input, scope);
  const parsed = cardPatchSchema.safeParse(input.patch);
  if (!parsed.success) throw new Error(`Invalid patch:\n${describeSpecError(parsed.error)}`);
  const spec = cardSpecSchema.parse({ ...card.spec, ...parsed.data });
  const updated = await patchCard(card.id, { spec });
  return { card: updated, action: 'update', ack: `Card updated ${ref(updated)} · ${spec.title}` };
}

async function close(input: CardToolInput, scope: CardToolScope): Promise<CardToolResult> {
  const card = await find(input, scope);
  const updated = await patchCard(card.id, { status: 'settled', settledAt: Date.now() });
  return { card: updated, action: 'close', ack: `Card closed ${ref(updated)} · ${card.spec.title}` };
}

export async function applyCardTool(
  input: CardToolInput,
  scope: CardToolScope,
): Promise<CardToolResult> {
  switch (input.action) {
    case 'create':
      return create(input, scope);
    case 'update':
      return update(input, scope);
    case 'close':
      return close(input, scope);
  }
}
