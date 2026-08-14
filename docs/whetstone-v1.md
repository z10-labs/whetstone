# Whetstone — v1 Plan

> Status: **DRAFT for review**
> Scope: the foundation. Launch Claude agent runs, stream them structured, and group them into Sessions.
> Author: pairing session, 2026-08-08

---

## 1. What whetstone is

Whetstone is an **agentic development environment** — a home base where you run your coding agents and everything about that work lives in one place. The long arc includes memory, integrations, plugins, and orchestration. This document is **only v1**: the foundation those things get built on.

**v1 goal, in one sentence:**
> From inside whetstone, create a **Session**, launch a **Claude agent run** in a chosen directory, watch it stream as *structured* events, keep talking to it, and see all your runs grouped by Session.

If that works and feels solid, the foundation is good.

---

## 2. The bet (why this shape)

The obvious alternative is a terminal-first approach (PTY orchestration + git worktrees, agent-agnostic but **opaque** scrollback). Whetstone makes the opposite bet on purpose:

- **Structured-first, not terminal-first.** Every run is captured as typed events (assistant text, tool calls, results, usage) — *not* raw terminal output. This structured substrate is what makes memory, search, and intelligence possible later. It's the thing a terminal-first tool can't easily do.
- **Drive via the Claude Agent SDK**, not by scraping a PTY. We get a real event stream with a stable `session_id`.
- **Local-first.** Electron desktop, local SQLite. No accounts, no cloud, uses your existing Claude login.
- **Everything is a seam.** A provider-adapter interface, a repository layer, and a normalized model mean future work (more providers, worktrees, import, memory, orchestration) *adds to* the foundation instead of rewriting it.

---

## 3. Confirmed decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | App shell | **Electron** — main (Node) + renderer (React), via electron-vite |
| 2 | How we run agents | **Drive via Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`), structured event stream |
| 3 | Storage | **Local SQLite** (better-sqlite3 + Drizzle ORM) |
| 4 | What a **Run** is | One **resumable, multi-turn conversation**, mapped 1:1 to an SDK `session_id` |
| 5 | What a **Session** groups | A **theme** — **can span multiple repos/directories**. Each run carries its own `cwd`. |
| 6 | Permission stance in v1 | **Read-only / plan mode first.** The agent can explore and propose; it cannot edit files or run commands yet. A real permission UI is a later, deliberate layer. |
| 7 | Worktrees | **Deferred.** Model designed so per-run worktrees attach later without a rewrite. |
| 8 | Importing old sessions ("Observe") | **Deferred.** The SDK persists launched runs to `~/.claude` anyway, so a future import adapter reconciles by `session_id` for free. |

---

## 4. Architecture

```
┌──────────────────────────── Electron ────────────────────────────┐
│                                                                   │
│  Renderer (React)                 Main (Node.js)                  │
│  ┌───────────────────┐            ┌────────────────────────────┐  │
│  │  Sessions sidebar │            │  IPC handlers              │  │
│  │  Run list         │◀── invoke ─▶│  (sessions/runs/agent)    │  │
│  │  Live transcript  │            │        │                   │  │
│  └───────────────────┘            │        ▼                   │  │
│          ▲                        │  Repository layer          │  │
│          │  events (send)         │        │                   │  │
│          └────────────────────────│        ▼                   │  │
│                                   │  SQLite (Drizzle)          │  │
│                                   │                            │  │
│                                   │  Agent providers (seam)    │  │
│                                   │   └─ claude-code adapter   │  │
│                                   │        └─ Claude Agent SDK │  │
│                                   └────────────────────────────┘  │
│                                                                   │
│  Bridge: preload exposes a single typed `window.whetstone` API    │
└───────────────────────────────────────────────────────────────────┘
```

**Boundaries (non-negotiable for a clean foundation):**
- Renderer never touches Node, the DB, or the SDK directly. It only calls `window.whetstone.*`.
- The preload `contextBridge` exposes exactly the typed contract in `src/shared/ipc.ts`. `contextIsolation` on, `nodeIntegration` off.
- Drizzle/SQLite never leak past the repository layer. Repos return plain `src/shared/models.ts` shapes.
- The SDK is only ever touched by the `claude-code` provider adapter.

**Project layout:**
```
src/
├─ shared/            types shared across processes (DONE)
│  ├─ models.ts       Session · AgentRun · RunEvent
│  └─ ipc.ts          the window.whetstone contract + channel names
├─ main/
│  ├─ index.ts        app + BrowserWindow lifecycle
│  ├─ db/
│  │  ├─ schema.ts    Drizzle tables
│  │  └─ client.ts    connection + migrate on boot
│  ├─ repo/
│  │  ├─ sessions.ts  session CRUD
│  │  └─ runs.ts      run + event CRUD
│  ├─ agents/
│  │  ├─ types.ts     AgentProvider interface (launch/resume seam)
│  │  ├─ registry.ts  provider lookup (extensibility point)
│  │  └─ claude-code.ts   Claude Agent SDK adapter → normalized RunEvents
│  └─ ipc/index.ts    wires channels → repos/agents, streams events back
├─ preload/index.ts   contextBridge → window.whetstone
└─ renderer/src/      React UI
```

---

## 5. Data model

Three tables. Plain, serializable, room to grow.

```
Session ──1:N──▶ AgentRun ──1:N──▶ RunEvent
```

**Session** — a grouping of related work (a *theme*).
- `id`, `name`, `description`, `color` (UI accent), `createdAt`, `updatedAt`
- Deliberately **not** tied to a directory — its runs can live in different repos.

**AgentRun** — one resumable conversation.
- `id`, `sessionId`, `provider` (`claude-code`), `externalId` (the SDK `session_id`, filled once the run starts), `origin` (`launched` | `imported`), `title`, `status` (`idle`/`running`/`completed`/`error`/`canceled`), `cwd` (**per-run** working dir), `model`, `messageCount`, `createdAt`, `updatedAt`
- `(provider, externalId)` is the reconciliation key — a future import can't duplicate a launched run.

**RunEvent** — one structured step in a run.
- `id`, `runId`, `seq`, `kind` (`user`/`assistant_text`/`assistant_thinking`/`tool_use`/`tool_result`/`system`/`result`/`error`), `text`, `toolName`, `data` (JSON: tool input, usage, raw block), `createdAt`
- This is the **memory substrate**. Memory/search/analytics later read from here.

*(These are already written in `src/shared/models.ts`.)*

---

## 6. How we drive an agent (Claude Agent SDK)

Verified against the current SDK docs:

- Entry: `query({ prompt, options })` returns an **async-iterable** of `SDKMessage`s.
- The first `system` message carries **`session_id`** → we store it as the run's `externalId` immediately.
- `options` we use in v1: `cwd` (the run's directory), `model`, `permissionMode`, and later `resume`.
- **Resume** a multi-turn run with `options.resume = externalId`.
- `persistSession` defaults true → launched runs also write `~/.claude/projects/*.jsonl` (future import reconciles by `session_id`).
- **Auth:** uses your **local Claude login** by default — no API key needed to start.
- I'll confirm exact `assistant`/`tool_use` message shapes against the installed package's `.d.ts` before finalizing the adapter (not trusting the doc summary).

**The adapter's job:** turn the SDK's `SDKMessage` stream into our `RunEvent`s, persist each as it arrives, and forward it to the renderer over IPC so the transcript updates live.

**Flow for launching a run:**
1. Renderer: "New run in Session X, cwd = /path, prompt = …"
2. Main creates an `AgentRun` (status `idle` → `running`), returns it.
3. Adapter calls `query()`; on first `system` message, stores `externalId`, emits `RunUpdated`.
4. Each SDK message → normalized `RunEvent` → persisted → `RunEvent` sent to renderer.
5. On `result` → status `completed`, usage stored.
6. Renderer streams the transcript the whole time.

**Permission handling in v1:** launch with a **read-only / plan** posture so the agent can explore and propose but not modify anything. No approve/deny UI needed yet. (Exact mechanism — `permissionMode: 'plan'` vs a deny-all `canUseTool` — I'll pin against the SDK types.)

---

## 7. IPC contract (already drafted)

`window.whetstone`:
- `sessions`: `list` · `create` · `get` · `update` · `remove`
- `runs`: `create` · `listEvents` · `move` (regroup a run into another Session)
- `agent`: `start` · `cancel`
- `onRunEvent(cb)` / `onRunUpdated(cb)` — live streaming subscriptions

*(Defined in `src/shared/ipc.ts`.)*

---

## 8. UI for v1

Deliberately simple, but intentional (not a template dashboard):
- **Left:** Sessions list — create, select, color accent.
- **Center:** the selected Session's **runs** — each with title, provider, cwd, status.
- **Right / main:** the selected run's **live transcript** — assistant text, tool calls (name + input), results — plus a prompt box to start or continue the run.
- **New run:** pick a directory (`cwd`) + type a prompt → it launches and streams.
- **Regroup:** move a run to a different Session.

Visual direction to decide at build time (Swiss/technical console vs editorial dark). Not blocking the plan.

---

## 9. Milestones

| # | Milestone | Done when |
|---|-----------|-----------|
| M0 | Scaffold | ✅ deps installed, electron-vite + tsconfig + shared types in place |
| M1 | App boots | `npm run dev` opens a window rendering React, DB migrates on boot |
| M2 | Sessions CRUD | Create/list/select/rename/recolor Sessions, persisted in SQLite |
| M3 | **Launch a run** | Start a Claude run in a cwd; `session_id` captured; status transitions |
| M4 | **Live structured stream** | Transcript updates in real time from normalized RunEvents; persisted |
| M5 | Multi-turn + resume | Continue an existing run via `resume`; events append |
| M6 | Grouping | Runs render under their Session; move a run between Sessions |

M3 + M4 are the heart — that's "having the agents started."

---

## 10. Explicitly OUT of v1 (the roadmap we build on top)

Not abandoned — *sequenced*. Each slots into the same model/seams:

- **Permission UI** — approve/deny tool use, then write-enabled runs.
- **Worktree isolation** — per-run git worktree; fan a prompt across runs.
- **Import / Observe** — adapter that pulls your existing `~/.claude` sessions in.
- **Memory** — built on `RunEvent` history.
- **Integrations** — GitHub, Linear, etc.
- **Plugins** — third-party providers/extensions via the adapter seam.
- **Orchestration** — coordinate multiple runs, compare, merge.
- **More providers** — Codex, Cursor, etc. via new adapters.
- **Packaging** — signed installable app (electron-builder).

---

## 11. Open questions for you

1. **Permission stance** — confirm read-only/plan for v1, or do you want write-enabled-in-cwd from the start (riskier, edits real repos)?
2. **cwd picker** — free directory pick per run, or a small list of "known project dirs" you register once?
3. **Model default** — pin a default model for launched runs (e.g. latest Sonnet/Opus), or expose a picker per run in v1?
4. **Visual direction** — any preference (technical/Swiss console, editorial dark, something else) so the UI isn't generic?
5. **Anything in §10 you want pulled *into* v1** despite the added scope?

---

*Nothing behavioral has been built yet — only config and the shared type definitions in §5/§7. Everything above is still fully open to change.*
