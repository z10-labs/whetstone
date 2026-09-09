/**
 * The clock behind the Brain. Every tick it asks the repository which entries
 * have come due, stamps them so they fire exactly once, and pushes them out —
 * to the OS as a notification and to the renderer as a change broadcast.
 *
 * Time is the only trigger in v1. Event-driven triggers (a CI comment landing,
 * a run finishing) ride the same seam later: they claim entries and call the
 * same emit.
 */

import { Notification, BrowserWindow } from 'electron';
import { REMINDER_TICK_MS, type BrainItem } from '@shared/brain';
import { claimDueBrainItems } from '../repo/brain';

export interface ReminderEmitter {
  /** Something changed — the renderer should take a fresh list. */
  onChanged: () => void;
}

let timer: NodeJS.Timeout | null = null;

function notify(item: BrainItem): void {
  if (!Notification.isSupported()) return;
  const notification = new Notification({
    title: item.kind === 'reminder' ? 'Reminder' : 'Task due',
    body: item.body ? `${item.title} — ${item.body}` : item.title,
  });
  notification.on('click', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
  notification.show();
}

async function tick(emitter: ReminderEmitter): Promise<void> {
  const due = await claimDueBrainItems();
  if (due.length === 0) return;
  for (const item of due) notify(item);
  emitter.onChanged();
}

/** Start the ticker. Fires once immediately so a boot never misses a due entry. */
export function startReminderTicker(emitter: ReminderEmitter): void {
  if (timer) return;
  const run = () => {
    void tick(emitter).catch((err) => {
      console.error('[whetstone] reminder tick failed:', err);
    });
  };
  run();
  timer = setInterval(run, REMINDER_TICK_MS);
}

export function stopReminderTicker(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
