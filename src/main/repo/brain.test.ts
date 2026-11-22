import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, getDb, initDbAt } from '../db/client';
import { brainItems } from '../db/schema';
import { DONE_WINDOW_MS } from '@shared/brain';
import {
  captureBrainItem,
  claimDueBrainItems,
  clearFinishedBrainItems,
  findBrainItemByShortId,
  getBrainItem,
  getMission,
  listBrain,
  listBrainBySession,
  removeBrainItem,
  removeMissionForSession,
  setMission,
  updateBrainItem,
} from './brain';
import { createSession } from './sessions';

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

describe('captureBrainItem', () => {
  test('stores a trimmed title as an open, human entry', async () => {
    const item = await captureBrainItem({ kind: 'task', title: '  ship it  ' });
    expect(item.title).toBe('ship it');
    expect(item.status).toBe('open');
    expect(item.createdBy).toBe('human');
    expect(item.dueAt).toBeNull();
    expect(await getBrainItem(item.id)).toEqual(item);
  });
  test('rejects an empty title — a spark needs words', async () => {
    await expect(captureBrainItem({ kind: 'jot', title: '   ' })).rejects.toThrow(/title/);
  });
});

describe('listBrain', () => {
  test('returns live entries and recently finished ones, oldest first', async () => {
    const a = await captureBrainItem({ kind: 'task', title: 'a' });
    vi.setSystemTime(NOW + 1000);
    const b = await captureBrainItem({ kind: 'jot', title: 'b' });
    await updateBrainItem({ id: b.id, status: 'done' });
    const ids = (await listBrain()).map((i) => i.id);
    expect(ids).toEqual([a.id, b.id]);
  });
  test('drops entries finished longer ago than the done window', async () => {
    const old = await captureBrainItem({ kind: 'task', title: 'ancient' });
    await getDb()
      .update(brainItems)
      .set({ status: 'done', doneAt: NOW - DONE_WINDOW_MS - 1, updatedAt: NOW - DONE_WINDOW_MS - 1 })
      .where(eq(brainItems.id, old.id))
      .run();
    const fresh = await captureBrainItem({ kind: 'task', title: 'fresh' });
    expect((await listBrain()).map((i) => i.id)).toEqual([fresh.id]);
  });
});

describe('updateBrainItem', () => {
  test('finishing stamps doneAt and reopening clears it', async () => {
    const t = await captureBrainItem({ kind: 'task', title: 't' });
    const done = await updateBrainItem({ id: t.id, status: 'done' });
    expect(done.doneAt).toBe(NOW);
    const reopened = await updateBrainItem({ id: t.id, status: 'open' });
    expect(reopened.doneAt).toBeNull();
  });
  test('rescheduling rearms a fired reminder', async () => {
    const r = await captureBrainItem({ kind: 'reminder', title: 'r', dueAt: NOW - 1 });
    expect(await claimDueBrainItems()).toHaveLength(1);
    expect((await getBrainItem(r.id))?.firedAt).toBe(NOW);
    const later = await updateBrainItem({ id: r.id, dueAt: NOW + 600_000 });
    expect(later.firedAt).toBeNull();
  });
  test('a blank title in a patch keeps the old one', async () => {
    const t = await captureBrainItem({ kind: 'task', title: 'keep me' });
    expect((await updateBrainItem({ id: t.id, title: '   ' })).title).toBe('keep me');
  });
  test('an unknown id is an error, not a silent no-op', async () => {
    await expect(updateBrainItem({ id: 'nope', status: 'done' })).rejects.toThrow(/not found/);
  });
});

describe('claimDueBrainItems', () => {
  test('claims only dated, unfired, unfinished entries whose time has come', async () => {
    const due = await captureBrainItem({ kind: 'reminder', title: 'due', dueAt: NOW - 1 });
    const held = await captureBrainItem({ kind: 'task', title: 'held', dueAt: NOW - 1 });
    await updateBrainItem({ id: held.id, status: 'doing' });
    await captureBrainItem({ kind: 'task', title: 'undated' });
    await captureBrainItem({ kind: 'reminder', title: 'future', dueAt: NOW + 1 });
    const finished = await captureBrainItem({ kind: 'reminder', title: 'finished', dueAt: NOW - 1 });
    await updateBrainItem({ id: finished.id, status: 'done' });

    const claimed = (await claimDueBrainItems()).map((i) => i.id).sort();
    expect(claimed).toEqual([due.id, held.id].sort());
  });
  test('fires exactly once — a second claim returns nothing', async () => {
    await captureBrainItem({ kind: 'reminder', title: 'once', dueAt: NOW - 1 });
    expect(await claimDueBrainItems()).toHaveLength(1);
    expect(await claimDueBrainItems()).toHaveLength(0);
  });
  test('concurrent claims never hand the same entry to both callers', async () => {
    await captureBrainItem({ kind: 'reminder', title: 'race', dueAt: NOW - 1 });
    const [a, b] = await Promise.all([claimDueBrainItems(), claimDueBrainItems()]);
    expect(a.length + b.length).toBe(1);
  });
});

describe('removeBrainItem / clearFinishedBrainItems', () => {
  test('forgets one entry outright', async () => {
    const t = await captureBrainItem({ kind: 'jot', title: 'gone' });
    await removeBrainItem(t.id);
    expect(await getBrainItem(t.id)).toBeNull();
  });
  test('sweeps every finished entry and leaves live work alone', async () => {
    const live = await captureBrainItem({ kind: 'task', title: 'live' });
    const d = await captureBrainItem({ kind: 'task', title: 'd' });
    await updateBrainItem({ id: d.id, status: 'done' });
    const x = await captureBrainItem({ kind: 'reminder', title: 'x' });
    await updateBrainItem({ id: x.id, status: 'dropped' });
    await clearFinishedBrainItems();
    expect((await listBrain()).map((i) => i.id)).toEqual([live.id]);
  });
});

describe('missions — one per Session', () => {
  test('setMission creates the mission once and then edits it in place', async () => {
    const s = await createSession({ name: 'Fix the CI flake' });
    const first = await setMission({ sessionId: s.id, title: 'Green CI by Friday' });
    expect(first.kind).toBe('mission');
    expect(first.sessionId).toBe(s.id);
    expect(first.sessionName).toBe('Fix the CI flake');

    const second = await setMission({ sessionId: s.id, body: 'retry loop, not the tests' });
    expect(second.id).toBe(first.id);
    expect(second.title).toBe('Green CI by Friday');
    expect(second.body).toBe('retry loop, not the tests');
    expect(await getMission(s.id)).toEqual(second);
    expect((await listBrain()).filter((i) => i.kind === 'mission')).toHaveLength(1);
  });

  test('two concurrent setMission calls still leave exactly one mission', async () => {
    const s = await createSession({ name: 'Race' });
    const [a, b] = await Promise.all([
      setMission({ sessionId: s.id, title: 'first' }),
      setMission({ sessionId: s.id, title: 'second' }),
    ]);
    expect(a.id).toBe(b.id);
    expect((await listBrain()).filter((i) => i.kind === 'mission')).toHaveLength(1);
  });

  test('linked entries carry their session name; loose ones carry null', async () => {
    const s = await createSession({ name: 'Ship v2' });
    await captureBrainItem({ kind: 'task', title: 'linked', sessionId: s.id });
    await captureBrainItem({ kind: 'task', title: 'loose' });
    const names = Object.fromEntries((await listBrain()).map((i) => [i.title, i.sessionName]));
    expect(names).toEqual({ linked: 'Ship v2', loose: null });
  });

  test('listBrainBySession returns only that session\'s live entries', async () => {
    const a = await createSession({ name: 'A' });
    const b = await createSession({ name: 'B' });
    await setMission({ sessionId: a.id, title: 'mission a' });
    await captureBrainItem({ kind: 'task', title: 'a task', sessionId: a.id });
    const done = await captureBrainItem({ kind: 'task', title: 'a done', sessionId: a.id });
    await updateBrainItem({ id: done.id, status: 'done' });
    await captureBrainItem({ kind: 'task', title: 'b task', sessionId: b.id });
    await captureBrainItem({ kind: 'jot', title: 'loose' });
    const titles = (await listBrainBySession(a.id)).map((i) => i.title).sort();
    expect(titles).toEqual(['a task', 'mission a']);
  });

  test('removeMissionForSession takes the mission and leaves the session\'s tasks', async () => {
    const s = await createSession({ name: 'S' });
    await setMission({ sessionId: s.id, title: 'm' });
    const t = await captureBrainItem({ kind: 'task', title: 't', sessionId: s.id });
    await removeMissionForSession(s.id);
    expect(await getMission(s.id)).toBeNull();
    expect(await getBrainItem(t.id)).not.toBeNull();
  });
});

describe('findBrainItemByShortId', () => {
  test('resolves the six-character id agents read in the mirror', async () => {
    const t = await captureBrainItem({ kind: 'task', title: 'find me' });
    const short = t.id.replace(/-/g, '').slice(0, 6);
    expect((await findBrainItemByShortId(short))?.id).toBe(t.id);
    expect((await findBrainItemByShortId(`id:${short}`))?.id).toBe(t.id);
    expect((await findBrainItemByShortId(t.id))?.id).toBe(t.id);
  });
  test('is null for an unknown id', async () => {
    expect(await findBrainItemByShortId('zzzzzz')).toBeNull();
  });
  test('wildcards and junk never match anything', async () => {
    await captureBrainItem({ kind: 'task', title: 'x' });
    expect(await findBrainItemByShortId('%')).toBeNull();
    expect(await findBrainItemByShortId('_')).toBeNull();
    expect(await findBrainItemByShortId('id:')).toBeNull();
  });
  test('can be scoped to a session', async () => {
    const a = await createSession({ name: 'A' });
    const b = await createSession({ name: 'B' });
    const t = await captureBrainItem({ kind: 'task', title: 't', sessionId: a.id });
    const short = t.id.replace(/-/g, '').slice(0, 6);
    expect((await findBrainItemByShortId(short, a.id))?.id).toBe(t.id);
    expect(await findBrainItemByShortId(short, b.id)).toBeNull();
  });
});
