/**
 * Hippomem's decisions for the repo a run works in. Reloads when the folder
 * changes; a search replaces the listing until it is cleared.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { HippomemView } from '@shared/hippomem';
import { api } from '../lib/api';

export function useHippomem(cwd: string | null, enabled: boolean) {
  const [view, setView] = useState<HippomemView | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  // Drop answers for a folder the user has already left.
  const latest = useRef(0);

  const load = useCallback(
    async (text: string) => {
      if (!cwd) return;
      const ticket = ++latest.current;
      setLoading(true);
      try {
        const next = text.trim()
          ? await api.hippomem.query({ cwd, text })
          : await api.hippomem.decisions(cwd);
        if (ticket === latest.current) setView(next);
      } catch (err) {
        if (ticket === latest.current) {
          setView({
            state: 'error',
            url: '',
            repo: null,
            hooksInstalled: false,
            text: null,
            message: err instanceof Error ? err.message : 'Hippomem could not be read.',
          });
        }
      } finally {
        if (ticket === latest.current) setLoading(false);
      }
    },
    [cwd],
  );

  useEffect(() => {
    setQuery('');
    setView(null);
    if (enabled) void load('');
  }, [cwd, enabled, load]);

  return {
    view,
    loading,
    query,
    setQuery,
    search: () => load(query),
    refresh: () => load(query),
    clear: () => {
      setQuery('');
      void load('');
    },
  };
}
