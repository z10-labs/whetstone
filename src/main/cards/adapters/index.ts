/**
 * Every binding kind's adapter, in one place for the poller.
 */

import type { BindingKind } from '@shared/cards';
import type { Adapter } from './types';
import { ghRunAdapter } from './gh-run';
import { ghPrAdapter } from './gh-pr';
import { fileAdapter } from './file';
import { commandAdapter } from './command';

export const adapters: { [K in BindingKind]: Adapter<K> } = {
  'gh-run': ghRunAdapter,
  'gh-pr': ghPrAdapter,
  file: fileAdapter,
  command: commandAdapter,
};
