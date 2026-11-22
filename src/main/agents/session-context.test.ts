import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { closeDb, initDbAt } from '../db/client';
import { createSession } from '../repo/sessions';
import { captureBrainItem, setMission } from '../repo/brain';
import { compileDigest } from './session-context';

const NOW = new Date(2026, 8, 12, 10, 0).getTime();

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  await initDbAt(':memory:');
});
afterEach(() => {
  closeDb();
  vi.useRealTimers();
});

describe('compileDigest — the mission reaches every run', () => {
  test('leads with the mission, its body, and the open session entries with ids', async () => {
    const s = await createSession({ name: 'Fix the CI flake' });
    await setMission({ sessionId: s.id, title: 'Green CI by Friday', body: 'retry loop, not the tests' });
    const t = await captureBrainItem({ kind: 'task', title: 'bisect the flake', sessionId: s.id });
    await captureBrainItem({ kind: 'task', title: 'unrelated', sessionId: null });

    const digest = await compileDigest(s.id, null);
    expect(digest).not.toBeNull();
    const md = digest as string;
    const mission = md.indexOf('## Mission');
    expect(mission).toBeGreaterThan(-1);
    expect(mission).toBeLessThan(md.indexOf('## Runs in this session'));
    expect(md).toContain('Green CI by Friday');
    expect(md).toContain('retry loop, not the tests');
    expect(md).toContain(`- [ ] bisect the flake`);
    expect(md).toContain(`\`id:${t.id.replace(/-/g, '').slice(0, 6)}\``);
    expect(md).not.toContain('unrelated');
    expect(md).toContain('`brain`');
  });

  test('says so when no mission has been set', async () => {
    const s = await createSession({ name: 'Loose' });
    expect(await compileDigest(s.id, null)).toContain('No mission set');
  });
});
