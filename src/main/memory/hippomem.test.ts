import { describe, expect, it } from 'vitest';
import { repoNameFromRemote, serverUrlFromToml, settingsUseHippomem } from './hippomem';

describe('serverUrlFromToml', () => {
  it('reads host and port from the [server] section', () => {
    const toml = '[server]\nhost = "0.0.0.0"\nport = 9001\n\n[review]\nport = 1\n';
    expect(serverUrlFromToml(toml)).toBe('http://0.0.0.0:9001');
  });

  it('falls back to the CLI defaults', () => {
    expect(serverUrlFromToml('')).toBe('http://127.0.0.1:8765');
    expect(serverUrlFromToml('[review]\nmax_per_session = 2\n')).toBe('http://127.0.0.1:8765');
  });
});

describe('repoNameFromRemote', () => {
  it('handles https and ssh remotes', () => {
    expect(repoNameFromRemote('https://github.com/z10-labs/whetstone.git')).toBe('whetstone');
    expect(repoNameFromRemote('git@github.com:Dzithendo31/tutorspaces-web.git\n')).toBe(
      'tutorspaces-web',
    );
    expect(repoNameFromRemote('https://github.com/z10-labs/rami/')).toBe('rami');
  });

  it('returns null for an empty remote', () => {
    expect(repoNameFromRemote('  ')).toBeNull();
  });
});

describe('settingsUseHippomem', () => {
  it('spots hippomem hook commands', () => {
    const json = JSON.stringify({
      hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'hippomem hook session-start' }] }] },
    });
    expect(settingsUseHippomem(json)).toBe(true);
  });

  it('ignores other settings and bad JSON', () => {
    expect(settingsUseHippomem(JSON.stringify({ permissions: { allow: ['hippomem'] } }))).toBe(false);
    expect(settingsUseHippomem('{nope')).toBe(false);
  });
});
