'use client';

import { createContext, useContext } from 'react';
import type { ShellMe } from './types';

export type ShellApi = {
  me: ShellMe;
  modules: ReadonlySet<string>;
  focus: boolean;
  toggleFocus: () => void;
  lock: () => void;
  openAccount: () => void;
  openAbout: () => void;
  /** Header search box; pages that list items (Notes…) filter with it. */
  query: string;
  setQuery: (q: string) => void;
};

export const ShellContext = createContext<ShellApi | null>(null);

export function useShell(): ShellApi {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used inside <AppShell>');
  return ctx;
}
