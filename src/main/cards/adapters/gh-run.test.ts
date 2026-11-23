import { describe, expect, test, vi } from 'vitest';
import { formatDuration, ghRunAdapter, jobToStep, median, type GhRunState } from './gh-run';
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

const runningRun = {
  status: 'in_progress',
  conclusion: '',
  workflowName: 'release',
  displayTitle: 'Release main',
  headBranch: 'main',
  headSha: 'a41f9c2deadbeef',
  url: 'https://github.com/o/r/actions/runs/4812',
  createdAt: '2026-11-23T10:00:00Z',
  startedAt: '2026-11-23T10:00:00Z',
  updatedAt: '2026-11-23T10:28:00Z',
  jobs: [
    { name: 'build', status: 'completed', conclusion: 'success', startedAt: '2026-11-23T10:00:00Z', completedAt: '2026-11-23T10:04:34Z' },
    { name: 'integration', status: 'in_progress', conclusion: '', startedAt: '2026-11-23T10:06:34Z', completedAt: '0001-01-01T00:00:00Z' },
    { name: 'deploy', status: 'queued', conclusion: '' },
  ],
};

const history = [9, 8, 10, 9, 11].map((min) => ({
  createdAt: '2026-11-20T10:00:00Z',
  updatedAt: new Date(Date.parse('2026-11-20T10:00:00Z') + min * 60_000).toISOString(),
}));

describe('helpers', () => {
  test('formatDuration', () => {
    expect(formatDuration(274)).toBe('4:34');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(-3)).toBe('0:00');
  });

  test('median of odd, even and empty lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([])).toBeNull();
  });

  test('jobToStep maps conclusions to statuses', () => {
    expect(jobToStep({ name: 'a', status: 'completed', conclusion: 'failure' }, NOW).status).toBe('failed');
    expect(jobToStep({ name: 'a', status: 'completed', conclusion: 'skipped' }, NOW).tone).toBe('dim');
    expect(jobToStep({ name: 'a', status: 'waiting' }, NOW).status).toBe('pending');
  });
});

describe('ghRunAdapter', () => {
  test('normalises a running run and computes the overrun against history', async () => {
    const exec = vi.fn<ExecFn>(async (_file, args) =>
      JSON.stringify(args[1] === 'list' ? history : runningRun),
    );
    const state = (await ghRunAdapter(
      { kind: 'gh-run', repo: 'o/r', runId: 4812 },
      null,
      ctxWith(exec),
    )) as GhRunState;

    expect(state.elapsedSec).toBe(28 * 60 + 14);
    expect(state.typicalSec).toBe(9 * 60);
    expect(state.overrunLabel).toBe('3.1× usual');
    expect(state.overrunTone).toBe('warn');
    expect(state.sha).toBe('a41f9c2');
    expect(state.currentJob).toBe('integration');
    expect(state.jobs.map((j) => j.status)).toEqual(['done', 'running', 'pending']);
    expect(state.jobs[0].detail).toBe('4:34');
  });

  test('carries typicalSec forward instead of refetching history', async () => {
    const exec = vi.fn<ExecFn>(async () => JSON.stringify(runningRun));
    await ghRunAdapter(
      { kind: 'gh-run', repo: 'o/r', runId: 4812 },
      { typicalSec: 300 },
      ctxWith(exec),
    );
    expect(exec).toHaveBeenCalledTimes(1);
  });

  test('a failed run pulls the failed log tail once', async () => {
    const failed = { ...runningRun, status: 'completed', conclusion: 'failure' };
    const exec = vi.fn<ExecFn>(async (_file, args) => {
      if (args.includes('--log-failed')) {
        return 'integration\tRun tests\t2026-11-23T10:20:00.0000000Z FAIL rating.spec.ts\n';
      }
      return JSON.stringify(failed);
    });
    const state = (await ghRunAdapter(
      { kind: 'gh-run', repo: 'o/r', runId: 4812 },
      { typicalSec: 540 },
      ctxWith(exec),
    )) as GhRunState;
    expect(state.logTail).toEqual(['FAIL rating.spec.ts']);
    expect(state.overrunTone).toBe('err');

    exec.mockClear();
    await ghRunAdapter({ kind: 'gh-run', repo: 'o/r', runId: 4812 }, state, ctxWith(exec));
    expect(exec).toHaveBeenCalledTimes(1);
  });

  test('a missing history still produces a card', async () => {
    const exec = vi.fn<ExecFn>(async (_file, args) => {
      if (args[1] === 'list') throw new Error('no runs');
      return JSON.stringify(runningRun);
    });
    const state = (await ghRunAdapter(
      { kind: 'gh-run', repo: 'o/r', runId: 1 },
      null,
      ctxWith(exec),
    )) as GhRunState;
    expect(state.typicalSec).toBeNull();
    expect(state.overrunLabel).toBe('');
  });

  test('non-JSON output is a readable error', async () => {
    const exec = vi.fn<ExecFn>(async () => 'HTTP 404');
    await expect(
      ghRunAdapter({ kind: 'gh-run', repo: 'o/r', runId: 1 }, null, ctxWith(exec)),
    ).rejects.toThrow('did not return JSON');
  });
});
