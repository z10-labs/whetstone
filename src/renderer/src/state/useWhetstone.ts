/**
 * Container hook: owns all renderer state (sessions, the selected session's
 * runs, the selected run's transcript) and the live IPC subscriptions. UI
 * components stay presentational and read from what this returns.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { RunEvent, RunMode, Session, SessionWithRuns } from '@shared/models';

export function useWhetstone() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [detail, setDetail] = useState<SessionWithRuns | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);

  const selectedSessionId = detail?.id ?? null;

  // Refs let the long-lived IPC listeners read the current selection.
  const sessionIdRef = useRef<string | null>(null);
  const runIdRef = useRef<string | null>(null);
  useEffect(() => void (sessionIdRef.current = selectedSessionId), [selectedSessionId]);
  useEffect(() => void (runIdRef.current = selectedRunId), [selectedRunId]);

  const refreshSessions = useCallback(async () => {
    setSessions(await api.sessions.list());
  }, []);

  const loadSession = useCallback(async (id: string): Promise<SessionWithRuns | null> => {
    const d = await api.sessions.get(id);
    setDetail(d);
    return d;
  }, []);

  const selectSession = useCallback(
    async (id: string) => {
      const d = await loadSession(id);
      const latest = d?.runs.at(-1) ?? null;
      setSelectedRunId(latest?.id ?? null);
      setEvents(latest ? await api.runs.listEvents(latest.id) : []);
    },
    [loadSession],
  );

  const selectRun = useCallback(async (id: string) => {
    setSelectedRunId(id);
    setEvents(await api.runs.listEvents(id));
  }, []);

  const createSession = useCallback(
    async (name: string, color?: string) => {
      const s = await api.sessions.create({ name, color });
      await refreshSessions();
      await selectSession(s.id);
    },
    [refreshSessions, selectSession],
  );

  const createRun = useCallback(
    async (mode: RunMode) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      const cwd = await api.dialog.pickDirectory();
      if (!cwd) return;
      const run = await api.runs.create({ sessionId, cwd, mode });
      await loadSession(sessionId);
      setSelectedRunId(run.id);
      setEvents([]);
    },
    [loadSession],
  );

  const startAgent = useCallback(async (prompt: string) => {
    const runId = runIdRef.current;
    if (!runId || !prompt.trim()) return;
    await api.agent.start({ runId, prompt });
  }, []);

  const cancelAgent = useCallback(async () => {
    const runId = runIdRef.current;
    if (runId) await api.agent.cancel(runId);
  }, []);

  const answerQuestion = useCallback(async (questionId: string, answer: string) => {
    await api.agent.answer({ questionId, answer });
  }, []);

  const moveRun = useCallback(
    async (runId: string, toSessionId: string) => {
      await api.runs.move(runId, toSessionId);
      await refreshSessions();
      if (sessionIdRef.current) await loadSession(sessionIdRef.current);
    },
    [refreshSessions, loadSession],
  );

  // Live streaming from main.
  useEffect(() => {
    const offEvent = api.onRunEvent((ev) => {
      if (ev.runId === runIdRef.current) setEvents((prev) => [...prev, ev]);
    });
    const offUpdated = api.onRunUpdated((run) => {
      setDetail((prev) => {
        if (!prev) return prev;
        if (run.sessionId !== prev.id) {
          return { ...prev, runs: prev.runs.filter((r) => r.id !== run.id) };
        }
        const exists = prev.runs.some((r) => r.id === run.id);
        const runs = exists
          ? prev.runs.map((r) => (r.id === run.id ? run : r))
          : [...prev.runs, run];
        return { ...prev, runs };
      });
      void refreshSessions();
    });
    return () => {
      offEvent();
      offUpdated();
    };
  }, [refreshSessions]);

  useEffect(() => void refreshSessions(), [refreshSessions]);

  const selectedRun = detail?.runs.find((r) => r.id === selectedRunId) ?? null;

  return {
    sessions,
    detail,
    selectedSessionId,
    selectedRunId,
    selectedRun,
    events,
    selectSession,
    selectRun,
    createSession,
    createRun,
    startAgent,
    cancelAgent,
    answerQuestion,
    moveRun,
  };
}

export type WhetstoneStore = ReturnType<typeof useWhetstone>;
