# Whetstone — The Brain

> Status: **shipped, standalone**
> Scope: a local surface for the human's own working state — jots, tasks and
> reminders — plus a markdown mirror any agent on the machine can read.
> Not wired to agents or Sessions yet; the seams for both are in place.

---

## 1. What the Brain is

A spark, not a store.

Every entry is a **pointer**: short enough to read at a glance, precise enough
to send you back to the work. The context lives where it already lives — in a
run transcript, a PR, a repo, your head. The Brain's only job is to make sure
you re-enter it at the right moment, and that nothing you're holding falls out
while you're deep in something else.

The rule that keeps it useful: **hit a spark rather than hold the whole fire.**
If an entry needs a paragraph to make sense, it belongs somewhere else.

It answers four questions, in this order:

| Question | Where it's answered |
|----------|--------------------|
| What just landed on me? | **Due now** — only present when the clock has spoken |
| What am I actually holding? | **In hand** |
| What am I meant to get to? | **Outstanding** |
| What have I done? | **Done** (last 7 days) |

with the margin rail holding **Watching** (armed reminders) and **Jots**
(loose notes) in the corner of your eye.

### Not the same thing as session memory

| | Session memory (`docs/session-memory.md`) | The Brain |
|---|---|---|
| Whose | The Session's — shared between agent runs | The human's — machine-wide |
| Written by | Agents, mid-run, via `remember` | You, in the app |
| Scope | One Session | Everything you're carrying |
| Read by | The next run in that Session | You, and any agent that reads the mirror |

They will meet later (§5). They are deliberately separate now.

---

## 2. The three kinds

| Kind | What it's for | Statuses |
|------|---------------|----------|
| `jot` | A thought you don't want to carry. No clock, no lane. | live → filed |
| `task` | Something to do. | outstanding → in hand → done |
| `reminder` | Something to surface at a time. | armed → acknowledged |

One vocabulary underneath (`open` / `doing` / `done` / `dropped`), read
differently per kind — see `BRAIN_STATUS_LABELS` in `src/shared/brain.ts`.

A task may also carry a `dueAt`, in which case it fires like a reminder. That
falls out of the model rather than being a feature: the ticker looks at
`dueAt`, not at `kind`.

---

## 3. How it's built

| Layer | File |
|-------|------|
| Domain types + pure helpers | `src/shared/brain.ts` |
| Storage (one table, `kind` discriminator) | `src/main/db/schema.ts`, `src/main/repo/brain.ts` |
| Markdown mirror for agents | `src/main/brain/mirror.ts` |
| The clock | `src/main/brain/reminders.ts` |
| IPC wiring | `src/main/ipc/index.ts` |
| Renderer state | `src/renderer/src/state/useBrain.ts` |
| UI | `src/renderer/src/components/brain/*` |

Two decisions worth naming:

**Main owns the truth.** Every mutation republishes the *whole* board over
`stream:brain-changed`. The board is small by construction, so a diff protocol
would cost more than it saves — and it means a reminder firing on main's clock
reaches the UI by exactly the same path as a click.

**One table, not three.** Jots, tasks and reminders share every column and are
read together. Splitting them would buy nothing but joins.

---

## 4. The mirror: `~/.whetstone/brain.md`

The Brain's agent-facing face. Rewritten atomically (temp file + rename) on
every change, so a reader always sees a complete document.

The point is **proximity**. Any agent on this machine — a Claude Code run in
any repo, a script, a cron job — can read one well-known path and know what
you're holding, without whetstone running and without an API to speak:

```bash
cat ~/.whetstone/brain.md
```

Each line carries a short id (`` `id:8f2a1c` ``) so an agent can refer to a
specific entry back to you. Markers read as kind *and* state down the left
edge: `[ ]` outstanding, `[~]` in hand, `[x]` done, `[@]` on a clock, `[.]` a jot.

**One direction for now: whetstone writes, everyone reads.** Edits to the file
are overwritten.

---

## 5. Deliberately not built yet

| | Why it waits |
|---|---|
| Agents *writing* to the Brain | Needs a tool + an approval story. The `createdBy: 'agent'` column and its badge already exist, so the surface is ready for it. |
| Linking entries to Sessions | `sessionId` is on the table and nulled today. Wiring it means deciding what a Session-scoped Brain view is, which is its own question. |
| Non-time triggers ("when CI comments") | The ticker is one implementation of *claim → notify → publish*. An event source calls the same seam; nothing about the model changes. |
| Editing an entry's body | Capture is title-only on purpose. If a Brain entry wants a body, that is usually a sign it wants to be a doc. |
| Tests | The repo has no test runner yet. The storage layer, the mirror renderer and the clock helpers are all pure/injectable and were verified against real SQLite during development — they are ready for a suite the moment one exists. |
