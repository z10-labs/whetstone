import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { closeDb, initDbAt } from '../db/client';
import { createSession } from '../repo/sessions';
import { getCard } from '../repo/cards';
import { applyCardTool, type CardToolScope } from './agent-tool';

let scope: CardToolScope;

const ciSpec = {
  title: 'release.yml #4812',
  binding: { kind: 'gh-run', repo: 'o/r', runId: 4812 },
  blocks: [{ kind: 'stat', value: { $bind: '/elapsedSec' }, format: 'duration' }],
  wakeOn: [{ path: '/conclusion', op: 'eq', value: 'failure', note: 'run failed' }],
};

beforeEach(async () => {
  await initDbAt(':memory:');
  const session = await createSession({ name: 'release-build' });
  scope = { sessionId: session.id, runId: null as unknown as string, cwd: '/repo' };
});

afterEach(() => closeDb());

describe('card tool', () => {
  test('create stores a live card and acks with its short id', async () => {
    const { card, ack } = await applyCardTool({ action: 'create', spec: ciSpec }, scope);
    expect(card.status).toBe('live');
    expect(ack).toMatch(/^Card created id:[0-9a-f]{6} · release\.yml #4812\./);
  });

  test('an invalid spec is a readable, per-field error', async () => {
    await expect(
      applyCardTool(
        { action: 'create', spec: { title: '', blocks: [{ kind: 'nope' }], binding: { kind: 'gh-run', repo: 'bad', runId: 1 } } },
        scope,
      ),
    ).rejects.toThrow(/Invalid card spec:\n- /);
  });

  test('a command binding off the allow-list waits for approval', async () => {
    const { card, ack } = await applyCardTool(
      {
        action: 'create',
        spec: { title: 'stats', blocks: [], binding: { kind: 'command', command: 'npm run stats', everySec: 30 } },
      },
      scope,
    );
    expect(card.status).toBe('awaiting-approval');
    expect(ack).toContain('must allow');
  });

  test('update replaces fields but keeps the binding; close settles', async () => {
    const { card } = await applyCardTool({ action: 'create', spec: ciSpec }, scope);
    const { card: updated } = await applyCardTool(
      { action: 'update', id: card.id, patch: { title: 'release #4812 (retry)' } },
      scope,
    );
    expect(updated.spec.title).toBe('release #4812 (retry)');
    expect(updated.spec.binding).toEqual(ciSpec.binding);

    await applyCardTool({ action: 'close', id: card.id }, scope);
    expect((await getCard(card.id))?.status).toBe('settled');
  });

  test("a run cannot touch another session's card", async () => {
    const { card } = await applyCardTool({ action: 'create', spec: ciSpec }, scope);
    const other = await createSession({ name: 'other' });
    await expect(
      applyCardTool({ action: 'close', id: card.id }, { ...scope, sessionId: other.id }),
    ).rejects.toThrow('No card matches');
  });
});
