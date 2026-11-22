/**
 * A per-window UI preference (dock height, which panes are open) remembered
 * in localStorage. Storage can be missing or throw (private mode, cleared site
 * data), so every read and write falls back to the default quietly.
 */

import { useEffect, useState } from 'react';

const PREFIX = 'whetstone.pref.';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function usePreference<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  useEffect(() => {
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* a preference that can't be saved just lasts this window */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
