'use client';

import { useEffect, useRef, useState } from 'react';

/** Small hook: value edited locally, saved after a pause (title, notes, subtask text). */
export function useDraft(value: string, save: (v: string) => void, delay = 500) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(save);
  latest.current = save;
  // Server echoes don't overwrite what is still being typed.
  useEffect(() => {
    if (!timer.current) setDraft(value);
  }, [value]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const change = (v: string) => {
    setDraft(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      latest.current(v);
    }, delay);
  };
  const flush = () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    latest.current(draft);
  };
  return [draft, change, flush] as const;
}
