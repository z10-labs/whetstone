/**
 * Live Cards — small, self-updating UI an agent describes once and whetstone
 * keeps fresh (see docs/live-cards.md). Shared between main and renderer:
 * the spec types, their zod schemas (validated at the `card` tool boundary),
 * and the pure helpers both sides need (reading a `$bind` out of state).
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Spec schemas
// ---------------------------------------------------------------------------

export const TONES = ['ok', 'run', 'warn', 'err', 'dim'] as const;
export type Tone = (typeof TONES)[number];
const toneSchema = z.enum(TONES);

/** A literal, or `{ $bind: "/json/pointer" }` into the card's state. */
export interface BindRef {
  $bind: string;
}
const bindSchema = z.object({ $bind: z.string().startsWith('/') }).strict();
const val = <T extends z.ZodType>(t: T) => z.union([t, bindSchema]);

export const STEP_STATUSES = ['done', 'running', 'pending', 'failed', 'blocked'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

const stepSchema = z.object({
  name: z.string(),
  status: z.enum(STEP_STATUSES),
  detail: z.string().optional(),
  tone: toneSchema.optional(),
});
export type Step = z.infer<typeof stepSchema>;

export const TAG_KINDS = ['likely', 'open', 'ruled-out', 'done'] as const;
const tagItemSchema = z.object({
  tag: z.enum(TAG_KINDS),
  text: z.string(),
  note: z.string().optional(),
});
export type TagItem = z.infer<typeof tagItemSchema>;

const actionSchema = z.union([
  z.object({ label: z.string(), send: z.string(), danger: z.boolean().optional() }).strict(),
  z.object({ label: z.string(), open: z.url({ protocol: /^https$/ }) }).strict(),
]);
export type CardAction = z.infer<typeof actionSchema>;

const blockSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('stat'),
    label: z.string().optional(),
    value: val(z.union([z.string(), z.number()])),
    format: z.enum(['duration', 'count', 'percent']).optional(),
    note: val(z.string()).optional(),
    tone: toneSchema.optional(),
  }),
  z.object({
    kind: z.literal('progress'),
    value: val(z.number()),
    max: val(z.number()).optional(),
    label: val(z.string()).optional(),
  }),
  z.object({
    kind: z.literal('budget'),
    value: val(z.number()),
    reference: val(z.number()),
    limit: val(z.number()),
    unit: z.enum(['sec', 'count']),
  }),
  z.object({ kind: z.literal('steps'), items: val(z.array(stepSchema)) }),
  z.object({
    kind: z.literal('kv'),
    items: z.array(z.object({ label: z.string(), value: val(z.union([z.string(), z.number()])) })),
  }),
  z.object({ kind: z.literal('sparkline'), points: val(z.array(z.number())), label: z.string() }),
  z.object({ kind: z.literal('log'), lines: val(z.array(z.string())), max: z.number().int().positive().optional() }),
  z.object({ kind: z.literal('tags'), items: val(z.array(tagItemSchema)) }),
  z.object({
    kind: z.literal('options'),
    items: z.array(
      z.object({
        title: z.string(),
        pros: z.array(z.string()).optional(),
        cons: z.array(z.string()).optional(),
        leaning: z.boolean().optional(),
      }),
    ),
  }),
  z.object({
    kind: z.literal('choice'),
    prompt: z.string(),
    options: z.array(z.string()).min(2),
  }),
  z.object({ kind: z.literal('markdown'), text: z.string() }),
  z.object({ kind: z.literal('actions'), items: z.array(actionSchema).min(1) }),
]);
export type Block = z.infer<typeof blockSchema>;
export type BlockKind = Block['kind'];

/** Shortest interval any binding may poll at. */
export const MIN_POLL_SEC = 5;

const repoSchema = z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'repo must be owner/name');
const bindingSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('gh-run'),
    repo: repoSchema,
    runId: z.number().int().positive(),
    everySec: z.number().int().min(MIN_POLL_SEC).optional(),
  }),
  z.object({
    kind: z.literal('gh-pr'),
    repo: repoSchema,
    pr: z.number().int().positive(),
    everySec: z.number().int().min(MIN_POLL_SEC).optional(),
  }),
  z.object({
    kind: z.literal('command'),
    command: z.string().min(1),
    cwd: z.string().optional(),
    everySec: z.number().int().min(MIN_POLL_SEC),
  }),
  z.object({
    kind: z.literal('file'),
    path: z.string().min(1),
    parse: z.enum(['json', 'tail']),
    lines: z.number().int().positive().optional(),
    everySec: z.number().int().min(MIN_POLL_SEC).optional(),
  }),
]);
export type Binding = z.infer<typeof bindingSchema>;
export type BindingKind = Binding['kind'];

const triggerSchema = z.object({
  path: z.string().startsWith('/'),
  op: z.enum(['eq', 'ne', 'gt', 'lt', 'changed']),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  note: z.string().min(1),
});
export type Trigger = z.infer<typeof triggerSchema>;

export const cardSpecSchema = z.object({
  title: z.string().min(1).max(120),
  subtitle: z.string().max(160).optional(),
  tone: z.enum(['default', 'attention']).optional(),
  binding: bindingSchema.optional(),
  blocks: z.array(blockSchema).max(24),
  wakeOn: z.array(triggerSchema).max(8).optional(),
  settleOn: triggerSchema.omit({ note: true }).extend({ note: z.string().optional() }).optional(),
  suggestPin: z.boolean().optional(),
});
export type CardSpec = z.infer<typeof cardSpecSchema>;

/** Fields `card update` may change; blocks/wakeOn replace wholesale. */
export const cardPatchSchema = cardSpecSchema.omit({ binding: true }).partial();
export type CardPatch = z.infer<typeof cardPatchSchema>;

/** Readable, one-line-per-issue validation error for the agent. */
export function describeSpecError(err: z.ZodError): string {
  return err.issues
    .slice(0, 6)
    .map((i) => `- ${i.path.length ? i.path.join('.') : '(spec)'}: ${i.message}`)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Stored card
// ---------------------------------------------------------------------------

export const CARD_STATUSES = ['live', 'settled', 'error', 'awaiting-approval', 'closed'] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

/** At most this many pinned cards; pinning one more asks which to unpin. */
export const MAX_PINNED = 12;

export interface LiveCard {
  id: string;
  /** null once the origin session is deleted: the card is an orphan. */
  originSessionId: string | null;
  originRunId: string | null;
  /** Denormalised for the "from <session>" label on pinned cards. */
  originSessionName: string | null;
  spec: CardSpec;
  /** Last binding output; null for static cards or before the first tick. */
  state: unknown;
  status: CardStatus;
  lastError: string | null;
  /** Indices into `spec.wakeOn` that have already fired. */
  firedTriggers: number[];
  bindingApprovedAt: number | null;
  pinnedAt: number | null;
  pinOrder: number | null;
  settledAt: number | null;
  lastPolledAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** What the Live tab shows for one session. */
export interface LiveCardsView {
  session: LiveCard[];
  pinned: LiveCard[];
}

/** Payload of the CardChanged stream: an upserted card, or a removal. */
export type CardChange = { card: LiveCard } | { removedId: string };

/** The `data` shape stored on a `card` RunEvent. */
export interface CardEventData {
  cardId: string;
  title: string;
  action: 'create' | 'update' | 'close';
}

export function shortCardId(id: string): string {
  return id.replace(/-/g, '').slice(0, 6);
}

export function isPinned(card: LiveCard): boolean {
  return card.pinnedAt !== null;
}

// ---------------------------------------------------------------------------
// Binding resolution (pure; used by the renderer and by triggers)
// ---------------------------------------------------------------------------

/** RFC 6901 JSON pointer lookup. Returns undefined for anything missing. */
export function readPointer(state: unknown, pointer: string): unknown {
  if (pointer === '' || pointer === '/') return state;
  const parts = pointer
    .slice(1)
    .split('/')
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur: unknown = state;
  for (const part of parts) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function isBindRef(v: unknown): v is BindRef {
  return typeof v === 'object' && v !== null && typeof (v as BindRef).$bind === 'string';
}

/** A spec value with any `$bind` read out of state. */
export function resolveValue<T>(v: T | BindRef | undefined, state: unknown): T | undefined {
  if (v === undefined) return undefined;
  if (isBindRef(v)) return readPointer(state, v.$bind) as T | undefined;
  return v;
}
