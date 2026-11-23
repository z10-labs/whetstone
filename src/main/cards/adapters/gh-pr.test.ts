import { describe, expect, test, vi } from 'vitest';
import { ghPrAdapter, rollupToStep, type GhPrState } from './gh-pr';
import type { AdapterContext, ExecFn } from './types';

const NOW = Date.parse('2026-11-23T10:28:14Z');

function ctxWith(exec: ExecFn): AdapterContext {
  return {
    cwd: null,
    exec,
    shell: vi.fn(),
    readFile: vi.fn(),
    now: () => NOW,
  };
}

const prJson = {
  number: 42,
  title: 'Add live cards',
  url: 'https://github.com/o/r/pull/42',
  state: 'OPEN',
  reviewDecision: 'APPROVED',
  mergeable: 'MERGEABLE',
  statusCheckRollup: [
    { name: 'build', status: 'completed', conclusion: 'success' },
    { name: 'test', status: 'in_progress', conclusion: '' },
    { name: 'lint', status: 'completed', conclusion: 'skipped' },
    { name: 'typecheck', status: 'completed', conclusion: 'failure' },
    { context: 'deploy/staging', state: 'SUCCESS' },
    { context: 'codecov/patch', state: 'PENDING' },
    { context: 'license/scan', state: 'FAILURE' },
    { context: 'security', state: 'ERROR' },
  ],
};

const graphqlOk = JSON.stringify({
  data: {
    repository: {
      pullRequest: {
        reviewThreads: {
          nodes: [
            { isResolved: true },
            { isResolved: false },
            { isResolved: false },
          ],
        },
      },
    },
  },
});

describe('rollupToStep', () => {
  test('maps check runs', () => {
    expect(rollupToStep({ name: 'a', status: 'completed', conclusion: 'success' })).toEqual({
      name: 'a',
      status: 'done',
    });
    expect(rollupToStep({ name: 'b', status: 'in_progress', conclusion: '' }).status).toBe('running');
    expect(rollupToStep({ name: 'c', status: 'completed', conclusion: 'failure' })).toMatchObject({
      status: 'failed',
      tone: 'err',
    });
    expect(rollupToStep({ name: 'd', status: 'completed', conclusion: 'skipped' })).toMatchObject({
      status: 'pending',
      tone: 'dim',
    });
    expect(rollupToStep({ name: 'e', status: 'completed', conclusion: 'neutral' })).toMatchObject({
      status: 'pending',
      tone: 'dim',
    });
  });

  test('maps status contexts', () => {
    expect(rollupToStep({ context: 'ci', state: 'SUCCESS' })).toEqual({ name: 'ci', status: 'done' });
    expect(rollupToStep({ context: 'ci', state: 'PENDING' }).status).toBe('running');
    expect(rollupToStep({ context: 'ci', state: 'FAILURE' })).toMatchObject({
      status: 'failed',
      tone: 'err',
    });
  });
});

describe('ghPrAdapter', () => {
  test('normalises checks, counts, summary and conflicts', async () => {
    const exec = vi.fn<ExecFn>(async (_file, args) => {
      if (args[0] === 'api') return graphqlOk;
      return JSON.stringify(prJson);
    });
    const state = (await ghPrAdapter(
      { kind: 'gh-pr', repo: 'o/r', pr: 42 },
      null,
      ctxWith(exec),
    )) as GhPrState;

    expect(state.number).toBe(42);
    expect(state.title).toBe('Add live cards');
    expect(state.review).toBe('approved');
    expect(state.conflicts).toBe(false);
    expect(state.checksPassed).toBe(2); // build + deploy/staging
    expect(state.checksRunning).toBe(2); // test + codecov/patch
    expect(state.checksTotal).toBe(8);
    expect(state.unresolved).toBe(2);
    expect(state.summary).toBe('2/8 checks · 2 running · 2 unresolved');
    expect(state.checks.map((c) => c.status)).toEqual([
      'done',
      'running',
      'pending',
      'failed',
      'done',
      'running',
      'failed',
      'failed',
    ]);
  });

  test('conflicts when mergeable is CONFLICTING', async () => {
    const exec = vi.fn<ExecFn>(async (_file, args) => {
      if (args[0] === 'api') return graphqlOk;
      return JSON.stringify({ ...prJson, mergeable: 'CONFLICTING', statusCheckRollup: [] });
    });
    const state = (await ghPrAdapter(
      { kind: 'gh-pr', repo: 'o/r', pr: 42 },
      null,
      ctxWith(exec),
    )) as GhPrState;
    expect(state.conflicts).toBe(true);
    expect(state.summary).toBe('0/0 checks · 2 unresolved');
  });

  test('graphql failure keeps the previous unresolved value', async () => {
    const exec = vi.fn<ExecFn>(async (_file, args) => {
      if (args[0] === 'api') throw new Error('graphql down');
      return JSON.stringify({ ...prJson, statusCheckRollup: [] });
    });
    const state = (await ghPrAdapter(
      { kind: 'gh-pr', repo: 'o/r', pr: 42 },
      { unresolved: 5 },
      ctxWith(exec),
    )) as GhPrState;
    expect(state.unresolved).toBe(5);

    const first = (await ghPrAdapter(
      { kind: 'gh-pr', repo: 'o/r', pr: 42 },
      null,
      ctxWith(exec),
    )) as GhPrState;
    expect(first.unresolved).toBeNull();
  });

  test('non-JSON output is a readable error', async () => {
    const exec = vi.fn<ExecFn>(async () => 'HTTP 404');
    await expect(
      ghPrAdapter({ kind: 'gh-pr', repo: 'o/r', pr: 1 }, null, ctxWith(exec)),
    ).rejects.toThrow('did not return JSON');
  });
});
