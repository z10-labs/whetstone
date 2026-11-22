/**
 * How a transcript reads: Claude's words in full, and the work between them
 * folded into one line per stretch of tool calls ("Ran 3 commands") — the
 * way Claude Code shows it. Pure, so the wording is unit-tested.
 */

import type { RunEvent } from '@shared/models';

export interface ToolCall {
  use: RunEvent;
  /** The matching result, once it has arrived. */
  result: RunEvent | null;
}

export type TranscriptItem =
  | { type: 'event'; event: RunEvent }
  | { type: 'tools'; id: string; calls: ToolCall[] };

type Input = Record<string, unknown>;

function inputOf(event: RunEvent): Input {
  const input = (event.data as { input?: unknown } | null)?.input;
  return input && typeof input === 'object' ? (input as Input) : {};
}

function str(input: Input, key: string): string | null {
  const value = input[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function idOf(event: RunEvent): string | null {
  const id = (event.data as { id?: unknown } | null)?.id;
  return typeof id === 'string' ? id : null;
}

function basename(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() || path;
}

function clip(text: string, max = 60): string {
  const line = text.split('\n')[0];
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** Strip an MCP prefix: `mcp__server__do_thing` → `do thing`. */
function toolLabel(name: string): string {
  const bare = name.startsWith('mcp__') ? name.split('__').slice(2).join('__') : name;
  return bare.replace(/_/g, ' ');
}

/**
 * Fold tool calls into groups. Consecutive tool_use / tool_result events
 * (with nothing said in between) become one group; each result is paired
 * with its call by id. Everything else passes through.
 */
export function groupTranscript(events: RunEvent[]): TranscriptItem[] {
  const items: TranscriptItem[] = [];
  let group: ToolCall[] | null = null;
  const byId = new Map<string, ToolCall>();

  for (const event of events) {
    if (event.kind === 'tool_use') {
      if (!group) {
        group = [];
        items.push({ type: 'tools', id: event.id, calls: group });
      }
      const call: ToolCall = { use: event, result: null };
      group.push(call);
      const id = idOf(event);
      if (id) byId.set(id, call);
      continue;
    }
    if (event.kind === 'tool_result') {
      const id = idOf(event);
      const call = id ? byId.get(id) : undefined;
      if (call) call.result = event;
      // A result never breaks a run of tool calls.
      continue;
    }
    group = null;
    items.push({ type: 'event', event });
  }
  return items;
}

type Category = 'command' | 'read' | 'edit' | 'search' | 'web' | 'agent' | 'other';

function category(name: string): Category {
  switch (name) {
    case 'Bash':
    case 'BashOutput':
      return 'command';
    case 'Read':
    case 'NotebookRead':
      return 'read';
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return 'edit';
    case 'Grep':
    case 'Glob':
    case 'LS':
      return 'search';
    case 'WebFetch':
    case 'WebSearch':
      return 'web';
    case 'Task':
    case 'Agent':
      return 'agent';
    default:
      return 'other';
  }
}

/** One call in a few words: the agent's own description where it gave one. */
export function describeCall(event: RunEvent): string {
  const name = event.toolName ?? 'tool';
  const input = inputOf(event);
  const described = str(input, 'description');
  switch (name) {
    case 'Bash': {
      if (described) return described;
      const command = str(input, 'command');
      return command ? `Ran ${clip(command)}` : 'Ran a command';
    }
    case 'Read': {
      const path = str(input, 'file_path');
      return path ? `Read ${basename(path)}` : 'Read a file';
    }
    case 'Write': {
      const path = str(input, 'file_path');
      return path ? `Wrote ${basename(path)}` : 'Wrote a file';
    }
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit': {
      const path = str(input, 'file_path') ?? str(input, 'notebook_path');
      return path ? `Edited ${basename(path)}` : 'Edited a file';
    }
    case 'Grep': {
      const pattern = str(input, 'pattern');
      return pattern ? `Searched for “${clip(pattern, 40)}”` : 'Searched the code';
    }
    case 'Glob': {
      const pattern = str(input, 'pattern');
      return pattern ? `Found files matching ${clip(pattern, 40)}` : 'Listed files';
    }
    case 'WebSearch': {
      const query = str(input, 'query');
      return query ? `Searched the web for “${clip(query, 40)}”` : 'Searched the web';
    }
    case 'WebFetch': {
      const url = str(input, 'url');
      return url ? `Read ${clip(url.replace(/^https?:\/\//, ''), 48)}` : 'Read a web page';
    }
    case 'Task':
    case 'Agent':
      return described ? `Agent: ${described}` : 'Ran an agent';
    case 'TodoWrite':
      return 'Updated the task list';
    default:
      return described ?? `Used ${toolLabel(name)}`;
  }
}

const PHRASES: Record<Category, [string, string]> = {
  command: ['ran a command', 'ran {n} commands'],
  read: ['read a file', 'read {n} files'],
  edit: ['edited a file', 'edited {n} files'],
  search: ['searched once', 'searched {n} times'],
  web: ['read the web', 'made {n} web lookups'],
  agent: ['ran an agent', 'ran {n} agents'],
  other: ['used a tool', 'used {n} tools'],
};

const ORDER: Category[] = ['edit', 'command', 'read', 'search', 'web', 'agent', 'other'];

/** One line for a whole group: a single call speaks for itself. */
export function summarizeCalls(calls: ToolCall[]): string {
  if (calls.length === 1) return describeCall(calls[0].use);
  const counts = new Map<Category, number>();
  for (const call of calls) {
    const c = category(call.use.toolName ?? '');
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const parts = ORDER.filter((c) => counts.has(c)).map((c) => {
    const n = counts.get(c) ?? 0;
    const [one, many] = PHRASES[c];
    return n === 1 ? one : many.replace('{n}', String(n));
  });
  const text = parts.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The text of a tool result, however the provider shaped it. */
export function resultText(event: RunEvent | null): string {
  if (!event) return '';
  const content = (event.data as { content?: unknown } | null)?.content ?? event.text ?? '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) =>
        block && typeof block === 'object' && 'text' in block ? String(block.text) : '',
      )
      .filter(Boolean)
      .join('\n');
  }
  return JSON.stringify(content, null, 2);
}

/** What the call was asked to do, for the expanded row. */
export function callDetail(event: RunEvent): string {
  const input = inputOf(event);
  return (
    str(input, 'command') ??
    str(input, 'file_path') ??
    str(input, 'pattern') ??
    str(input, 'url') ??
    str(input, 'query') ??
    str(input, 'prompt') ??
    (Object.keys(input).length ? JSON.stringify(input, null, 2) : '')
  );
}
