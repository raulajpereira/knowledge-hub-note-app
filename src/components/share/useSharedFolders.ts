'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { useShell } from '@/components/shell/ShellContext';

export type ShareKind = 'notes' | 'tasks' | 'artifacts';
export type Member = {
  id: string;
  email: string;
  name: string;
  perm: 'read' | 'edit';
  status: 'invited' | 'active';
  paused: boolean;
  personPaused: boolean;
};
export type SharedFolder = {
  id: string;
  kind: ShareKind;
  name: string;
  folderId: string | null;
  paused: boolean;
  mine: boolean;
  members: Member[];
  owner: { name: string; email: string } | null;
  perm: 'read' | 'edit';
};

/** Fired after any change to shared folders, so every list on the page reloads (prototype `kv-share`). */
export const SHARE_EVENT = 'kh-share';
export const shareChanged = () => window.dispatchEvent(new Event(SHARE_EVENT));

/**
 * The shared folders of a kind (owned and incoming). Empty without the
 * module of that kind; the owner's own ones need the `share` module to be managed.
 */
export function useSharedFolders(kind?: ShareKind) {
  const { modules } = useShell();
  const [folders, setFolders] = useState<SharedFolder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(() => {
    api<{ folders: SharedFolder[] }>(`/share/folders${kind ? `?kind=${kind}` : ''}`)
      .then((r) => setFolders(r.folders))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [kind]);
  useEffect(() => {
    load();
    window.addEventListener(SHARE_EVENT, load);
    return () => window.removeEventListener(SHARE_EVENT, load);
  }, [load]);
  return { folders, loaded, reload: load, canShare: modules.has('share') };
}

/** "Este item vai ser criado/movido em "X" e partilhado com N pessoas. Deseja avançar?" */
export function sharedConfirm(t: (k: string) => string, f: SharedFolder, move: boolean) {
  const n = f.members.length;
  const who = f.mine ? String(n) + t(n === 1 ? 'sh_person1' : 'sh_personN') : (f.owner?.name ?? '');
  return {
    title: t(move ? 'sh_askMoveT' : 'sh_askNewT'),
    body: t(move ? 'sh_askMove' : 'sh_askNew')
      .replace('{name}', f.name)
      .replace('{n}', who),
    confirmLabel: t(move ? 'sh_move' : 'sh_fpCreate'),
    cancelLabel: t('sh_cancel'),
  };
}

export const shIni = (n: string) =>
  (n || '?')
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();
export const shAv = (s: string) => {
  let h = 0;
  for (const c of s || '') h = (h * 31 + c.charCodeAt(0)) % 360;
  return `oklch(0.58 0.1 ${h})`;
};
