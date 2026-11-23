/**
 * Live Cards state — loads the session + pinned lists, keeps them fresh via
 * `onCardChanged`, and reports whether the Live panel is open so main can
 * back off polling for off-screen cards.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { applyCardChange } from './live-cards-reducer';
import type { LiveCardsView } from '@shared/cards';
import type { CardActionInput, PinResult } from '@shared/ipc';

const EMPTY: LiveCardsView = { session: [], pinned: [] };

export function useLiveCards(sessionId: string | null, panelOpen: boolean) {
  const [view, setView] = useState<LiveCardsView>(EMPTY);

  const sessionIdRef = useRef(sessionId);
  useEffect(() => void (sessionIdRef.current = sessionId), [sessionId]);

  const refresh = useCallback(async () => {
    const id = sessionIdRef.current;
    const next = await api.cards.list(id);
    if (sessionIdRef.current === id) setView(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [sessionId, refresh]);

  useEffect(() => {
    const off = api.onCardChanged((change) => {
      setView((prev) => applyCardChange(prev, change, sessionIdRef.current));
    });
    return off;
  }, []);

  // Tell main what we're looking at so unwatched cards poll slower.
  useEffect(() => {
    api.cards.setViewing({ sessionId, panelOpen });
  }, [sessionId, panelOpen]);

  const pin = useCallback(async (id: string, replaceId?: string): Promise<PinResult> => {
    return api.cards.pin(id, replaceId);
  }, []);

  const unpin = useCallback(async (id: string) => {
    await api.cards.unpin(id);
  }, []);

  const reorder = useCallback(async (ids: string[]) => {
    await api.cards.reorder(ids);
  }, []);

  const dismiss = useCallback(async (id: string) => {
    await api.cards.dismiss(id);
  }, []);

  const action = useCallback(async (input: CardActionInput) => {
    await api.cards.action(input);
  }, []);

  const approveBinding = useCallback(async (id: string) => {
    await api.cards.approveBinding(id);
  }, []);

  const startSession = useCallback(async (id: string, cwd: string) => {
    return api.cards.startSession(id, cwd);
  }, []);

  return {
    session: view.session,
    pinned: view.pinned,
    refresh,
    pin,
    unpin,
    reorder,
    dismiss,
    action,
    approveBinding,
    startSession,
  };
}

export type LiveCardsStore = ReturnType<typeof useLiveCards>;
