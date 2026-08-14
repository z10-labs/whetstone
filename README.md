# Whetstone

An agentic development environment. **v1 foundation:** launch Claude agent runs
and group them into Sessions — captured as structured events, not terminal
scrollback.

> Direction and scope live in [`docs/whetstone-v1.md`](docs/whetstone-v1.md).

## Stack

- **Electron** — main (Node) + renderer (React), via `electron-vite`
- **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) — drives runs, structured stream
- **libSQL** (`@libsql/client`) + **Drizzle** — local on-disk SQLite, N-API (no native rebuilds)

## Run it

```bash
npm install
npm run dev
```

Launching an agent uses your **local Claude login** (same auth as the Claude Code
CLI) — no API key needed. Runs drive with **full permissions** in the chosen
directory (the agent may edit files and run commands without prompting — a
per-tool approval UI will replace this blanket grant later). Runs can also call
an in-process **`ask_user`** tool to ask you clarifying questions mid-run, which
render as answerable cards in the transcript.

Scripts:

| Command | What it does |
|---|---|
| `npm run dev` | Electron app with HMR |
| `npm run build` | Bundle main/preload/renderer to `out/` |
| `npm run typecheck` | Type-check both TS projects |

## Shape

```
src/
├─ shared/          Session · AgentRun · RunEvent + the IPC contract
├─ main/            db (libSQL+Drizzle) · repos · agent providers · ipc
├─ preload/         contextBridge → window.whetstone
└─ renderer/src/    React: Sessions · Runs · live Transcript
```

**Model:** a **Session** groups **AgentRun**s (each a resumable Claude
conversation, 1:1 with an SDK `session_id`, with its own working directory);
each run is a stream of structured **RunEvent**s — the substrate future memory
and search build on.

Data lives at `~/Library/Application Support/whetstone/whetstone/whetstone.db`.

## Deferred (seam-ready, not built)

Permission UI · worktree isolation · importing existing `~/.claude` sessions ·
memory · integrations · plugins · orchestration · more providers.
