import { describe, expect, it } from 'vitest';
import { launchArgs } from './launch';
import { dockTerminalTitle } from '@shared/terminals';

const SHELL = '/bin/zsh';
const ID = '4cf33e4e-ae41-4e63-8c0a-8ff3b5ce7a67';

describe('launchArgs', () => {
  it('starts a fresh Claude Code session', () => {
    expect(launchArgs({ profile: 'claude', resume: null }, SHELL)).toEqual(['-lic', 'exec claude']);
  });

  it('resumes a known Claude Code session', () => {
    expect(launchArgs({ profile: 'claude', resume: ID }, SHELL)).toEqual([
      '-lic',
      `exec claude --resume ${ID}`,
    ]);
  });

  it('refuses a resume id that is not a session id', () => {
    expect(() => launchArgs({ profile: 'claude', resume: 'x; rm -rf ~' }, SHELL)).toThrow(
      /session id/,
    );
  });

  it('opens a plain login shell', () => {
    expect(launchArgs({ profile: 'shell' }, SHELL)).toEqual(['-l']);
  });

  it('runs a command and falls back to a shell when it ends', () => {
    expect(launchArgs({ profile: 'command', command: ' npm run dev ' }, SHELL)).toEqual([
      '-lic',
      'npm run dev; exec /bin/zsh -l',
    ]);
  });

  it('refuses an empty command', () => {
    expect(() => launchArgs({ profile: 'command', command: '  ' }, SHELL)).toThrow(/needs a command/);
  });
});

describe('dockTerminalTitle', () => {
  it('prefers an explicit title', () => {
    expect(dockTerminalTitle({ sessionId: null, cwd: '/a/b', profile: 'shell', title: ' api ' })).toBe(
      'api',
    );
  });

  it('names a shell after its folder', () => {
    expect(dockTerminalTitle({ sessionId: null, cwd: '/Users/me/whetstone/', profile: 'shell' })).toBe(
      'whetstone',
    );
  });

  it('names a command after its first words', () => {
    expect(
      dockTerminalTitle({
        sessionId: null,
        cwd: '/a',
        profile: 'command',
        command: 'npm run dev -- --port 3001',
      }),
    ).toBe('npm run dev');
  });
});
