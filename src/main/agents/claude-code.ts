/**
 * Claude Code provider — drives a run via `@anthropic-ai/claude-agent-sdk`.
 *
 * Responsibility: turn the SDK's `SDKMessage` stream into whetstone's
 * normalized events. It knows the SDK's shape; nothing else in the app does.
 * Verified against sdk.d.ts (v0.3.x):
 *   - every message carries `session_id`
 *   - system/init also carries `model`
 *   - assistant.message.content[] holds text | thinking | tool_use blocks
 *   - result carries the final text + usage/cost
 */

import type { AgentProvider, LaunchParams, NormalizedAgentEvent } from './types';

/**
 * The SDK ships ESM-only (`sdk.mjs`). electron-vite bundles the main process as
 * CommonJS, so a static import would fail with ERR_REQUIRE_ESM. We load it via
 * a cached dynamic import() instead — the supported CJS→ESM interop path.
 */
type QueryFn = (typeof import('@anthropic-ai/claude-agent-sdk'))['query'];
let cachedQuery: QueryFn | null = null;

async function loadQuery(): Promise<QueryFn> {
  if (!cachedQuery) {
    const mod = await import('@anthropic-ai/claude-agent-sdk');
    cachedQuery = mod.query;
  }
  return cachedQuery;
}

/** Minimal structural view of an assistant content block (SDK/Anthropic beta). */
interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

export const claudeCodeProvider: AgentProvider = {
  id: 'claude-code',

  async *launch(params: LaunchParams): AsyncIterable<NormalizedAgentEvent> {
    const query = await loadQuery();
    const stream = query({
      prompt: params.prompt,
      options: {
        cwd: params.cwd,
        permissionMode: params.permissionMode,
        abortController: params.abortController,
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
          // In plan mode there is normally no tool execution, but a resumed or
          // write-enabled run can carry tool_result blocks back as user content.
          const content = msg.message?.content;
          if (Array.isArray(content)) {
            for (const block of content as ContentBlock[]) {
              if (block.type === 'tool_result') {
                yield {
                  kind: 'tool_result',
                  data: { id: block.id, content: (block as { content?: unknown }).content },
                };
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
          // Many informational message types exist; v1 ignores them.
          break;
      }
    }
  },
};
