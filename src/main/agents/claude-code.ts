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

/** The name the model sees for our in-process ask tool. */
const ASK_TOOL_NAME = 'mcp__whetstone__ask_user';

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
    const askUser = params.askUser;

    // Track ask_user tool-call ids so we can suppress their raw tool_use /
    // tool_result echoes — the richer `ask`/`answer` events represent them.
    const askToolUseIds = new Set<string>();

    const mcpServers = askUser
      ? {
          whetstone: sdk.createSdkMcpServer({
            name: 'whetstone',
            tools: [
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
            ],
          }),
        }
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
              // The ask_user tool renders as a dedicated question card, not a
              // generic tool_use row — record its id and skip the echo.
              if (block.name === ASK_TOOL_NAME) {
                if (block.id) askToolUseIds.add(block.id);
                break;
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
                // Skip the answer echo for ask_user — the `answer` event covers it.
                if (block.tool_use_id && askToolUseIds.has(block.tool_use_id)) continue;
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
