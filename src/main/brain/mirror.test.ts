import { describe, expect, test } from 'vitest';
import type { BrainItem } from '@shared/brain';
import { renderBrainMarkdown } from './mirror';

const NOW = new Date(2026, 8, 12, 10, 0).getTime();

function item(over: Partial<BrainItem>): BrainItem {
  return {
    id: '8f2a1c3d-0000-4000-8000-000000000000',
    kind: 'task',
    title: 'untitled',
    body: '',
    status: 'open',
    pinned: false,
    dueAt: null,
    firedAt: null,
    doneAt: null,
    sessionId: null,
    createdBy: 'human',
    sessionName: null,
    createdAt: NOW - 60_000,
    updatedAt: NOW - 60_000,
    ...over,
  };
}

describe('renderBrainMarkdown', () => {
  test('an empty brain still tells the reader what the file is', () => {
    const md = renderBrainMarkdown([], NOW);
    expect(md).toContain('# Brain');
    expect(md).toContain('Written by whetstone');
    expect(md).toContain('_The brain is empty._');
  });

  test('markers read as kind and state down the left edge', () => {
    const md = renderBrainMarkdown(
      [
        item({ id: 'a1', kind: 'task', title: 'outstanding one' }),
        item({ id: 'b2', kind: 'task', title: 'in hand one', status: 'doing' }),
        item({ id: 'c3', kind: 'task', title: 'done one', status: 'done' }),
        item({ id: 'd4', kind: 'jot', title: 'a jot' }),
        item({ id: 'e5', kind: 'reminder', title: 'a reminder', dueAt: NOW + 3_600_000 }),
      ],
      NOW,
    );
    expect(md).toContain('- [ ] outstanding one');
    expect(md).toContain('- [~] in hand one');
    expect(md).toContain('- [x] done one');
    expect(md).toContain('- [.] a jot');
    expect(md).toContain('- [@] a reminder (due 2026-09-12 11:00)');
  });

  test('each line carries a short id an agent can quote back', () => {
    const md = renderBrainMarkdown([item({ title: 'x' })], NOW);
    expect(md).toContain('`id:8f2a1c`');
  });

  test('a due, unclaimed entry rises to Due now and leaves its home section', () => {
    const md = renderBrainMarkdown(
      [item({ kind: 'reminder', title: 'fire me', dueAt: NOW - 1000 })],
      NOW,
    );
    const dueIdx = md.indexOf('## Due now');
    expect(dueIdx).toBeGreaterThan(-1);
    expect(md.indexOf('fire me')).toBeGreaterThan(dueIdx);
    expect(md).not.toContain('## Watching');
  });

  test('a started task that is overdue stays In hand rather than shouting', () => {
    const md = renderBrainMarkdown(
      [item({ kind: 'task', title: 'late but held', status: 'doing', dueAt: NOW - 1000 })],
      NOW,
    );
    expect(md).not.toContain('## Due now');
    expect(md).toContain('## In hand\n\n- [~] late but held');
  });

  test('the lanes an agent always needs are present even when empty', () => {
    const md = renderBrainMarkdown([item({ kind: 'jot', title: 'only a jot' })], NOW);
    expect(md).toContain('## In hand\n\n_nothing in progress_');
    expect(md).toContain('## Outstanding\n\n_nothing outstanding_');
  });
});

describe('renderBrainMarkdown — missions', () => {
  test('missions lead the file with the session name, the goal and its body', () => {
    const md = renderBrainMarkdown(
      [
        item({
          id: 'm1',
          kind: 'mission',
          title: 'Green CI by Friday',
          body: 'retry loop, not the tests',
          sessionId: 's1',
          sessionName: 'Fix the CI flake',
        }),
        item({ id: 't1', kind: 'task', title: 'bisect the flake', sessionId: 's1', sessionName: 'Fix the CI flake' }),
      ],
      NOW,
    );
    const missions = md.indexOf('## Missions');
    expect(missions).toBeGreaterThan(-1);
    expect(missions).toBeLessThan(md.indexOf('## In hand'));
    expect(md).toContain('### Fix the CI flake — Green CI by Friday');
    expect(md).toContain('retry loop, not the tests');
    expect(md).toContain('`id:m1`');
  });

  test('a linked entry names its session on its own line', () => {
    const md = renderBrainMarkdown(
      [item({ kind: 'task', title: 'bisect the flake', sessionId: 's1', sessionName: 'Fix the CI flake' })],
      NOW,
    );
    expect(md).toContain('- [ ] bisect the flake · Fix the CI flake `id:8f2a1c`');
  });

  test('a mission still named after its Session says the name once', () => {
    const md = renderBrainMarkdown(
      [item({ id: 'm2', kind: 'mission', title: 'Ship v2', sessionId: 's2', sessionName: 'Ship v2' })],
      NOW,
    );
    expect(md).toContain('### Ship v2 `id:m2`');
    expect(md).not.toContain('Ship v2 — Ship v2');
  });

  test('a closed mission does not lead the file', () => {
    const md = renderBrainMarkdown(
      [item({ kind: 'mission', title: 'old goal', status: 'done', sessionName: 'Old' })],
      NOW,
    );
    expect(md).not.toContain('## Missions');
    expect(md).toContain('- [x] old goal · Old');
  });
});
