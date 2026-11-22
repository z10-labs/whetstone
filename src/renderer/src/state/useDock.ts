/**
 * The terminal dock: every shell/command tab main knows about, which one is
 * in front per Session, and how many times each has been restarted (a restart
 * remounts its xterm so it attaches to the fresh PTY).
 */

import { useCallback, useEffect, useState } from 'react';
import type { CreateDockTerminalInput, DockTerminal } from '@shared/terminals';
import { api } from '../lib/api';

const LOOSE = '_loose';
const sessionKey = (sessionId: string | null) => sessionId ?? LOOSE;

export function useDock(sessionId: string | null) {
  const [terminals, setTerminals] = useState<DockTerminal[]>([]);
  const [activeBySession, setActiveBySession] = useState<Record<string, string>>({});
  const [generations, setGenerations] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.dock.list().then(setTerminals);
    return api.onDockChanged(setTerminals);
  }, []);

  const inSession = terminals.filter((t) => t.sessionId === sessionId);
  const wantedId = activeBySession[sessionKey(sessionId)];
  const active = inSession.find((t) => t.id === wantedId) ?? inSession.at(-1) ?? null;

  const focus = useCallback((terminal: DockTerminal) => {
    setActiveBySession((prev) => ({ ...prev, [sessionKey(terminal.sessionId)]: terminal.id }));
  }, []);

  const create = useCallback(
    async (input: CreateDockTerminalInput) => {
      try {
        const terminal = await api.dock.create(input);
        setError(null);
        focus(terminal);
        return terminal;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not open the terminal.');
        return null;
      }
    },
    [focus],
  );

  const restart = useCallback(async (id: string) => {
    await api.dock.restart(id);
    setGenerations((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  }, []);

  const close = useCallback(async (id: string) => {
    await api.dock.close(id);
  }, []);

  return {
    /** Every tab, so hidden Sessions keep their xterms (and scrollback) alive. */
    terminals,
    inSession,
    active,
    generations,
    error,
    focus,
    create,
    restart,
    close,
  };
}

export type DockStore = ReturnType<typeof useDock>;
