/**
 * Explain PR state — kept out of useWhetstone. The tool is a separate surface.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { GhPrListItem, SpecReviewDetail, SpecReviewListItem } from '@shared/explain-pr';

export function useExplainPr() {
  const [reviews, setReviews] = useState<SpecReviewListItem[]>([]);
  const [current, setCurrent] = useState<SpecReviewDetail | null>(null);
  const [cwd, setCwd] = useState<string | null>(null);
  const [pr, setPr] = useState('');
  const [openPrs, setOpenPrs] = useState<GhPrListItem[]>([]);
  const [loadingOpen, setLoadingOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentIdRef = useRef<string | null>(null);
  useEffect(() => {
    currentIdRef.current = current?.id ?? null;
  }, [current?.id]);

  const refreshList = useCallback(async () => {
    setReviews(await api.explainPr.list());
  }, []);

  const openReview = useCallback(async (id: string) => {
    const detail = await api.explainPr.get(id);
    setCurrent(detail);
    setError(detail?.error ?? null);
  }, []);

  const backToStart = useCallback(() => {
    setCurrent(null);
    setError(null);
    void refreshList();
  }, [refreshList]);

  const pickRepo = useCallback(async () => {
    const dir = await api.dialog.pickDirectory();
    if (!dir) return;
    setCwd(dir);
    setOpenPrs([]);
    setError(null);
    setLoadingOpen(true);
    try {
      setOpenPrs(await api.explainPr.listOpen(dir));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingOpen(false);
    }
  }, []);

  const start = useCallback(async () => {
    if (!cwd || !pr.trim()) return;
    setStarting(true);
    setError(null);
    try {
      const review = await api.explainPr.start({ cwd, pr: pr.trim() });
      const detail = await api.explainPr.get(review.id);
      setCurrent(
        detail ?? {
          ...review,
          goals: [],
          files: [],
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }, [cwd, pr]);

  const startFromOpen = useCallback(
    async (number: number) => {
      if (!cwd) return;
      setPr(String(number));
      setStarting(true);
      setError(null);
      try {
        const review = await api.explainPr.start({ cwd, pr: String(number) });
        const detail = await api.explainPr.get(review.id);
        setCurrent(detail ?? { ...review, goals: [], files: [] });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setStarting(false);
      }
    },
    [cwd],
  );

  const setReviewed = useCallback(async (path: string, reviewed: boolean) => {
    const id = currentIdRef.current;
    if (!id) return;
    setCurrent((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        files: prev.files.map((f) => (f.path === path ? { ...f, reviewed } : f)),
      };
    });
    try {
      const detail = await api.explainPr.setReviewed({ reviewId: id, path, reviewed });
      if (currentIdRef.current === id) setCurrent(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const cancel = useCallback(async () => {
    const id = currentIdRef.current;
    if (!id) return;
    await api.explainPr.cancel(id);
  }, []);

  useEffect(() => {
    const off = api.onExplainPrUpdated((detail) => {
      if (detail.id === currentIdRef.current) {
        setCurrent(detail);
        setError(detail.error);
      }
      void refreshList();
    });
    return off;
  }, [refreshList]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  return {
    reviews,
    current,
    cwd,
    pr,
    setPr,
    openPrs,
    loadingOpen,
    starting,
    error,
    pickRepo,
    start,
    startFromOpen,
    openReview,
    backToStart,
    setReviewed,
    cancel,
  };
}

export type ExplainPrStore = ReturnType<typeof useExplainPr>;
