# Whetstone — The Brain

> Status: **shipped, tested**
> Scope: a local surface for the human's own working state — jots, tasks,
> reminders, and one **mission** per Session — plus a markdown mirror any agent
> on the machine can read, a digest every run is launched with, and a `brain`
> tool agents write through.

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

## 2. The four kinds

| Kind | What it's for | Statuses |
|------|---------------|----------|
| `jot` | A thought you don't want to carry. No clock, no lane. | live → filed |
| `task` | Something to do. | outstanding → in hand → done |
| `reminder` | Something to surface at a time. | armed → acknowledged |
| `mission` | Why a Session exists. One per Session, never more. | live → closed |

One vocabulary underneath (`open` / `doing` / `done` / `dropped`), read
differently per kind — see `BRAIN_STATUS_LABELS` in `src/shared/brain.ts`.

A task may also carry a `dueAt`, in which case it fires like a reminder. That
falls out of the model rather than being a feature: the ticker looks at
`dueAt`, not at `kind`.

### Missions — the Brain meets Sessions

A Session is born with a mission: its name is the goal until you reword it,
its description the first lines of direction. The mission is the one Brain
entry allowed a body, because it is the spark for a whole Session — but it is
still a few lines, not a document. If it wants more, that is a doc in the
repo, and the mission points at it.

Goals, ideas and nudges for a Session are ordinary tasks, jots and reminders
that carry its `sessionId`. They show in the global lanes with a quiet session
tag (what you are holding is what you are holding, whichever Session it came
from) and roll up on the mission card as a shape: *1 in hand · 2 outstanding*.
The mission card carries its own capture field, so a goal lands in the right
Session without a picker.

Agents in that Session get the mission at launch (§4) and can write back
through the `brain` tool (§4). Both of you edit the same lines; an agent's
edits wear the `agent` badge and appear in the mirror, so the trust is
visibility rather than permission.

Closing a mission moves it to Done like any task. The Session's other entries
stay where they are. Deleting a Session removes its mission; its tasks stay,
unlinked, because a task you wrote is still a task.

**Not the same as session memory.** Session memory is state — what agents
decided, made and left open, for the next agent. The mission is direction —
why the Session exists, for you. They meet in the digest and nowhere else.

### Capturing

One field, Enter commits. `⌘J` (`Ctrl+J` elsewhere) jumps to it from anywhere
in the app. A time written in the line is read out of it — the phrase has to
sit at the start or the end, and a bare number is never a time, so
"build task 33" stays exactly that:

| You type | Read as |
|----------|---------|
| `ping the reviewer in 30m` | reminder · now + 30 min |
| `review the PR tomorrow at 2pm` | tomorrow 14:00 |
| `deploy at 3` | 15:00 today (bare hours below 8 read as afternoon) |
| `kick off sprint mon 10am` | next Monday 10:00 |
| `close the laptop tonight` | 18:00 today |
| `remind me to rotate keys` | a reminder whatever mode is selected |

A jot that names a time becomes a reminder — a jot by definition has no clock.
A task that names a time stays a task and carries it as a due date. The field
echoes what it read before you commit, so a misread is visible, not silent.
Grammar lives in `src/renderer/src/components/brain/parse-when.ts`; anything
it does not cover falls through to the chips and the picker.

---

## 3. How it's built

| Layer | File |
|-------|------|
| Domain types + pure helpers | `src/shared/brain.ts` |
| Storage (one table, `kind` discriminator) | `src/main/db/schema.ts`, `src/main/repo/brain.ts` |
| Markdown mirror for agents | `src/main/brain/mirror.ts` |
| The one publish path (mirror + windows) | `src/main/brain/publish.ts` |
| The `brain` tool an agent calls | `src/main/brain/agent-tool.ts` (wired in `agents/runner.ts`, `agents/claude-code.ts`) |
| Mission + open entries in the launch digest | `src/main/agents/session-context.ts` |
| The clock | `src/main/brain/reminders.ts` |
| IPC wiring | `src/main/ipc/index.ts` |
| Renderer state | `src/renderer/src/state/useBrain.ts` |
| UI | `src/renderer/src/components/brain/*` |
| Natural time in capture | `src/renderer/src/components/brain/parse-when.ts` |
| Tests (`npm test`) | `*.test.ts` beside each of the above |

Two decisions worth naming:

**Main owns the truth.** Every mutation republishes the *whole* board over
`stream:brain-changed`. The board is small by construction, so a diff protocol
would cost more than it saves — and it means a reminder firing on main's clock
reaches the UI by exactly the same path as a click.

**One table, not three.** Jots, tasks and reminders share every column and are
read together. Splitting them would buy nothing but joins.

**The claim is one statement.** The ticker surfaces due entries with a single
`UPDATE … RETURNING` that stamps `firedAt` and reads the winners at once, so
two overlapping ticks can never both walk away with the same reminder.

### Tests

`npm test` runs Vitest in plain Node. The storage layer runs against a real
in-memory SQLite (`initDbAt(':memory:')`), not a mock; the mirror renderer,
the clock helpers and the capture grammar are pure and tested directly. The
UI itself is not unit-tested — it is a thin read of `useBrain`'s lanes.

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

**One direction: whetstone writes, everyone reads.** Edits to the file are
overwritten. Agents that want to write use the `brain` tool inside a run.

Live missions lead the file under `## Missions`, each as the Session name,
the goal and its direction. Linked entries name their Session at the end of
their line.

### Inside a run: the digest and the `brain` tool

Every run in a Session is launched with a digest in its system prompt (see
`docs/session-memory.md`). The Brain adds a **Mission** section to it, ahead of
the run roster: the mission, its body, and the open entries linked to the
Session, each with its short id.

The `brain` tool gives the agent three verbs, no more:

| Call | Does |
|------|------|
| `brain({ action: 'add', kind?, title, inMinutes? })` | Put a task, jot or reminder in front of the human, linked to this Session. Reminders need `inMinutes`. |
| `brain({ action: 'done', id })` | Close an entry by the `id:8f2a1c` it read. |
| `brain({ action: 'mission', title?, body? })` | Set or reword the Session's mission. |

Every call publishes the board and leaves a `brain` event in the transcript,
so nothing an agent puts in front of you happens out of sight. That is how
"CI is running and will need your approval in 20m" arrives from a run.

---

## 5. Deliberately not built yet

| | Why it waits |
|---|---|
| Approval on agent writes | Agents write with the badge on. If that is ever abused, an approval queue slots in front of `applyBrainTool` without touching the model. |
| Missions for Sessions that predate this | Not backfilled: an old Session gets a mission when you press *Set a mission* in its panel, not by surprise. |
| Session lifecycle ("finish the mission's items when the Session ends") | Sessions have no end state yet. When they do, closing one should close its mission and drop its open entries; the repo calls already exist. |
| Non-time triggers ("when CI comments") | The ticker is one implementation of *claim → notify → publish*. An event source calls the same seam; nothing about the model changes. |
| `next_step` in session memory vs. tasks here | Both exist. A next step is a note for the next agent; a task is a commitment you can see. If that turns out to be one thing, drop `next_step` and let agents add session tasks. |
| Editing an entry's body | Capture is title-only on purpose. If a Brain entry wants a body, that is usually a sign it wants to be a doc. |
| A richer time grammar ("every Monday", "end of month") | Recurrence is a different model — an entry that re-arms itself — not a parser gap. Wait for the need. |
