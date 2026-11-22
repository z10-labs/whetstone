import { describe, expect, it } from 'vitest';
import type { RunEvent, RunEventKind } from '@shared/models';
import { callDetail, describeCall, groupTranscript, resultText, summarizeCalls } from './steps';

let seq = 0;
function ev(kind: RunEventKind, extra: Partial<RunEvent> = {}): RunEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    runId: 'r1',
    seq,
    kind,
    text: null,
    toolName: null,
    data: null,
    createdAt: seq,
    ...extra,
  };
}
const use = (toolName: string, id: string, input: Record<string, unknown>) =>
  ev('tool_use', { toolName, data: { id, input } });
const result = (id: string, content: unknown) => ev('tool_result', { data: { id, content } });

describe('groupTranscript', () => {
  it('folds a stretch of calls into one group and pairs results by id', () => {
    const items = groupTranscript([
      ev('user', { text: 'go' }),
      use('Bash', 't1', { command: 'ls' }),
      use('Read', 't2', { file_path: '/a/b.ts' }),
      result('t2', 'file body'),
      result('t1', 'a\nb'),
      ev('assistant_text', { text: 'done' }),
      use('Bash', 't3', { command: 'pwd' }),
    ]);
    expect(items.map((i) => i.type)).toEqual(['event', 'tools', 'event', 'tools']);
    const group = items[1];
    if (group.type !== 'tools') throw new Error('expected tools');
    expect(group.calls.map((c) => resultText(c.result))).toEqual(['a\nb', 'file body']);
  });

  it('keeps a call with no result yet', () => {
    const items = groupTranscript([use('Bash', 't1', { command: 'sleep 9' })]);
    expect(items[0]).toMatchObject({ type: 'tools', calls: [{ result: null }] });
  });
});

describe('describeCall', () => {
  it('prefers the agent’s own description', () => {
    expect(describeCall(use('Bash', 'x', { command: 'git status', description: 'Check status' }))).toBe(
      'Check status',
    );
  });

  it('falls back to what the call touched', () => {
    expect(describeCall(use('Bash', 'x', { command: 'npm test\nmore' }))).toBe('Ran npm test');
    expect(describeCall(use('Edit', 'x', { file_path: '/repo/src/App.tsx' }))).toBe('Edited App.tsx');
    expect(describeCall(use('Grep', 'x', { pattern: 'TODO' }))).toBe('Searched for “TODO”');
    expect(describeCall(use('mcp__brain__add_task', 'x', {}))).toBe('Used add task');
  });
});

describe('summarizeCalls', () => {
  const call = (name: string) => ({ use: use(name, `${name}${seq}`, {}), result: null });

  it('lets a single call speak for itself', () => {
    expect(summarizeCalls([{ use: use('Read', 'x', { file_path: '/a/README.md' }), result: null }])).toBe(
      'Read README.md',
    );
  });

  it('counts calls by what they did', () => {
    expect(summarizeCalls([call('Bash'), call('Bash'), call('Bash')])).toBe('Ran 3 commands');
    expect(summarizeCalls([call('Read'), call('Edit'), call('Read'), call('Bash')])).toBe(
      'Edited a file, ran a command, read 2 files',
    );
  });
});

describe('resultText and callDetail', () => {
  it('flattens block content', () => {
    expect(resultText(result('x', [{ type: 'text', text: 'one' }, { type: 'text', text: 'two' }]))).toBe(
      'one\ntwo',
    );
    expect(resultText(null)).toBe('');
  });

  it('shows the command or path a call was given', () => {
    expect(callDetail(use('Bash', 'x', { command: 'ls -la' }))).toBe('ls -la');
    expect(callDetail(use('Read', 'x', { file_path: '/a/b' }))).toBe('/a/b');
  });
});
