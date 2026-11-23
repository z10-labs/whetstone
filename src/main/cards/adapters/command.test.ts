import { describe, expect, test, vi } from 'vitest';
import { commandAdapter, isReadOnlyCommand } from './command';
import { EXEC_MAX_BUFFER, EXEC_TIMEOUT_MS, type AdapterContext, type ShellFn } from './types';

const NOW = Date.parse('2026-11-23T10:28:14Z');

function ctxWith(shell: ShellFn, cwd: string | null = '/session'): AdapterContext {
  return {
    cwd,
    exec: vi.fn(),
    shell,
    readFile: vi.fn(),
    now: () => NOW,
  };
}

describe('commandAdapter', () => {
  test('parses JSON stdout', async () => {
    const shell = vi.fn<ShellFn>(async () => '{"ok":true}');
    const state = await commandAdapter(
      { kind: 'command', command: 'gh run view 1 --json status', everySec: 30 },
      null,
      ctxWith(shell),
    );
    expect(state).toEqual({ ok: true });
  });

  test('non-JSON output is a readable error', async () => {
    const shell = vi.fn<ShellFn>(async () => 'not json at all, just text');
    await expect(
      commandAdapter(
        { kind: 'command', command: 'echo hi', everySec: 30 },
        null,
        ctxWith(shell),
      ),
    ).rejects.toThrow(/command output is not JSON: not json at all/);
  });

  test('binding.cwd takes precedence over ctx.cwd', async () => {
    const shell = vi.fn<ShellFn>(async () => '{}');
    await commandAdapter(
      { kind: 'command', command: 'jq .', cwd: '/binding', everySec: 30 },
      null,
      ctxWith(shell, '/session'),
    );
    expect(shell).toHaveBeenCalledWith('jq .', {
      cwd: '/binding',
      timeoutMs: EXEC_TIMEOUT_MS,
      maxBuffer: EXEC_MAX_BUFFER,
      signal: undefined,
    });
  });

  test('falls back to ctx.cwd when binding has none', async () => {
    const shell = vi.fn<ShellFn>(async () => '{}');
    await commandAdapter(
      { kind: 'command', command: 'jq .', everySec: 30 },
      null,
      ctxWith(shell, '/session'),
    );
    expect(shell).toHaveBeenCalledWith(
      'jq .',
      expect.objectContaining({ cwd: '/session' }),
    );
  });
});

describe('isReadOnlyCommand', () => {
  test.each([
    ['gh run view 4812 --json status'],
    ['gh run list --limit 5'],
    ['gh pr view 42 --json state'],
    ['gh pr list --state open'],
    ['gh pr checks 42'],
    ['gh api repos/o/r/pulls/1'],
    ['gh api -X GET repos/o/r'],
    ['git status --short'],
    ['git log -1 --oneline'],
    ['git rev-parse HEAD'],
    ['cat out/stats.json'],
    ['tail -n 20 log.txt'],
    ['head -n 5 log.txt'],
    ['wc -l log.txt'],
    ['jq . stats.json'],
    ['gh run view 1 --json status | jq .status'],
    [`gh pr view 1 --json statusCheckRollup | jq '.statusCheckRollup | length'`],
  ])('allows %s', (cmd) => {
    expect(isReadOnlyCommand(cmd)).toBe(true);
  });

  test.each([
    ['gh api -X DELETE repos/o/r'],
    ['gh api --method POST repos/o/r'],
    ['gh api repos/x -f a=b'],
    ['gh api repos/x -F a=b'],
    ['gh api repos/x --field a=b'],
    ['gh api repos/x --raw-field a=b'],
    ['gh api repos/x --input -'],
    ['cat a > b'],
    ['cat < a'],
    ['git push'],
    ['git status; rm x'],
    ['rm -rf /'],
    ['jq . | sh'],
    ['gh run view 1; rm x'],
    ['echo `id`'],
    ['echo $(id)'],
    ['curl https://example.com'],
    ['npm test'],
    ['git log && git push'],
    ['git log || git push'],
    ['sleep 1 &'],
    ['gh run view 1\nrm x'],
    ['git log --output=/tmp/x'],
    ['git log -p --ext-diff'],
    [`jq '.a | .b`],
  ])('rejects %s', (cmd) => {
    expect(isReadOnlyCommand(cmd)).toBe(false);
  });
});
