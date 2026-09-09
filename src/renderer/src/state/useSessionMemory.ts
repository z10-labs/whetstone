/**
 * Session brain state — loads a session's memory entries and keeps them fresh.
 * Kept separate from useWhetstone: the brain is its own surface. It refetches
 * whenever a `memory` RunEvent streams in (an agent wrote to the brain).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { SessionMemoryEntry } from '@shared/session-memory';

export function useSessionMemory(sessionId: string | null) {
  const [entries, setEntries] = useState<SessionMemoryEntry[]>([]);

  const sessionIdRef = useRef<string | null>(sessionId);
  useEffect(() => void (sessionIdRef.current = sessionId), [sessionId]);

  const refresh = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id) {
      setEntries([]);
      return;
    }
    const list = await api.memory.listBySession(id);
    if (sessionIdRef.current === id) setEntries(list);
  }, []);

  useEffect(() => {
    void refresh();
  }, [sessionId, refresh]);

  // A brain write streams as a `memory` event — refetch when one arrives.
  useEffect(() => {
    const off = api.onRunEvent((ev) => {
      if (ev.kind === 'memory') void refresh();
    });
    return off;
  }, [refresh]);

  return { entries, refresh };
}

export type SessionMemoryStore = ReturnType<typeof useSessionMemory>;
