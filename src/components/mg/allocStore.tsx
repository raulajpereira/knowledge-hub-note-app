'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, isApiFailure } from '@/lib/client/api';
import { useI18n } from '@/i18n/client';
import { mgTr } from '@/lib/mgText';
import { useToast } from '@/components/ui';
import { dnOf, isoOf, monthStart, todayIso, type AlOpT, type Absence, type Booking, type Dn } from '@/lib/alloc';

// Alocações v2 on the client: the bookings and absences of the loaded date
// range (6 months back, 12 ahead to start with; the screens widen it with
// `ensure`). Changes apply at once on screen and go to the server in
// batches, each record with the version it was made on; a conflict (someone
// else changed it) reloads the range. Every change can be undone (Ctrl+Z).

export type AlChange = {
  bk?: Booking[];
  delBk?: string[];
  ab?: Absence[];
  delAb?: string[];
};
type Snap = { bk: Map<string, Booking | null>; ab: Map<string, Absence | null> };
export type AlStore = {
  bookings: Booking[];
  absences: Absence[];
  /** the loaded range (day numbers) */
  lo: Dn;
  hi: Dn;
  /** loads the bookings of [from, to] if not loaded yet */
  ensure: (from: Dn, to: Dn) => void;
  /** applies a change (undoable unless `noUndo`) and queues it for the server */
  change: (c: AlChange, opts?: { noUndo?: boolean }) => void;
  undo: () => boolean;
  redo: () => boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** drops bookings / absences of people or projects removed elsewhere (the server cascades) */
  forget: (pred: { person?: string; project?: string }) => void;
  pending: boolean;
};
const Ctx = createContext<AlStore | null>(null);

type Range = { from: string; to: string; bookings: Booking[]; absences: Absence[] };

export function AlProvider({ children }: { children: React.ReactNode }) {
  const { lang } = useI18n();
  const toast = useToast();
  const [bk, setBk] = useState<Map<string, Booking>>(new Map());
  const [ab, setAb] = useState<Map<string, Absence>>(new Map());
  const [win, setWin] = useState<[Dn, Dn] | null>(null);
  const [hist, setHist] = useState<{ u: number; r: number }>({ u: 0, r: 0 });
  const [pending, setPending] = useState(false);
  const cur = useRef({ bk, ab });
  cur.current = { bk, ab };
  const winRef = useRef<[Dn, Dn] | null>(null);
  // versions the server has, and what still has to be sent
  const sv = useRef(new Map<string, string>());
  const dirtyBk = useRef(new Set<string>());
  const dirtyAb = useRef(new Set<string>());
  const undoS = useRef<Array<{ before: Snap; after: Snap }>>([]);
  const redoS = useRef<Array<{ before: Snap; after: Snap }>>([]);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const tm = useRef<ReturnType<typeof setTimeout>>(undefined);
  const loading = useRef(new Set<string>());

  const merge = useCallback((r: Range, replace = false) => {
    for (const x of [...r.bookings, ...r.absences]) sv.current.set(x.id, x.ver);
    setBk((m) => {
      const n = replace ? new Map<string, Booking>() : new Map(m);
      for (const b of r.bookings) if (replace || !dirtyBk.current.has(b.id)) n.set(b.id, b);
      return n;
    });
    setAb((m) => {
      const n = replace ? new Map<string, Absence>() : new Map(m);
      for (const a of r.absences) if (replace || !dirtyAb.current.has(a.id)) n.set(a.id, a);
      return n;
    });
  }, []);

  const fetchRange = useCallback(async (f: Dn, t: Dn) => {
    const key = `${f}|${t}`;
    if (loading.current.has(key)) return null;
    loading.current.add(key);
    try {
      return await api<Range>(`/mg/alloc?from=${isoOf(f)}&to=${isoOf(t)}`);
    } finally {
      loading.current.delete(key);
    }
  }, []);

  const reload = useCallback(async () => {
    const w = winRef.current;
    if (!w) return;
    const r = await fetchRange(w[0], w[1]);
    if (!r) return;
    dirtyBk.current.clear();
    dirtyAb.current.clear();
    sv.current.clear();
    undoS.current = [];
    redoS.current = [];
    setHist({ u: 0, r: 0 });
    merge(r, true);
  }, [fetchRange, merge]);

  useEffect(() => {
    const t = dnOf(todayIso());
    const f = monthStart(t, -6) - 7;
    const to = monthStart(t, 13);
    fetchRange(f, to)
      .then((r) => {
        winRef.current = [f, to];
        setWin([f, to]);
        if (r) merge(r, true);
      })
      .catch(() => {
        winRef.current = [f, to];
        setWin([f, to]);
      });
  }, [fetchRange, merge]);

  const ensure = useCallback(
    (from: Dn, to: Dn) => {
      const w = winRef.current;
      if (!w) return;
      // whole months, a little beyond, so small moves don't refetch
      const parts: Array<[Dn, Dn]> = [];
      if (from < w[0]) parts.push([monthStart(from, -1), w[0] - 1]);
      if (to > w[1]) parts.push([w[1] + 1, monthStart(to, 2) - 1]);
      if (!parts.length) return;
      const nw: [Dn, Dn] = [Math.min(w[0], parts[0]![0]), Math.max(w[1], parts.at(-1)![1])];
      winRef.current = nw;
      for (const [a, b] of parts)
        fetchRange(a, b)
          .then((r) => r && merge(r))
          .catch(() => {});
      setWin(nw);
    },
    [fetchRange, merge],
  );

  const flush = useCallback(() => {
    clearTimeout(tm.current);
    chain.current = chain.current.then(async () => {
      const ops: AlOpT[] = [];
      const sentBk = [...dirtyBk.current];
      const sentAb = [...dirtyAb.current];
      dirtyBk.current.clear();
      dirtyAb.current.clear();
      const { bk: B, ab: A } = cur.current;
      for (const id of sentAb) {
        const x = A.get(id);
        const base = sv.current.get(id) ?? '';
        if (x) ops.push({ op: 'put', c: 'ab', v: { ...x, ver: '' }, base });
        else if (base) ops.push({ op: 'del', c: 'ab', id, base });
      }
      for (const id of sentBk) {
        const x = B.get(id);
        const base = sv.current.get(id) ?? '';
        if (x) ops.push({ op: 'put', c: 'bk', v: { ...x, ver: '' }, base });
        else if (base) ops.push({ op: 'del', c: 'bk', id, base });
      }
      // deletes of absences / bookings last-but-safe: puts of absences first, then bookings
      if (!ops.length) return;
      setPending(true);
      try {
        for (let i = 0; i < ops.length; i += 1500) {
          const { vers } = await api<{ vers: Record<string, string> }>('/mg/alloc/ops', {
            ops: ops.slice(i, i + 1500),
          });
          for (const o of ops.slice(i, i + 1500)) {
            if (o.op === 'del') sv.current.delete(o.id);
          }
          for (const [id, v] of Object.entries(vers)) sv.current.set(id, v);
        }
      } catch (e) {
        const conflict = isApiFailure(e) && e.status === 409;
        toast({
          message: mgTr(
            conflict
              ? 'Outra pessoa alterou estas alocações entretanto — recarregado.'
              : 'Não foi possível guardar as alocações — recarregado.',
            lang,
          ),
          tone: 'error',
        });
        await reload().catch(() => {});
      } finally {
        setPending(false);
      }
    });
    return chain.current;
  }, [lang, reload, toast]);
  useEffect(() => {
    const hide = () => void flush();
    window.addEventListener('pagehide', hide);
    return () => {
      window.removeEventListener('pagehide', hide);
      hide();
    };
  }, [flush]);

  /** Applies a snapshot of records (null = removed). */
  const applySnap = useCallback(
    (s: Snap) => {
      setBk((m) => {
        const n = new Map(m);
        for (const [id, v] of s.bk) {
          if (v) n.set(id, v);
          else n.delete(id);
          dirtyBk.current.add(id);
        }
        return n;
      });
      setAb((m) => {
        const n = new Map(m);
        for (const [id, v] of s.ab) {
          if (v) n.set(id, v);
          else n.delete(id);
          dirtyAb.current.add(id);
        }
        return n;
      });
      clearTimeout(tm.current);
      tm.current = setTimeout(() => void flush(), 400);
    },
    [flush],
  );

  const change = useCallback(
    (c: AlChange, opts?: { noUndo?: boolean }) => {
      const { bk: B, ab: A } = cur.current;
      const before: Snap = { bk: new Map(), ab: new Map() };
      const after: Snap = { bk: new Map(), ab: new Map() };
      for (const b of c.bk ?? []) {
        if (!before.bk.has(b.id)) before.bk.set(b.id, B.get(b.id) ?? null);
        after.bk.set(b.id, b);
      }
      for (const id of c.delBk ?? []) {
        if (!before.bk.has(id)) before.bk.set(id, B.get(id) ?? null);
        after.bk.set(id, null);
      }
      for (const a of c.ab ?? []) {
        if (!before.ab.has(a.id)) before.ab.set(a.id, A.get(a.id) ?? null);
        after.ab.set(a.id, a);
      }
      for (const id of c.delAb ?? []) {
        if (!before.ab.has(id)) before.ab.set(id, A.get(id) ?? null);
        after.ab.set(id, null);
      }
      if (!opts?.noUndo) {
        undoS.current.push({ before, after });
        if (undoS.current.length > 100) undoS.current.shift();
        redoS.current = [];
        setHist({ u: undoS.current.length, r: 0 });
      }
      applySnap(after);
    },
    [applySnap],
  );
  const undo = useCallback(() => {
    const h = undoS.current.pop();
    if (!h) return false;
    redoS.current.push(h);
    setHist({ u: undoS.current.length, r: redoS.current.length });
    applySnap(h.before);
    return true;
  }, [applySnap]);
  const redo = useCallback(() => {
    const h = redoS.current.pop();
    if (!h) return false;
    undoS.current.push(h);
    setHist({ u: undoS.current.length, r: redoS.current.length });
    applySnap(h.after);
    return true;
  }, [applySnap]);
  const forget = useCallback((p: { person?: string; project?: string }) => {
    const hit = (b: { person: string; project?: string }) =>
      (p.person && b.person === p.person) || (p.project && b.project === p.project);
    setBk((m) => new Map([...m].filter(([, b]) => !hit(b))));
    setAb((m) => new Map([...m].filter(([, a]) => !(p.person && a.person === p.person))));
  }, []);

  const bookings = useMemo(() => [...bk.values()], [bk]);
  const absences = useMemo(() => [...ab.values()], [ab]);
  const value = useMemo<AlStore | null>(
    () =>
      win
        ? {
            bookings,
            absences,
            lo: win[0],
            hi: win[1],
            ensure,
            change,
            undo,
            redo,
            canUndo: hist.u > 0,
            canRedo: hist.r > 0,
            forget,
            pending,
          }
        : null,
    [bookings, absences, win, ensure, change, undo, redo, hist, forget, pending],
  );
  if (!value) return <div aria-busy="true" style={{ flex: 1 }} />;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAl() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useAl outside AlProvider');
  return s;
}
