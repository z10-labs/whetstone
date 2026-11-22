import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDockTerminal,
  dockLaunch,
  getDockTerminal,
  listDockTerminals,
  markDockTerminalExited,
  markDockTerminalRunning,
  removeDockTerminal,
  resetDockTerminals,
} from './dock';

beforeEach(() => resetDockTerminals());

describe('dock terminals', () => {
  it('creates a running shell named after its folder', () => {
    const t = createDockTerminal({ sessionId: 's1', cwd: '/repo/api', profile: 'shell' });
    expect(t).toMatchObject({ sessionId: 's1', title: 'api', status: 'running', command: null });
    expect(t.id).toMatch(/^term_/);
    expect(dockLaunch(t)).toEqual({ profile: 'shell' });
  });

  it('keeps the trimmed command for command terminals', () => {
    const t = createDockTerminal({
      sessionId: null,
      cwd: '/repo',
      profile: 'command',
      command: '  npm test  ',
    });
    expect(t.command).toBe('npm test');
    expect(dockLaunch(t)).toEqual({ profile: 'command', command: 'npm test' });
  });

  it('refuses a command terminal with no command', () => {
    expect(() => createDockTerminal({ sessionId: null, cwd: '/r', profile: 'command' })).toThrow();
    expect(listDockTerminals()).toEqual([]);
  });

  it('records an exit without mutating the earlier record', () => {
    const t = createDockTerminal({ sessionId: null, cwd: '/r', profile: 'shell' });
    const exited = markDockTerminalExited(t.id, 130);
    expect(exited).toMatchObject({ status: 'exited', exitCode: 130 });
    expect(t.status).toBe('running');
    expect(markDockTerminalRunning(t.id)).toMatchObject({ status: 'running', exitCode: null });
  });

  it('lists oldest first and forgets removed tabs', () => {
    const a = createDockTerminal({ sessionId: null, cwd: '/a', profile: 'shell' });
    const b = createDockTerminal({ sessionId: null, cwd: '/b', profile: 'shell' });
    expect(listDockTerminals().map((t) => t.id)).toEqual([a.id, b.id]);
    expect(removeDockTerminal(a.id)).toBe(true);
    expect(getDockTerminal(a.id)).toBeNull();
    expect(markDockTerminalExited(a.id, 0)).toBeNull();
  });
});
