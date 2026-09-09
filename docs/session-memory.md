# Whetstone — Session Memory

> Status: **DRAFT for review**
> Scope: a **session brain** — a shared, task-scoped working memory that spans the
> runs inside a Session, that agents read at launch and write into as they work,
> so multiple agents can hand off without re-reading each other's transcripts.
> Author: pairing session, 2026-08-18

---

## 1. What session memory is

Every run already produces a `RunEvent` log — the raw, append-only record of
*everything* that happened. That's **episodic memory**: complete, but long, noisy,
and per-run.

Session memory is a different layer: **working memory**. It's the curated,
session-wide **source of truth** — the handful of things a *sibling* agent needs
to keep going. Decisions made, artifacts produced, questions still open, the next
step. It's derived from and points back into `RunEvent`s, but it is **not** the
log and must never become "just search the events."

The bet, in one sentence:

> A small, structured, shared brain at the **Session** level — injected into every
> run at launch and writable through a tool — lets agents be **session-aware** (they
> know they aren't alone) and lets work **hand off** between runs by construction.

It's a **temporary** brain: scoped to the life of the task/session. When a session
goes stale or done, a future "higher brain" distills it into something longer-lived
(§10). We build the seam for that now, not the thing.

Why Session scope: a `Session` already spans multiple runs and multiple
repos/`cwd`s (see `docs/whetstone-v1.md` §5). That's exactly the boundary a
shared brain wants.

---

## 2. Confirmed decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Representation | **Structured entries** compiled into a digest — on-brand with the structured-first bet; renders as UI cards; the scoping tags enable "which context goes to whom" later |
| 2 | Mutability | **Append-only + `supersedes`** — mirrors the `RunEvent` log; preserves how a decision evolved (fuel for the higher brain) |
| 3 | Reading | **Inject a digest at launch** (system prompt) **+ a `recall` tool** for depth |
| 4 | Injection mechanism | SDK `systemPrompt: { type: 'preset', preset: 'claude_code', append: <digest> }` — rides in the system prompt, stays **out of the transcript**, leaves Claude Code's own instructions intact |
| 5 | Writing | **`remember` tool**, wired through the same in-process MCP seam as `ask_user` |
| 6 | Legibility | Every `remember` also emits a **`memory` `RunEvent`** — memory writes are visible and streamed, never hidden |
| 7 | Digest size (v1) | **Inject everything active**, newest-first per kind. Budgeting/compaction is deferred until it actually hurts |
| 8 | UI (v1) | A **read-only Brain panel** per session (entries as cards). Human editing deferred |
| 9 | Auto-distillation | **Deferred** to a follow-up phase — ship the explicit loop first |
| 10 | Higher brain | **Seam only** — entries carry enough to consolidate/promote later; we build nothing |

---

## 3. Data model

One new table, sibling to the existing spec/run tables in `src/main/db/schema.ts`,
plus one new `RunEventKind`.

```
Session ──1:N──▶ SessionMemoryEntry        (the brain)
Session ──1:N──▶ AgentRun ──1:N──▶ RunEvent (episodic log; a `memory` event mirrors each write)
```

**`session_memory`**

```ts
session_memory {
  id            text primary key
  sessionId     text  → sessions.id (onDelete cascade)   // brain lives at Session scope
  runId         text? → agent_runs.id                     // which run authored it (handover trail)
  cwd           text?                                     // repo/dir the fact pertains to
  kind          text   // 'decision' | 'artifact' | 'open_question' | 'note' | 'next_step'
  title         text
  body          text
  tags          text?  // JSON string[]
  status        text   // 'active' | 'resolved' | 'superseded'
  supersedesId  text? → session_memory.id                 // update without destroying history
  createdBy     text   // 'agent' | 'human' | 'distiller'
  createdAt     integer
  updatedAt     integer
}
// index on (sessionId, status), and on (supersedesId)
```

Notes:
- **Append-only**: an "edit" inserts a new row pointing `supersedesId` at the old
  one and flips the old row's `status` to `superseded`. The digest only reads
  `status = 'active'`.
- `runId` + `cwd` are the scoping tags that a later relevance/routing layer uses to
  decide *which* entries a given run should see (§10). v1 ignores them for reading.

**New `RunEventKind`: `'memory'`** — added to `src/shared/models.ts`. `data`
carries `{ entryId, kind, title }` so the transcript can render a compact "🧠
remembered: …" row and link back to the Brain panel.

Domain shapes go in a new `src/shared/session-memory.ts` (`SessionMemoryEntry`,
`MemoryKind`, `RememberInput`, `RecallQuery`) — following the `src/shared/explain-pr.ts`
precedent.

---

## 4. Reading — the digest and how it reaches the agent

At the moment a run starts, we compile a **digest** and inject it.

**What the digest contains (v1 — everything active):**
1. **Session header** — the session `name` + `description`.
2. **Run roster** — one line per run in the session (title · status · `cwd`),
   pulled for free from `listRunsBySession(sessionId)`. This alone makes an agent
   session-aware: it can see the sibling runs without anyone having written a word.
3. **Memory entries** — all `status = 'active'` entries, grouped by kind, newest
   first, rendered as a terse markdown list.

**A short preamble** frames it, e.g.:

```
You are one of several agents working in a shared Session. The state below is the
shared source of truth across all runs in this session. Read it before acting. When
you make a decision, produce an artifact, or hit an open question, record it with the
`remember` tool so other agents can continue your work. Use `recall` for detail.
```

**Injection** uses the SDK's first-class slot (verified in
`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`):

```ts
systemPrompt: { type: 'preset', preset: 'claude_code', append: digest }
```

This keeps Claude Code's default system prompt, appends our shared state to it (so
it's authoritative for steering), and — crucially — keeps it **out of the run
transcript** (the first `user` event stays clean).

**On-demand depth:** a `recall({ kind?, query? })` tool lets the agent pull
entries beyond whatever the digest shows. In v1 the digest is complete, so `recall`
is mostly a forward-looking seam for when budgeting lands (§10).

---

## 5. Writing — the `remember` tool

Wired through the **exact same in-process MCP seam** as the existing `ask_user`
tool in `src/main/agents/claude-code.ts` — `createSdkMcpServer` + `tool(...)`,
with the runner injecting callbacks.

```ts
remember({
  kind: 'decision' | 'artifact' | 'open_question' | 'note' | 'next_step',
  title: string,
  body: string,
  tags?: string[],
  cwd?: string,          // defaults to the run's cwd
  supersedesId?: string, // to update an earlier entry
})
```

The agent **never supplies its own `runId`** — the runner stamps it from the run
context, the same way `startRun` already owns the `AbortController` and `askUser`
plumbing. On write, the repo:
1. inserts the `session_memory` row (flipping any superseded row to `superseded`),
2. appends a `memory` `RunEvent` and streams it to the renderer.

`recall` is read-only and hits the same `repo/session-memory.ts`.

---

## 6. The full loop (end to end)

1. **Launch** — `startRun` calls `compileDigest(sessionId)` and passes it into the
   provider via `LaunchParams.sessionContext`; the `claude-code` adapter maps it to
   `systemPrompt.append`.
2. **Work** — the agent acts with the shared state in view.
3. **Write** — on a decision / artifact / open question / next step, it calls
   `remember(...)`. The entry is stored; a `memory` `RunEvent` streams to the UI.
4. **Handover** — the next run in the session launches with the updated digest.
   Continuation happens by construction: no one re-reads a full transcript.

```
run A ──remember──▶ session_memory ──compileDigest──▶ systemPrompt.append ──▶ run B
   │                     ▲
   └── memory RunEvent ──┘ (visible in transcript + Brain panel)
```

---

## 7. UI (v1) — the Brain panel

A per-session, **read-only** Brain surface (human editing deferred). Reuses the
patterns the explain-pr feature just established (`IconRail`, a page component, card
components, a `state/useSessionMemory.ts` hook over IPC):

- Entries grouped by kind (Decisions · Artifacts · Open questions · Next steps · Notes).
- Each card: title, body, authoring run (link), `cwd`, timestamp, `status` badge.
- Superseded entries collapsed behind their current version (the history trail).
- Live updates as `memory` RunEvents arrive over the existing `onRunEvent` stream.

---

## 8. Integration points (files to touch)

| Layer | File | Change |
|---|---|---|
| Schema | `src/main/db/schema.ts` | add `session_memory` table + indexes |
| Domain | `src/shared/session-memory.ts` (new) | `SessionMemoryEntry`, `MemoryKind`, `RememberInput`, `RecallQuery` |
| Domain | `src/shared/models.ts` | add `'memory'` to `RunEventKind` |
| Repo | `src/main/repo/session-memory.ts` (new) | `remember`, `recall`, `listBySession`, supersede logic |
| Digest | `src/main/agents/session-context.ts` (new) | `compileDigest(sessionId)` (session + roster + entries) |
| Seam | `src/main/agents/types.ts` | add `sessionContext?`, `readMemory?`, `writeMemory?` to `LaunchParams` |
| Provider | `src/main/agents/claude-code.ts` | map `sessionContext` → `systemPrompt.append`; register `remember`/`recall` tools |
| Runner | `src/main/agents/runner.ts` | compile digest at `startRun`; inject callbacks; emit `memory` events |
| IPC | `src/shared/ipc.ts` + `src/main/ipc/index.ts` + `src/preload/index.ts` | `memory.listBySession` for the panel |
| UI | `src/renderer/src/...` | Brain panel + `useSessionMemory` hook + transcript `memory` row |

---

## 9. Milestones

| # | Milestone | Done when |
|---|-----------|-----------|
| M1 | Store | `session_memory` table + repo, append-only + supersede, unit-covered |
| M2 | Digest | `compileDigest` produces session header + run roster + entries |
| M3 | Inject | Runs launch with the digest in `systemPrompt.append`; transcript stays clean |
| M4 | Write | `remember`/`recall` tools live; writes persist **and** emit `memory` events |
| M5 | See it | Brain panel renders entries; updates live from the event stream |
| M6 | Prove it | Run 2+ agents in one session; confirm run B continues run A's work from the brain alone |

M6 is the real test: does the handover actually work, and do agents *use* the brain
when told it exists? That's the experiment the notes called for.

---

## 10. Deferred (seam-ready, sequenced)

Not abandoned — each slots into the model above without a rewrite:

- **Auto-distillation / automatic handover** — on a run's `result` event, summarize
  its `RunEvent`s into memory entries (`createdBy = 'distiller'`). Makes handover
  automatic instead of relying on the agent to `remember`.
- **Digest budgeting & compaction** — token/char budget, newest-first, overflow via
  `recall`; later an LLM compaction pass when the brain outgrows the budget.
- **Relevance routing** — "which context goes to whom." Use the `runId` / `cwd` /
  `tags` scoping to give a run only the slice it needs, instead of the whole session.
- **Human editing** — add/resolve/edit entries by hand from the Brain panel.
- **Higher brain** — when a session goes stale/done, consolidate its memory into a
  persisted session summary and promote select facts to a cross-session/global store.

---

## 11. Open questions

1. **Tool naming** — `remember` / `recall`, or `note` / `context`, or
   `update_memory` / `read_memory`? (Affects how naturally the model reaches for them.)
2. **Prompting to actually use it** — is the preamble enough, or do we need the
   `remember` guidance in the tool description too (and how strongly)?
3. **Entry kinds** — are `decision · artifact · open_question · note · next_step` the
   right five, or do we start with fewer (`note` + `decision`) and grow?
4. **Roster staleness** — the run roster is a live snapshot at launch; a run started
   hours ago won't see siblings that appear later. Acceptable for v1, or do we want a
   `recall('roster')` refresh?
5. **Write discipline** — do we cap/dedupe agent writes, or trust + rely on
   `supersedes` and later compaction to keep the brain tidy?

---

*Nothing is built yet. The `ask_user` tool (`src/main/agents/claude-code.ts`) and
the explain-pr feature are the two concrete templates this design copies — the MCP
tool seam and the schema/repo/IPC/panel stack, respectively.*
