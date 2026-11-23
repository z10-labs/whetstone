import os from 'node:os';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { fileAdapter, isPathInside, resolveBindingPath } from './file';
import type { AdapterContext, ReadFileFn } from './types';

const NOW = Date.parse('2026-11-23T10:28:14Z');
const CWD = '/proj/session';

function ctxWith(readFile: ReadFileFn, cwd: string | null = CWD): AdapterContext {
  return {
    cwd,
    exec: vi.fn(),
    shell: vi.fn(),
    readFile,
    now: () => NOW,
  };
}

describe('resolveBindingPath', () => {
  test('expands ~ to the home directory', () => {
    expect(resolveBindingPath('~/.whetstone/x.json', null)).toBe(
      path.join(os.homedir(), '.whetstone/x.json'),
    );
    expect(resolveBindingPath('~', null)).toBe(os.homedir());
  });

  test('resolves relative paths against cwd', () => {
    expect(resolveBindingPath('out/stats.json', CWD)).toBe(path.resolve(CWD, 'out/stats.json'));
  });

  test('relative path without cwd is an error', () => {
    expect(() => resolveBindingPath('out/stats.json', null)).toThrow(/requires a session cwd/);
  });

  test('absolute paths are returned normalised', () => {
    expect(resolveBindingPath('/tmp/a.json', null)).toBe(path.normalize('/tmp/a.json'));
  });
});

describe('isPathInside', () => {
  test('accepts a path under a root', () => {
    expect(isPathInside('/a/b/c', ['/a/b'])).toBe(true);
    expect(isPathInside('/a/b', ['/a/b'])).toBe(true);
  });

  test('rejects a ../ escape', () => {
    expect(isPathInside('/a/b/../secret', ['/a/b'])).toBe(false);
    expect(isPathInside('/a/secret', ['/a/b'])).toBe(false);
  });

  test('rejects a sibling-prefix trap (/a/bc is not inside /a/b)', () => {
    expect(isPathInside('/a/bc', ['/a/b'])).toBe(false);
    expect(isPathInside('/a/b-extra/x', ['/a/b'])).toBe(false);
  });
});

describe('fileAdapter', () => {
  test('parse json returns the parsed object', async () => {
    const readFile = vi.fn<ReadFileFn>(async () => '{"ok":true,"n":1}');
    const state = await fileAdapter(
      { kind: 'file', path: 'stats.json', parse: 'json' },
      null,
      ctxWith(readFile),
    );
    expect(state).toEqual({ ok: true, n: 1 });
    expect(readFile).toHaveBeenCalledWith(path.resolve(CWD, 'stats.json'));
  });

  test('json parse error names the file', async () => {
    const readFile = vi.fn<ReadFileFn>(async () => 'not-json');
    await expect(
      fileAdapter({ kind: 'file', path: 'bad.json', parse: 'json' }, null, ctxWith(readFile)),
    ).rejects.toThrow(/bad\.json/);
  });

  test('tail returns the last 20 lines by default', async () => {
    const lines = Array.from({ length: 30 }, (_, i) => `L${i + 1}`);
    const readFile = vi.fn<ReadFileFn>(async () => lines.join('\n') + '\n');
    const state = (await fileAdapter(
      { kind: 'file', path: 'log.txt', parse: 'tail' },
      null,
      ctxWith(readFile),
    )) as { lines: string[] };
    expect(state.lines).toEqual(lines.slice(-20));
  });

  test('tail respects an explicit lines count', async () => {
    const readFile = vi.fn<ReadFileFn>(async () => 'a\nb\nc\nd\n');
    const state = (await fileAdapter(
      { kind: 'file', path: 'log.txt', parse: 'tail', lines: 2 },
      null,
      ctxWith(readFile),
    )) as { lines: string[] };
    expect(state.lines).toEqual(['c', 'd']);
  });

  test('~ expansion is used when reading', async () => {
    const readFile = vi.fn<ReadFileFn>(async () => '{"x":1}');
    await fileAdapter(
      { kind: 'file', path: '~/.whetstone/s.json', parse: 'json' },
      null,
      ctxWith(readFile, null),
    );
    expect(readFile).toHaveBeenCalledWith(path.join(os.homedir(), '.whetstone/s.json'));
  });

  test('relative path without cwd fails before reading', async () => {
    const readFile = vi.fn<ReadFileFn>();
    await expect(
      fileAdapter({ kind: 'file', path: 'x.json', parse: 'json' }, null, ctxWith(readFile, null)),
    ).rejects.toThrow(/requires a session cwd/);
    expect(readFile).not.toHaveBeenCalled();
  });
});
