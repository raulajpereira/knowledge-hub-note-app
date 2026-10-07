'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';

export type MgProjectOpt = { id: string; code: string; name: string; color: string; client: string };
export type MgOptions = { projects: MgProjectOpt[]; people: Array<{ id: string; name: string }> };

const EMPTY: MgOptions = { projects: [], people: [] };
let cache: { at: number; p: Promise<MgOptions> } | null = null;

/**
 * Management projects and people for the selects of other screens (tasks,
 * issues, transports). Fetched once and shared for 30 s between screens.
 */
export function useMgOptions(): MgOptions {
  const [o, setO] = useState<MgOptions>(EMPTY);
  useEffect(() => {
    if (!cache || Date.now() - cache.at > 30_000)
      cache = { at: Date.now(), p: api<MgOptions>('/mg/options').catch(() => EMPTY) };
    let on = true;
    void cache.p.then((v) => on && setO(v));
    return () => {
      on = false;
    };
  }, []);
  return o;
}

export const projectLabel = (p: MgProjectOpt) => `${p.code} · ${p.name}`;
