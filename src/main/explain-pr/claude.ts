/**
 * Dedicated Explain PR mapper. Drives the Claude Agent SDK with *only* the
 * emit_* tools — no filesystem, no shell. Whetstone already fetched the PR;
 * Claude's job is to shape intent, goals, and per-file explainers.
 */

import { z } from 'zod';
import { DEFAULT_MODEL } from '../agents/registry';
import type { GhPrView } from './gh';

const SERVER = 'explain_pr';

export interface EmitIntentInput {
  intent: string;
  goals: { id: string; label: string; blurb: string }[];
}

export interface EmitFileInput {
  path: string;
  goals: string[];
  spec: string;
  connects: string;
  behaviorChange: string;
  isTest?: boolean;
  deps: { file: string; note: string }[];
}

export interface MapPrHandlers {
  onIntent: (input: EmitIntentInput) => Promise<void>;
  onFile: (input: EmitFileInput) => Promise<void>;
  onDone: () => Promise<void>;
}

export interface MapPrParams {
  cwd: string;
  pr: GhPrView;
  diffs: { path: string; patch: string }[];
  abortController: AbortController;
  handlers: MapPrHandlers;
}

const MAX_FILE_DIFF = 6_000;
const MAX_TOTAL_DIFF = 80_000;

type SdkModule = typeof import('@anthropic-ai/claude-agent-sdk');
let cachedSdk: SdkModule | null = null;

async function loadSdk(): Promise<SdkModule> {
  if (!cachedSdk) cachedSdk = await import('@anthropic-ai/claude-agent-sdk');
  return cachedSdk;
}

const SYSTEM_PROMPT = `You map a pull request into a spec-first review for a human.

You are NOT reviewing. Do not judge quality, suggest changes, or approve/request changes.
Explain what the PR is trying to do, break that into a few sub-goals, and place each file under the goals it serves. A file may belong to more than one goal. Files that are only tests should be marked isTest.

Call the tools in this order:
1. emit_intent once — a short PR intent (2–4 sentences) and 3–7 sub-goals.
2. emit_file once per changed file, using the exact paths you were given.
3. emit_done when every file has been emitted.

Write for a reviewer who has not opened the diff yet. Be concrete. No code fences.`;

export async function mapPr(params: MapPrParams): Promise<void> {
  const sdk = await loadSdk();
  const { handlers } = params;
  let done = false;

  const mcpServers = {
    [SERVER]: sdk.createSdkMcpServer({
      name: SERVER,
      tools: [
        sdk.tool(
          'emit_intent',
          'Record the PR intent and the sub-goals that files will be grouped under. Call this first, once.',
          {
            intent: z.string().describe('2–4 sentences: what this PR is trying to accomplish.'),
            goals: z
              .array(
                z.object({
                  id: z.string().describe('Stable key, e.g. G1.'),
                  label: z.string().describe('Short name, 2–4 words.'),
                  blurb: z.string().describe('One sentence on what this sub-goal covers.'),
                }),
              )
              .min(1)
              .max(8),
          },
          async (input) => {
            await handlers.onIntent(input);
            return { content: [{ type: 'text', text: 'Intent recorded.' }] };
          },
        ),
        sdk.tool(
          'emit_file',
          'Explain one changed file and attach it to one or more goals. Use the exact path from the file list.',
          {
            path: z.string(),
            goals: z.array(z.string()).describe('Goal ids from emit_intent. Empty = cross-cutting.'),
            spec: z.string().describe('What this file does in the system, 1–3 sentences.'),
            connects: z.string().describe('How this file serves the PR intent.'),
            behaviorChange: z.string().describe('What changed in this file for this PR.'),
            isTest: z.boolean().optional(),
            deps: z
              .array(z.object({ file: z.string(), note: z.string() }))
              .optional()
              .describe('Other files this one touches, with a short note.'),
          },
          async (input) => {
            await handlers.onFile({
              path: input.path,
              goals: input.goals,
              spec: input.spec,
              connects: input.connects,
              behaviorChange: input.behaviorChange,
              isTest: input.isTest,
              deps: input.deps ?? [],
            });
            return { content: [{ type: 'text', text: `Recorded ${input.path}.` }] };
          },
        ),
        sdk.tool(
          'emit_done',
          'Call when every file in the list has been emitted.',
          {},
          async () => {
            done = true;
            await handlers.onDone();
            return { content: [{ type: 'text', text: 'Map complete.' }] };
          },
        ),
      ],
    }),
  };

  const allowed = [
    `mcp__${SERVER}__emit_intent`,
    `mcp__${SERVER}__emit_file`,
    `mcp__${SERVER}__emit_done`,
  ];

  const stream = sdk.query({
    prompt: buildPrompt(params.pr, params.diffs),
    options: {
      cwd: params.cwd,
      model: DEFAULT_MODEL,
      systemPrompt: SYSTEM_PROMPT,
      tools: [],
      allowedTools: allowed,
      settingSources: [],
      strictMcpConfig: true,
      permissionMode: 'dontAsk',
      maxTurns: Math.min(8 + Math.max(params.pr.files.length, 1), 40),
      abortController: params.abortController,
      mcpServers,
      canUseTool: async (name, input) => {
        if (allowed.includes(name) || name.startsWith(`mcp__${SERVER}__`)) {
          return { behavior: 'allow', updatedInput: input };
        }
        return { behavior: 'deny', message: 'Only emit_intent, emit_file, and emit_done are allowed.' };
      },
    },
  });

  for await (const message of stream) {
    if (message.type === 'result' && 'is_error' in message && message.is_error && !done) {
      const text = 'result' in message && typeof message.result === 'string' ? message.result : '';
      throw new Error(text || 'Claude stopped before the map was finished.');
    }
  }

  if (!done) await handlers.onDone();
}

function buildPrompt(pr: GhPrView, diffs: { path: string; patch: string }[]): string {
  const fileList = pr.files
    .map((f) => `- ${f.path}  (+${f.additions} −${f.deletions}  ${f.changeType})`)
    .join('\n');

  let used = 0;
  const diffBlocks: string[] = [];
  for (const file of diffs) {
    const remaining = MAX_TOTAL_DIFF - used;
    if (remaining <= 0) {
      diffBlocks.push(`\n### ${file.path}\n[diff omitted — budget reached]`);
      continue;
    }
    const cap = Math.min(MAX_FILE_DIFF, remaining);
    const body =
      file.patch.length > cap
        ? `${file.patch.slice(0, cap)}\n… [truncated ${file.patch.length - cap} chars]`
        : file.patch;
    used += body.length;
    diffBlocks.push(`\n### ${file.path}\n\`\`\`diff\n${body}\n\`\`\``);
  }

  return [
    `# ${pr.title} (#${pr.number})`,
    `${pr.author} wants to merge ${pr.commitCount} commit(s) into ${pr.base} from ${pr.head}.`,
    '',
    '## PR body',
    pr.body.trim() || '(no description)',
    '',
    '## Files — emit_file once for each of these exact paths',
    fileList || '(no files)',
    '',
    '## Diffs',
    diffBlocks.join('\n') || '(no diff)',
  ].join('\n');
}
