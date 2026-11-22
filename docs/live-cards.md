# Whetstone — Live Cards

> Status: **DRAFT for review**
> Scope: a **Live panel** in the inspector where an agent can put small,
> self-updating cards (a CI run, a long job, an approval, a decision it is
> weighing), and where the human can **pin** the ones worth keeping so they
> outlive the session that made them.
> Design: https://claude.ai/artifact/6rS4AJVP7XJuTD2sFL6Zyr (workbench + card kit)
> Author: pairing session, 2026-11-22

---

## 1. What a Live Card is

A transcript is good at telling what happened. It is bad at showing something
that is *still happening*. A 28-minute CI run turns into ten "still running"
messages, and the agent spends tokens on each one.

A Live Card is a small UI the agent **describes once**. Whetstone **keeps it
fresh** by itself and **wakes the agent** only when something in the card says it
should. The bet, in one sentence:

> The model writes the card's shape; the host keeps it live; the agent is woken
> only for decisions.

Three things follow from that:

- **No tokens while waiting.** Polling `gh run view` every 5 s is the main
  process's job, not the model's.
- **Cards work while the agent is idle.** A run can end its turn and the card
  keeps ticking. When a trigger fires, the run resumes.
- **Cards are worth keeping.** A card that tracks CPU or Actions minutes is useful
  long after the conversation that made it. That's what **pinning** is for (§5).

### Not the same thing as session memory or the Brain

| | Session memory | Brain | Live Cards |
|---|---|---|---|
| What it holds | facts agents hand off | the human's tasks and direction | things that change while you watch |
| Written by | agents (`remember`) | human, agents add | agents describe, the host refreshes |
| Shape | entries → digest | items → board | declarative card spec + live state |
| Lifetime | the session | until done | the session, or **pinned** until unpinned |

---

## 2. Confirmed decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Representation | **Declarative spec from a fixed block kit** (§3), rendered by our own React components. No agent-authored HTML in v1 |
| 2 | Freshness | **Bindings run in the main process** (§4), not in the renderer and never by the model |
| 3 | Agent surface | One in-process tool, **`card`**, with `create` / `update` / `close` actions, wired through the same `whetstone` MCP server as `brain` and `remember` |
| 4 | Legibility | Every `card` call emits a **`card` `RunEvent`** and renders as a chip in the transcript ("Card created · release.yml #4812") linked to the card |
| 5 | Waking | **Triggers** on the card's state resume the origin run with a synthetic message (§6). Buttons on a card use the same path |
| 6 | Pinning | **Human-only.** The agent can *suggest* a pin; only the human pins (§5) |
| 7 | Pinned lifetime | A pinned card **outlives its session** and survives restarts. It **settles** (freezes, stops polling) when its binding reaches a terminal state |
| 8 | Shell bindings | A `command` binding needs **human approval once per card** unless it matches the read-only allow-list (§7) |
| 9 | Storage | One `live_cards` table (§8); state is stored so cards render instantly on launch |

---

## 3. The card spec

A card is a title, an optional binding, and an ordered list of **blocks**. Blocks
read values from the card's **state**, a JSON object the binding produces. They do
that with a JSON-pointer `$bind`, never an expression. Anything that needs
computing is computed by the binding adapter (§4), so specs stay dumb and safe.

```ts
// src/shared/cards.ts
export interface CardSpec {
  title: string;
  subtitle?: string;               // "GitHub Actions · main · a41f9c2"
  tone?: 'default' | 'attention';  // attention = clay border, "Needs you"
  binding?: Binding;               // none = static card
  blocks: Block[];
  wakeOn?: Trigger[];              // §6
  settleOn?: Trigger;              // terminal state → freeze + stop polling
  suggestPin?: boolean;            // §5
}

type Value<T> = T | { $bind: string };   // "/jobs/2/elapsedSec"

export type Block =
  | { kind: 'stat'; label?: string; value: Value<string | number>; format?: 'duration' | 'count' | 'percent'; note?: Value<string>; tone?: Tone }
  | { kind: 'progress'; value: Value<number>; max?: Value<number>; label?: Value<string> }
  | { kind: 'budget'; value: Value<number>; reference: Value<number>; limit: Value<number>; unit: 'sec' | 'count' }
  | { kind: 'steps'; items: Value<Step[]> }        // CI stages, plan checklists
  | { kind: 'kv'; items: { label: string; value: Value<string | number> }[] }
  | { kind: 'sparkline'; points: Value<number[]>; label: string }
  | { kind: 'log'; lines: Value<string[]>; max?: number }
  | { kind: 'tags'; items: Value<{ tag: 'likely' | 'open' | 'ruled-out' | 'done'; text: string; note?: string }[]> }
  | { kind: 'options'; items: { title: string; pros?: string[]; cons?: string[]; leaning?: boolean }[] }
  | { kind: 'choice'; prompt: string; options: string[]; send: string }   // quick pick → agent
  | { kind: 'markdown'; text: string }
  | { kind: 'actions'; items: Action[] };

export interface Step { name: string; status: 'done' | 'running' | 'pending' | 'failed' | 'blocked'; detail?: string; tone?: Tone }
export type Tone = 'ok' | 'run' | 'warn' | 'err' | 'dim';
export type Action =
  | { label: string; send: string }                 // message back to the agent
  | { label: string; open: string }                 // https URL, opened externally
  | { label: string; danger?: boolean; send: string };
```

The kit is exactly what the design canvas shows: the CI card is `stat` +
`budget` + `steps` + `log` + `actions`. The approval card is `markdown` +
`actions` with `tone: 'attention'`. The hypothesis card is `tags`. New
block kinds are added to the kit by us, not invented by the agent.

The spec is validated with zod at the tool boundary. An invalid spec is a tool
error with a readable message, so the agent can fix it and retry.

---

## 4. Bindings

A binding is **a source plus an interval**, run by a `CardPoller` in the main
process. Each tick produces a new state object. The poller diffs it against the
stored state, saves it, and pushes `cards:changed` to the renderer.

| Kind | Source | State shape | v1 |
|---|---|---|---|
| `gh-run` | `gh run view <id> --repo <r> --json …` | normalised: `status`, `conclusion`, `elapsedSec`, `typicalSec`, `jobs[]` as `Step[]`, `logTail[]` | **yes** |
| `gh-pr` | `gh pr view <n> --json …` | `checks`, `review`, `unresolved`, `mergeable` | yes |
| `command` | any shell command whose stdout is JSON | whatever the command prints | yes, approval-gated (§7) |
| `file` | watch a file (JSON, or the last N lines of text) | parsed JSON or `{ lines }` | yes |
| `terminal` | a Whetstone terminal tab's output | `{ lines }` | later |
| `http` | GET a URL | parsed JSON | later |

```ts
export type Binding =
  | { kind: 'gh-run'; repo: string; runId: number; everySec?: number }
  | { kind: 'gh-pr'; repo: string; pr: number; everySec?: number }
  | { kind: 'command'; cwd: string; command: string; everySec: number }
  | { kind: 'file'; path: string; parse: 'json' | 'tail'; lines?: number };
```

Typed adapters (`gh-run`, `gh-pr`) do the work an agent would otherwise do in its
head. `typicalSec` is the median of that workflow's last 10 successful runs,
fetched once when the card is created. That gives you "3.1× usual" for free.

Rules:

- Minimum interval **5 s**. Defaults: `gh-run` 5 s, `gh-pr` 30 s, `command` as given.
- **Backoff when unwatched:** while the window is unfocused, intervals ×4. Pinned
  cards from other sessions (§5) also run ×4 unless their panel is open.
- A binding that errors 3 times in a row puts the card in `error` state (shown on
  the card, with the last error). It retries every 60 s and never wakes the
  agent on its own.
- **Settling:** when `settleOn` matches (for `gh-run`, the default is
  `/status == "completed"`), the poller does one final read, freezes the state,
  and stops. A settled card is a record, not a watcher.

---

## 5. Pinning

Most cards belong to the conversation that made them and should go away with it.
Some are worth keeping: a CPU sparkline, the Actions-minutes budget, a release
run you want to see go green tomorrow morning. Pinning moves a card from the
session to the **human's own space**.

### What pinning does

| | Session card | Pinned card |
|---|---|---|
| Where it shows | that session's Live tab | the **Pinned** section at the bottom of *every* session's Live tab, plus the Home view |
| Lifetime | archived with the session | until **unpinned**; survives session archive, delete and app restarts |
| Polling | while live, normal interval | while live; ×4 when not on screen |
| Who can update it | its origin run(s) via `card update` | still its origin session's runs, if that session exists |
| Wake triggers | resume the origin run | resume the origin run if the session exists, otherwise a **notification only** (below) |
| Order | creation order, newest first | the human's own order (drag) |

### Who can pin

- **Only the human.** You pin from the card's footer (**Pin**) or from its
  transcript chip. The pinned area is the human's dashboard, the same rule as the
  Brain: agents add to it, they don't arrange it.
- The agent can set `suggestPin: true`. The card then shows **Pin** as the
  primary footer button, with the hint "Worth keeping?" It never pins anything
  itself.
- **Unpin** puts the card back in its origin session, or dismisses it if that
  session is gone. **Dismiss** removes it everywhere.

### Origin and orphans

A pinned card keeps `originSessionId` and shows it as a small label ("from
worker-cpu-cost"), which links back to that session. If the origin session is
deleted, `originSessionId` becomes null and the card is an **orphan**:

- it still renders and its binding still polls,
- a trigger that would have woken an agent posts a desktop notification instead.
  Its action is **Start a session from this card**, which opens a new session
  with the card's spec and current state as the first message,
- `send` actions and `choice` blocks on it are disabled, with the tooltip "No
  session to send to".

### Pinned and settled

Pinned CI cards will usually settle (finish) while you're away. A settled pinned
card keeps showing its final state, with "finished 2h ago" in the footer. It
stays until you dismiss it. A pin is a deliberate act, so we never auto-dismiss.

### Limits

- At most **12 pinned cards**. The 13th pin asks which one to unpin. Twelve fill
  about two screens of the panel, and this caps background polling.
- Pinned cards are local to this machine (SQLite). Syncing is out of scope.

---

## 6. Waking the agent

A **trigger** is a condition on the card's state:

```ts
export interface Trigger {
  path: string;                                  // JSON pointer into state
  op: 'eq' | 'ne' | 'gt' | 'lt' | 'changed';
  value?: string | number | boolean;
  note: string;                                  // what the agent is told
}
// e.g. { path: '/conclusion', op: 'eq', value: 'failure', note: 'run failed' }
//      { path: '/elapsedSec', op: 'gt', value: 2100,      note: 'passed 35 min' }
```

- Each trigger fires **once** per card (stored in `firedTriggers`).
- When one fires, the card's **origin run** resumes (`resume: run.externalId`,
  as the runner already does) with a synthetic user message:
  `[card <short-id> · <title>] trigger: <note>`, followed by the card's current
  state as fenced JSON. It shows in the transcript as the divider in the design
  ("19 min later · woken by card: …").
- If the run is mid-turn, the message is queued and delivered when the turn ends.
- If the window isn't focused, a desktop notification opens the card.
- **Buttons and choices use the same path.** `send` and `choice` deliver
  `[card <short-id>] <label or picked option>` as a user message. Unlike triggers,
  they're the human talking, so they count as user turns.

---

## 7. Safety

- **No HTML from the agent.** Cards render only through our block components, and
  all text is rendered as text. A raw-HTML escape hatch (sandboxed iframe, strict
  CSP) is deferred (§11).
- **`command` bindings run without the agent's permission system**, on a timer,
  possibly for days if pinned. So:
  - a command matching the **read-only allow-list** (`gh run view`,
    `gh pr view`, `gh api` GET, `git status|log|rev-parse`, `cat`, `tail`,
    `wc`, `jq`) starts immediately,
  - anything else shows an approval strip on the card ("Allow this card to run
    `npm run --silent stats` every 30s?"). Nothing runs until you approve, and
    approval is per card, never global,
  - commands run with the session's `cwd`, a 10 s timeout and 1 MB of output.
    Non-JSON output is a binding error.
- **`file` bindings** read only. Paths outside the session's `cwd` and `~/.whetstone`
  need the same one-time approval.
- **`open` actions** accept `https:` URLs only and open in the system browser.

---

## 8. Data model

```ts
// src/main/db/schema.ts
export const liveCards = sqliteTable(
  'live_cards',
  {
    id: text('id').primaryKey(),
    originSessionId: text('origin_session_id').references(() => sessions.id, { onDelete: 'set null' }),
    originRunId: text('origin_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    spec: text('spec', { mode: 'json' }).notNull(),          // CardSpec
    state: text('state', { mode: 'json' }),                   // last binding output
    status: text('status').notNull().default('live'),         // live | settled | error | awaiting-approval
    lastError: text('last_error'),
    firedTriggers: text('fired_triggers', { mode: 'json' }).notNull().default('[]'),
    bindingApprovedAt: integer('binding_approved_at'),
    pinnedAt: integer('pinned_at'),                           // null = not pinned
    pinOrder: integer('pin_order'),
    dismissedAt: integer('dismissed_at'),
    settledAt: integer('settled_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('live_cards_session_idx').on(t.originSessionId),
    index('live_cards_pinned_idx').on(t.pinnedAt),
  ],
);
```

`onDelete: 'set null'` gives us orphans (§5) without extra code. Session-scoped
cards of a deleted session are swept by a query in `repo/cards.ts`
(`pinnedAt is null and originSessionId is null`).

---

## 9. How it's built

```
src/shared/cards.ts           CardSpec, Block, Binding, Trigger types + zod schemas
src/main/cards/agent-tool.ts  `card` tool: create / update / close (pure over the repo, like brain/agent-tool.ts)
src/main/cards/poller.ts      CardPoller: one timer per live card, backoff, settle, error state
src/main/cards/adapters/      gh-run.ts, gh-pr.ts, command.ts, file.ts → state
src/main/cards/triggers.ts    evaluate(spec.wakeOn, prev, next) → fired triggers
src/main/repo/cards.ts        CRUD, pin / unpin / reorder, orphan sweep
src/main/ipc/index.ts         cards:list, cards:pin, cards:unpin, cards:reorder,
                              cards:dismiss, cards:action, cards:approveBinding; push cards:changed
src/renderer/src/components/live/   LivePanel, Card, blocks/*, PinnedSection
src/renderer/src/styles/live.css
```

The `card` tool joins `SUPPRESSED_TOOLS` in `agents/claude-code.ts`, like `brain`.
It renders as a transcript chip, not a generic tool row.

```ts
// what the agent sees
card({ action: 'create', spec })          → "Card created id:3fa9c1 · release.yml #4812"
card({ action: 'update', id, patch })     → merges into spec (title, blocks, wakeOn…)
card({ action: 'close', id })             → settles a session card; a pinned card only stops polling
```

The session digest (`agents/session-context.ts`) gets a short "Live cards" section
listing this session's open cards by short id, so a resumed run knows what it is
watching.

### Tests

- `triggers.test.ts`: every `op`, fire-once, `changed` on the first tick.
- `gh-run.test.ts`: fixture JSON → normalised state, `typicalSec` median.
- `agent-tool.test.ts`: invalid spec → readable error; `update` on another
  session's card is refused.
- `repo/cards.test.ts`: pin cap of 12, unpin back to origin, orphan on session
  delete, sweep leaves pinned cards alone.

---

## 10. Milestones

1. **Static cards.** `card` tool + schema + Live tab + block components + transcript chip. No bindings.
2. **`gh-run` binding.** Poller, settle, error state, `typicalSec`. The CI card from the design works end to end.
3. **Pinning.** Pin / unpin / reorder / dismiss, Pinned section, orphans, cap, backoff for off-screen cards.
4. **Waking.** Triggers, `send` actions, `choice`, notifications, queued delivery to a busy run.
5. **More bindings.** `gh-pr`, `file`, `command` with the approval strip.

---

## 11. Deliberately not built yet

- Agent-authored HTML cards in a sandboxed iframe.
- `terminal` and `http` bindings.
- Cards reading other sessions' pinned cards (for example, a digest of "what the
  owner is watching").
- Syncing pinned cards across machines.
- Agents pinning on their own.

## 12. Open questions for you

1. **Home view:** should pinned cards also get a full-width dashboard (Home), or
   is the Pinned section in each Live tab enough for v1?
2. **Cap:** is 12 pinned cards right, or do you want a hard stop and no prompt?
3. **Orphan wake:** for an orphaned pinned card, is a notification plus "Start a
   session from this card" right, or should a trigger silently start a new
   session?
