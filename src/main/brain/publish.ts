/**
 * The one way the Brain leaves main. Every mutation — a click, a reminder
 * firing, an agent's `brain` tool call — ends here: reread the board, rewrite
 * the markdown mirror, and hand the whole thing to every window. One path
 * means the UI, the file and the agents can never disagree about what the
 * human is holding.
 */

import type { BrainItem } from '@shared/brain';
import { listBrain } from '../repo/brain';
import { writeBrainMirror } from './mirror';

type Broadcaster = (items: BrainItem[]) => void;

let broadcaster: Broadcaster | null = null;

/** Registered once by the IPC layer; the only Electron-aware piece. */
export function setBrainBroadcaster(fn: Broadcaster | null): void {
  broadcaster = fn;
}

export async function publishBrain(): Promise<BrainItem[]> {
  const items = await listBrain();
  await writeBrainMirror(items);
  broadcaster?.(items);
  return items;
}
