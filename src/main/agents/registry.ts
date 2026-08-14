/**
 * Provider registry — the lookup table new agent backends register into.
 * Adding a provider is: implement `AgentProvider`, add it here. Nothing else
 * in the app references a concrete provider.
 */

import type { ProviderId } from '@shared/models';
import type { AgentProvider } from './types';
import { claudeCodeProvider } from './claude-code';

/** Default model for launched runs. Overridable per-run later. */
export const DEFAULT_MODEL = 'claude-sonnet-5';

/** v1 drives everything read-only: plan mode performs no tool execution. */
export const DEFAULT_PERMISSION_MODE = 'plan' as const;

const providers: Record<ProviderId, AgentProvider> = {
  'claude-code': claudeCodeProvider,
};

export function getProvider(id: ProviderId): AgentProvider {
  const provider = providers[id];
  if (!provider) throw new Error(`Unknown provider: ${id}`);
  return provider;
}
