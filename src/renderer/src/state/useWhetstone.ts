/**
 * Container hook: owns all renderer state (the session tree, the current
 * selection, the selected run's transcript) and the live IPC subscriptions.
 * The tree is the single source of truth — the selected session and run are
 * derived from it, never copied, so live updates can never drift.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { AgentRun, RunEvent, RunMode, SessionWithRuns } from '@shared/models';

export function useWhetstone() {
  const [sessions, setSessions] = useState<SessionWithRuns[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);

  // Refs let the long-lived IPC listeners read the current selection.
  const runIdRef = useRef<string | null>(null);
  useEffect(() => void (runIdRef.current = selectedRunId), [selectedRunId]);

  const refreshSessions = useCallback(async () => {
    const tree = await api.sessions.list();
    setSessions(tree);
    return tree;
  }, []);

  const selectRun = useCallback(async (run: AgentRun) => {
    setSelectedSessionId(run.sessionId);
    setSelectedRunId(run.id);
    setEvents(await api.runs.listEvents(run.id));
  }, []);

  /** Selecting a session opens its most recent run, if it has one. */
  const selectSession = useCallback(
    async (id: string) => {
      setSelectedSessionId(id);
      const latest = sessions.find((s) => s.id === id)?.runs.at(-1) ?? null;
      setSelectedRunId(latest?.id ?? null);
      setEvents(latest ? await api.runs.listEvents(latest.id) : []);
    },
    [sessions],
  );

  const createSession = useCallback(
    async (name: string) => {
      const s = await api.sessions.create({ name });
      await refreshSessions();
      setSelectedSessionId(s.id);
      setSelectedRunId(null);
      setEvents([]);
    },
    [refreshSessions],
  );

  const createRun = useCallback(
    async (sessionId: string, mode: RunMode) => {
      const cwd = await api.dialog.pickDirectory();
      if (!cwd) return;
      const run = await api.runs.create({ sessionId, cwd, mode });
      await refreshSessions();
      setSelectedSessionId(sessionId);
      setSelectedRunId(run.id);
      setEvents([]);
    },
    [refreshSessions],
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
    },
    [refreshSessions],
  );

  // Live streaming from main.
  useEffect(() => {
    const offEvent = api.onRunEvent((ev) => {
      if (ev.runId === runIdRef.current) setEvents((prev) => [...prev, ev]);
    });
    const offUpdated = api.onRunUpdated((run) => {
      setSessions((prev) =>
        prev.map((session) => {
          // A moved run leaves its old group and joins the new one.
          const without = session.runs.filter((r) => r.id !== run.id);
          if (session.id !== run.sessionId) {
            return without.length === session.runs.length ? session : { ...session, runs: without };
          }
          const existed = without.length !== session.runs.length;
          return {
            ...session,
            runs: existed ? session.runs.map((r) => (r.id === run.id ? run : r)) : [...without, run],
          };
        }),
      );
    });
    return () => {
      offEvent();
      offUpdated();
    };
  }, []);

  useEffect(() => void refreshSessions(), [refreshSessions]);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  );
  const selectedRun = selectedSession?.runs.find((r) => r.id === selectedRunId) ?? null;

  return {
    sessions,
    selectedSession,
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
