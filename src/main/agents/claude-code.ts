/**
 * Claude Code provider — drives a run via `@anthropic-ai/claude-agent-sdk`.
 *
 * Responsibility: turn the SDK's `SDKMessage` stream into whetstone's
 * normalized events, and expose an in-process `ask_user` tool so the agent can
 * ask the human clarifying questions mid-run. It knows the SDK's shape;
 * nothing else in the app does.
 *
 * Verified against sdk.d.ts (v0.3.x):
 *   - every message carries `session_id`; system/init also carries `model`
 *   - assistant.message.content[] holds text | thinking | tool_use blocks
 *   - result carries the final text + usage/cost
 *   - `createSdkMcpServer` + `tool` define in-process tools (zod schemas)
 *   - `bypassPermissions` requires `allowDangerouslySkipPermissions: true`
 */

import { z } from 'zod';
import type { AgentProvider, LaunchParams, NormalizedAgentEvent } from './types';
import { MEMORY_KINDS } from '@shared/session-memory';
import { cardPatchSchema, cardSpecSchema } from '@shared/cards';

/**
 * In-process whetstone tools render as dedicated UI (question cards, memory
 * chips) rather than generic tool rows, so their raw tool_use / tool_result
 * echoes are suppressed in the normalized stream.
 */
const SUPPRESSED_TOOLS = new Set([
  'mcp__whetstone__ask_user',
  'mcp__whetstone__remember',
  'mcp__whetstone__recall',
  'mcp__whetstone__brain',
  'mcp__whetstone__card',
]);

const CARD_TOOL_DESCRIPTION =
  'Put a Live Card in the human\'s sidebar: a small UI for something that changes while ' +
  'they work (a CI run, a long job, a PR, an approval you need, a decision or hypotheses ' +
  'you are weighing). Describe it once; Whetstone keeps it fresh from its `binding` without ' +
  'you, and resumes you with a message when a `wakeOn` trigger fires — so end your turn ' +
  'instead of polling. Block values are literals or `{ "$bind": "/json/pointer" }` into the ' +
  'binding\'s state. `gh-run` state: status, conclusion, workflow, title, branch, sha, url, ' +
  'elapsedSec, typicalSec, overrunLabel, overrunTone, jobs (steps), currentJob, logTail. ' +
  'A typical CI card: stat(value $bind /elapsedSec, format duration, note $bind /overrunLabel), ' +
  'budget(value /elapsedSec, reference /typicalSec, limit 2100, unit sec), steps(/jobs), ' +
  'log(/logTail), wakeOn [{path:/conclusion, op:eq, value:failure, note:"run failed"}, ' +
  '{path:/elapsedSec, op:gt, value:2100, note:"passed 35 min"}]. `gh-pr` state: number, ' +
  'title, url, state, review, checks, checksPassed, checksTotal, checksRunning, unresolved, ' +
  'conflicts, summary. Use `tone: attention` plus an `actions` block when you need the ' +
  'human to approve something; their click comes back to you as a message. Set ' +
  '`suggestPin` on cards worth keeping after this session. `update` replaces fields (not ' +
  'the binding); `close` stops a card. Ids look like id:3fa9c1. You cannot pin cards.';

/** zod enum for a memory kind, derived from the shared list. */
const memoryKindEnum = z.enum(MEMORY_KINDS as [string, ...string[]]);

/** Minimal structural view of an assistant/user content block. */
interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
}

/**
 * The SDK ships ESM-only (`sdk.mjs`). electron-vite bundles the main process as
 * CommonJS, so a static import would fail with ERR_REQUIRE_ESM. We load it via
 * a cached dynamic import() instead — the supported CJS→ESM interop path.
 */
type SdkModule = typeof import('@anthropic-ai/claude-agent-sdk');
let cachedSdk: SdkModule | null = null;

async function loadSdk(): Promise<SdkModule> {
  if (!cachedSdk) cachedSdk = await import('@anthropic-ai/claude-agent-sdk');
  return cachedSdk;
}

export const claudeCodeProvider: AgentProvider = {
  id: 'claude-code',

  async *launch(params: LaunchParams): AsyncIterable<NormalizedAgentEvent> {
    const sdk = await loadSdk();
    const { askUser, remember, recall, brain, card } = params;

    // Track suppressed tool-call ids so we can drop their raw tool_use /
    // tool_result echoes — richer events (ask/answer, memory) represent them.
    const suppressedToolUseIds = new Set<string>();

    // Build the in-process whetstone MCP tools that are wired for this run.
    const tools = [];
    if (askUser) {
      tools.push(
        sdk.tool(
          'ask_user',
          'Ask the human a clarifying question and wait for their answer. ' +
            'Prefer this over guessing whenever requirements are ambiguous.',
          {
            question: z.string().describe('The question to ask the human.'),
            options: z
              .array(
                z.object({
                  label: z.string(),
                  description: z.string().optional(),
                  preview: z.string().optional(),
                }),
              )
              .optional()
              .describe('Optional suggested answers the human can pick from.'),
            multiSelect: z.boolean().optional(),
          },
          async (input) => {
            const answer = await askUser({
              question: input.question,
              options: input.options,
              multiSelect: input.multiSelect,
            });
            return { content: [{ type: 'text', text: answer }] };
          },
        ),
      );
    }
    if (remember) {
      tools.push(
        sdk.tool(
          'remember',
          'Record a durable fact in the shared session brain so other agents can ' +
            'continue your work: a decision made, an artifact produced, an open ' +
            'question, or a next step. Prefer this over leaving knowledge only in ' +
            'your own transcript. Supersede an existing entry instead of duplicating it.',
          {
            kind: memoryKindEnum.describe(
              'decision | open_question | next_step | artifact | note',
            ),
            title: z.string().describe('A short one-line summary of the fact.'),
            body: z.string().optional().describe('Optional detail or context.'),
            tags: z.array(z.string()).optional(),
            cwd: z
              .string()
              .optional()
              .describe('Repo/dir this pertains to. Defaults to the run directory.'),
            supersedesId: z
              .string()
              .optional()
              .describe('Id of an existing entry this one replaces.'),
          },
          async (input) => {
            const ack = await remember({
              kind: input.kind as (typeof MEMORY_KINDS)[number],
              title: input.title,
              body: input.body,
              tags: input.tags,
              cwd: input.cwd,
              supersedesId: input.supersedesId,
            });
            return { content: [{ type: 'text', text: `Remembered (${ack.kind}): ${ack.title}` }] };
          },
        ),
      );
    }
    if (recall) {
      tools.push(
        sdk.tool(
          'recall',
          'Read entries from the shared session brain. Optionally filter by kind or ' +
            'a text query. Use this to pull detail beyond the summary you were given.',
          {
            kind: memoryKindEnum.optional(),
            query: z.string().optional().describe('Case-insensitive text to match.'),
          },
          async (input) => {
            const entries = await recall({
              kind: input.kind as (typeof MEMORY_KINDS)[number] | undefined,
              query: input.query,
            });
            const text =
              entries.length === 0
                ? 'No matching memory entries.'
                : entries
                    .map((e) => `- [${e.kind}] ${e.title}${e.body ? ` — ${e.body}` : ''}`)
                    .join('\n');
            return { content: [{ type: 'text', text }] };
          },
        ),
      );
    }

    if (brain) {
      tools.push(
        sdk.tool(
          'brain',
          "Act on the human's own Brain for this session — the board they watch. " +
            '`add` puts a task, jot or reminder in front of them (e.g. a reminder that ' +
            'CI will need their approval in 20 minutes). `done` closes an entry by the ' +
            'id shown in your context. `mission` sets or rewords the session mission ' +
            'when the human gives you one. Keep titles to one precise line; this is ' +
            'not where detail goes — use `remember` for facts other agents need.',
          {
            action: z.enum(['add', 'done', 'mission']),
            kind: z.enum(['task', 'jot', 'reminder']).optional().describe('For add. Default task.'),
            title: z.string().optional().describe('One line. Required for add.'),
            body: z.string().optional().describe('At most a line or two. Usually empty.'),
            inMinutes: z
              .number()
              .int()
              .positive()
              .optional()
              .describe('For add: surface it this many minutes from now. Required for reminders.'),
            id: z.string().optional().describe('For done: the entry id, e.g. id:8f2a1c.'),
          },
          async (input) => {
            const text = await brain({
              action: input.action,
              kind: input.kind,
              title: input.title,
              body: input.body,
              inMinutes: input.inMinutes,
              id: input.id,
            });
            return { content: [{ type: 'text', text }] };
          },
        ),
      );
    }

    if (card) {
      tools.push(
        sdk.tool(
          'card',
          CARD_TOOL_DESCRIPTION,
          {
            action: z.enum(['create', 'update', 'close']),
            spec: cardSpecSchema.optional().describe('For create: the whole card.'),
            id: z.string().optional().describe('For update and close: the card id, e.g. id:3fa9c1.'),
            patch: cardPatchSchema
              .optional()
              .describe('For update: fields to replace. blocks and wakeOn replace wholesale.'),
          },
          async (input) => {
            try {
              const text = await card({
                action: input.action,
                spec: input.spec,
                id: input.id,
                patch: input.patch,
              });
              return { content: [{ type: 'text', text }] };
            } catch (err) {
              const text = err instanceof Error ? err.message : String(err);
              return { content: [{ type: 'text', text }], isError: true };
            }
          },
        ),
      );
    }

    const mcpServers =
      tools.length > 0
        ? { whetstone: sdk.createSdkMcpServer({ name: 'whetstone', tools }) }
        : undefined;

    const stream = sdk.query({
      prompt: params.prompt,
      options: {
        cwd: params.cwd,
        permissionMode: params.permissionMode,
        abortController: params.abortController,
        ...(params.permissionMode === 'bypassPermissions'
          ? { allowDangerouslySkipPermissions: true }
          : {}),
        ...(params.sessionContext
          ? {
              systemPrompt: {
                type: 'preset' as const,
                preset: 'claude_code' as const,
                append: params.sessionContext,
              },
            }
          : {}),
        ...(mcpServers ? { mcpServers } : {}),
        ...(params.model ? { model: params.model } : {}),
        ...(params.resume ? { resume: params.resume } : {}),
      },
    });

    for await (const msg of stream) {
      switch (msg.type) {
        case 'system': {
          if (msg.subtype === 'init') {
            yield {
              kind: 'system',
              externalId: msg.session_id,
              model: msg.model,
              data: { subtype: 'init', cwd: msg.cwd, permissionMode: msg.permissionMode },
            };
          }
          break;
        }

        case 'assistant': {
          const blocks = (msg.message?.content ?? []) as ContentBlock[];
          for (const block of blocks) {
            if (block.type === 'text' && block.text) {
              yield { kind: 'assistant_text', text: block.text };
            } else if (block.type === 'thinking' && block.thinking) {
              yield { kind: 'assistant_thinking', text: block.thinking };
            } else if (block.type === 'tool_use') {
              // Suppressed whetstone tools render as dedicated UI (question
              // cards, memory chips) — record the id and skip the generic echo.
              if (block.name && SUPPRESSED_TOOLS.has(block.name)) {
                if (block.id) suppressedToolUseIds.add(block.id);
                continue;
              }
              yield {
                kind: 'tool_use',
                toolName: block.name ?? 'tool',
                data: { id: block.id, input: block.input },
              };
            }
          }
          break;
        }

        case 'user': {
          const content = msg.message?.content;
          if (Array.isArray(content)) {
            for (const block of content as ContentBlock[]) {
              if (block.type === 'tool_result') {
                // Skip echoes for suppressed whetstone tools — their richer
                // events (answer, memory) already represent them.
                if (block.tool_use_id && suppressedToolUseIds.has(block.tool_use_id)) continue;
                yield { kind: 'tool_result', data: { id: block.tool_use_id, content: block.content } };
              }
            }
          }
          break;
        }

        case 'result': {
          const r = msg as {
            subtype?: string;
            result?: string;
            is_error?: boolean;
            num_turns?: number;
            total_cost_usd?: number;
            usage?: unknown;
          };
          yield {
            kind: 'result',
            text: r.result ?? null,
            data: {
              subtype: r.subtype,
              isError: r.is_error,
              numTurns: r.num_turns,
              totalCostUsd: r.total_cost_usd,
              usage: r.usage,
            },
          };
          break;
        }

        default:
          break;
      }
    }
  },
};
