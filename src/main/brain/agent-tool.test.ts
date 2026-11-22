import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { closeDb, initDbAt } from '../db/client';
import { createSession } from '../repo/sessions';
import { captureBrainItem, getBrainItem, getMission, listBrainBySession } from '../repo/brain';
import { applyBrainTool } from './agent-tool';

const NOW = new Date(2026, 8, 12, 10, 0).getTime();
const MINUTE = 60_000;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  await initDbAt(':memory:');
});
afterEach(() => {
  closeDb();
  vi.useRealTimers();
});

describe('applyBrainTool', () => {
  test('add defaults to a task linked to the session and authored by the agent', async () => {
    const s = await createSession({ name: 'S' });
    const result = await applyBrainTool({ action: 'add', title: 'wire the thing' }, s.id);
    expect(result.item.kind).toBe('task');
    expect(result.item.sessionId).toBe(s.id);
    expect(result.item.createdBy).toBe('agent');
    expect(result.ack).toMatch(/wire the thing/);
  });

  test('add can make a reminder that fires in N minutes', async () => {
    const s = await createSession({ name: 'S' });
    const { item } = await applyBrainTool(
      { action: 'add', kind: 'reminder', title: 'CI will need your approval', inMinutes: 20 },
      s.id,
    );
    expect(item.kind).toBe('reminder');
    expect(item.dueAt).toBe(NOW + 20 * MINUTE);
  });

  test('a reminder with no time is refused rather than armed for never', async () => {
    const s = await createSession({ name: 'S' });
    await expect(
      applyBrainTool({ action: 'add', kind: 'reminder', title: 'when?' }, s.id),
    ).rejects.toThrow(/inMinutes/);
  });

  test('done accepts the short id from the mirror', async () => {
    const s = await createSession({ name: 'S' });
    const t = await captureBrainItem({ kind: 'task', title: 't', sessionId: s.id });
    const short = t.id.replace(/-/g, '').slice(0, 6);
    await applyBrainTool({ action: 'done', id: `id:${short}` }, s.id);
    expect((await getBrainItem(t.id))?.status).toBe('done');
  });

  test('done cannot reach into another session', async () => {
    const a = await createSession({ name: 'A' });
    const b = await createSession({ name: 'B' });
    const t = await captureBrainItem({ kind: 'task', title: 'theirs', sessionId: a.id });
    const short = t.id.replace(/-/g, '').slice(0, 6);
    await expect(applyBrainTool({ action: 'done', id: short }, b.id)).rejects.toThrow(/No brain entry/);
    expect((await getBrainItem(t.id))?.status).toBe('open');
  });

  test('mission sets or rewrites the session mission', async () => {
    const s = await createSession({ name: 'S' });
    await applyBrainTool({ action: 'mission', title: 'Green CI', body: 'by Friday' }, s.id);
    expect(await getMission(s.id)).toMatchObject({ title: 'Green CI', body: 'by Friday' });
    await applyBrainTool({ action: 'mission', body: 'by Thursday' }, s.id);
    expect(await getMission(s.id)).toMatchObject({ title: 'Green CI', body: 'by Thursday' });
    expect(await listBrainBySession(s.id)).toHaveLength(1);
  });

  test('add without a title, or done without an id, is an error', async () => {
    const s = await createSession({ name: 'S' });
    await expect(applyBrainTool({ action: 'add' }, s.id)).rejects.toThrow(/title/);
    await expect(applyBrainTool({ action: 'done' }, s.id)).rejects.toThrow(/id/);
  });
});
