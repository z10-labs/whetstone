/**
 * Brain state. Main owns the truth: every mutation there republishes the whole
 * board over `onBrainChanged`, so this hook never merges — it replaces. That
 * keeps the renderer honest when a reminder fires on main's clock rather than
 * from a click here.
 *
 * The local `now` tick exists only so relative labels ("in 25m") stay true and
 * an entry crosses into Due without a refresh.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import {
  byPinnedThen,
  isUnclaimed,
  nextTaskStatus,
  REMINDER_TICK_MS,
  type BrainItem,
  type BrainKind,
  type BrainStatus,
  type CaptureBrainInput,
  type UpdateBrainInput,
} from '@shared/brain';

export function useBrain() {
  const [items, setItems] = useState<BrainItem[]>([]);
  const [mirrorPath, setMirrorPath] = useState<string>('');
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    setItems(await api.brain.list());
  }, []);

  useEffect(() => {
    void refresh();
    void api.brain.mirrorPath().then(setMirrorPath);
  }, [refresh]);

  useEffect(() => api.onBrainChanged(setItems), []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), REMINDER_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const capture = useCallback(async (input: CaptureBrainInput) => {
    await api.brain.capture(input);
  }, []);

  const update = useCallback(async (input: UpdateBrainInput) => {
    await api.brain.update(input);
  }, []);

  const remove = useCallback(async (id: string) => {
    await api.brain.remove(id);
  }, []);

  const clearFinished = useCallback(async () => {
    await api.brain.clearFinished();
  }, []);

  /** Advance a task around its ring; anything else just finishes or reopens. */
  const advance = useCallback(
    async (item: BrainItem) => {
      const status: BrainStatus =
        item.kind === 'task'
          ? nextTaskStatus(item.status)
          : item.status === 'done'
            ? 'open'
            : 'done';
      await update({ id: item.id, status });
    },
    [update],
  );

  const lanes = useMemo(() => split(items, now), [items, now]);

  return {
    items,
    mirrorPath,
    now,
    ...lanes,
    refresh,
    capture,
    update,
    remove,
    clearFinished,
    advance,
  };
}

/** The board's shape: one pass over the list, sorted the way each lane reads. */
function split(items: BrainItem[], now: number) {
  const live = items.filter((i) => i.status === 'open' || i.status === 'doing');
  const due = live
    .filter((i) => isUnclaimed(i, now))
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
  const dueIds = new Set(due.map((i) => i.id));
  const waiting = live.filter((i) => !dueIds.has(i.id));

  const ofKind = (kind: BrainKind, status?: BrainStatus) =>
    waiting.filter((i) => i.kind === kind && (status ? i.status === status : true));

  const newestFirst = byPinnedThen((i) => i.createdAt, 'desc');

  return {
    due,
    /** Tasks being worked right now. */
    doing: ofKind('task', 'doing').sort(newestFirst),
    /** Tasks not started. */
    outstanding: ofKind('task', 'open').sort(newestFirst),
    /** Armed reminders, next to fire first. */
    watching: ofKind('reminder').sort(byPinnedThen((i) => i.dueAt ?? Infinity)),
    jots: ofKind('jot').sort(newestFirst),
    done: items
      .filter((i) => i.status === 'done' || i.status === 'dropped')
      .sort((a, b) => (b.doneAt ?? b.updatedAt) - (a.doneAt ?? a.updatedAt)),
  };
}

export type BrainStore = ReturnType<typeof useBrain>;
