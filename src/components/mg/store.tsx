'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import {
  MG_LV,
  MG_LVC,
  MG_ROLE,
  MG_SK,
  MG_SKN,
  mgDiff,
  mgWeeks,
  wLblY,
  type MgAlloc,
  type MgData,
  type MgPerson,
} from '@/lib/mg';
import { mgTr } from '@/lib/mgText';
import { usePersistentState, useToast } from '@/components/ui';

// The Management screens keep the prototype's single data set: `upd(fn)`
// changes a copy, the difference with what the server has becomes a batch of
// puts/deletes (POST /mg/ops), sent one batch at a time.

type Store = {
  D: MgData;
  upd: (fn: (d: MgData) => void) => void;
  setAll: (d: MgData) => void;
};
const Ctx = createContext<Store | null>(null);

export function MgProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const toast = useToast();
  const [D, setD] = useState<MgData | null>(null);
  const synced = useRef<MgData | null>(null);
  const cur = useRef<MgData | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const tm = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(async () => {
    const d = await api<MgData>('/mg');
    synced.current = d;
    cur.current = d;
    setD(d);
  }, []);
  useEffect(() => {
    load().catch(() =>
      setD({ clients: [], teams: [], people: [], projects: [], allocs: [], ts: [], reqs: [], settings: {} }),
    );
  }, [load]);

  const flush = useCallback(() => {
    clearTimeout(tm.current);
    chain.current = chain.current.then(async () => {
      const a = synced.current;
      const b = cur.current;
      if (!a || !b) return;
      const ops = mgDiff(a, b);
      if (!ops.length) return;
      try {
        for (let i = 0; i < ops.length; i += 4000) await api('/mg/ops', { ops: ops.slice(i, i + 4000) });
        synced.current = b;
      } catch {
        toast({ message: t('ne_saveFail'), tone: 'error' });
        await load().catch(() => {});
      }
    });
    return chain.current;
  }, [load, t, toast]);
  useEffect(() => {
    const hide = () => void flush();
    window.addEventListener('pagehide', hide);
    return () => {
      window.removeEventListener('pagehide', hide);
      hide();
    };
  }, [flush]);

  const upd = useCallback(
    (fn: (d: MgData) => void) => {
      if (!cur.current) return;
      const d = structuredClone(cur.current);
      fn(d);
      cur.current = d;
      setD(d);
      clearTimeout(tm.current);
      tm.current = setTimeout(() => void flush(), 350);
    },
    [flush],
  );
  const setAll = useCallback((d: MgData) => {
    synced.current = d;
    cur.current = d;
    setD(d);
  }, []);

  const value = useMemo(() => (D ? { D, upd, setAll } : null), [D, upd, setAll]);
  if (!value) return <div aria-busy="true" style={{ flex: 1 }} />;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMgStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useMgStore outside MgProvider');
  return s;
}

/** Derived values and helpers of the prototype's _rv(), for every page. */
export function useMg() {
  const { D, upd, setAll } = useMgStore();
  const { lang } = useI18n();
  const router = useRouter();
  const [team, setTeam] = usePersistentState<string>('mg.team', 'all');
  const tr = useCallback((s: string) => mgTr(s, lang), [lang]);
  const m = useMemo(() => {
    const W = mgWeeks();
    const { wk, wi, dIso } = W;
    const S = D.settings;
    const LV = S.levels ?? MG_LV;
    const NL = LV.length - 1;
    const LVS = LV.map((l) => (l ? l[0]!.toUpperCase() : ''));
    const LVC = LV.map((_, i) =>
      i ? (MG_LVC[i] ?? `oklch(0.8 0.13 ${85 - (i - 4) * 25} / .8)`) : 'transparent',
    );
    const SKL: Array<[string, string]> = [...MG_SK, ...(S.xsk ?? [])].map(([k, l]) => [k, S.xskn?.[k] ?? l]);
    const SKN: Record<string, string> = Object.fromEntries(SKL);
    const ROLE: Record<string, string> = Object.fromEntries(
      Object.entries({ ...MG_ROLE, ...(S.xrole ?? {}) }).filter(([k]) => !(S.hiddenAreas ?? []).includes(k)),
    );
    const lvIdx = [...Array(NL).keys()].map((i) => i + 1);
    const ALLP = D.people;
    const TEAMS = D.teams;
    const tById = Object.fromEntries(TEAMS.map((x) => [x.id, x]));
    const gTeam = tById[team] ? team : 'all';
    const P = gTeam === 'all' ? ALLP : ALLP.filter((p) => p.team === gTeam);
    const PJ = D.projects;
    const pById: Record<string, MgPerson> = Object.fromEntries(ALLP.map((p) => [p.id, p]));
    const pjById = Object.fromEntries(PJ.map((p) => [p.id, p]));
    const cById = Object.fromEntries(D.clients.map((c) => [c.id, c]));
    const tsBy: Record<string, MgData['ts'][number]> = Object.fromEntries(
      D.ts.map((x) => [`${x.person}|${x.week}`, x]),
    );
    const inW = (a: MgAlloc, w: number) => wi(a.from) <= w && wi(a.to) >= w;
    const aDay = (a: MgAlloc, w: number, i: number) => {
      if (!inW(a, w)) return 0;
      const k = dIso(w, i);
      if (a.dov && a.dov[k] != null && a.dov[k] !== '') return +a.dov[k]!;
      const ov = a.ovr?.[wk(w)];
      const wv = ov != null && ov !== '' ? +ov : +a.hours || 0;
      return Math.round((wv / 5) * 10) / 10;
    };
    const aWeek = (a: MgAlloc, w: number) => {
      if (!inW(a, w)) return 0;
      if (a.dov && [0, 1, 2, 3, 4].some((i) => a.dov![dIso(w, i)] != null && a.dov![dIso(w, i)] !== ''))
        return Math.round([0, 1, 2, 3, 4].reduce((s, i) => s + aDay(a, w, i), 0) * 10) / 10;
      const ov = a.ovr?.[wk(w)];
      return ov != null && ov !== '' ? +ov : +a.hours || 0;
    };
    const byPerson = new Map<string, MgAlloc[]>();
    for (const a of D.allocs) byPerson.set(a.person, [...(byPerson.get(a.person) ?? []), a]);
    const loadW = (pid: string, w: number) => (byPerson.get(pid) ?? []).reduce((s, a) => s + aWeek(a, w), 0);
    const avgLoad = (pid: string, a: number, b: number) => {
      let s = 0;
      for (let w = a; w <= b; w++) s += loadW(pid, w);
      return s / (b - a + 1);
    };
    const tsHours = (pr: string) => {
      let h = 0;
      let v = 0;
      for (const e of D.ts) {
        const r = e.rows[pr];
        if (!r) continue;
        const hh = r.reduce((x, y) => x + (+y || 0), 0);
        h += hh;
        v += hh * (pById[e.person]?.rate ?? 0);
      }
      return { h, v };
    };
    const forecast = (pr: string) => {
      const p = pjById[pr];
      if (!p) return 0;
      const e = wi(p.to);
      return D.allocs
        .filter((a) => a.project === pr)
        .reduce((s, a) => {
          const f = Math.max(0, wi(a.from));
          const t = Math.min(e, wi(a.to));
          return t >= f ? s + (t - f + 1) * a.hours * (pById[a.person]?.rate ?? 0) : s;
        }, 0);
    };
    const weekOpts: Array<{ v: string; l: string }> = [];
    for (let w = -30; w <= 52; w++) weekOpts.push({ v: wk(w), l: wLblY(wk(w)) });
    // name · cargo (Inativo / Suspenso say so)
    const personOpt = P.map((p) => ({
      v: p.id,
      l: `${p.name} · ${tr(p.role)}${(p.status ?? 'Ativo') !== 'Ativo' ? ` (${tr(p.status)})` : ''}`,
    }));
    const projOpt = PJ.map((p) => ({ v: p.id, l: `${p.code} · ${p.name}` }));
    const band = (h: number, cap: number | string) => {
      const c = +cap || 40;
      const r = h / c;
      return !h ? 0 : r > 1.0001 ? 3 : r >= 0.9 ? 2 : 1;
    };
    const LC = ['rgba(255,248,240,.5)', 'oklch(0.86 0.12 85)', 'oklch(0.86 0.12 150)', 'oklch(0.82 0.14 30)'];
    const lc = (h: number, cap: number | string) => LC[band(h, cap)]!;
    const HEAT = [
      { bg: 'rgba(255,255,255,.04)', fg: 'rgba(255,248,240,.35)' },
      { bg: 'oklch(0.78 0.12 85 / .42)', fg: '#fbf8f5' },
      { bg: 'oklch(0.7 0.12 150 / .6)', fg: '#fff' },
      { bg: 'oklch(0.66 0.16 25 / .75)', fg: '#fff' },
    ];
    const heat = (h: number, cap: number | string) => HEAT[band(h, cap)]!;
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
    const inTeamProj = (pid: string) =>
      gTeam === 'all' ||
      pjById[pid]?.team === gTeam ||
      D.allocs.some((a) => a.project === pid && pById[a.person]?.team === gTeam);
    const teamOpts = [{ v: '', l: 'Todas as equipas' }, ...TEAMS.map((x) => ({ v: x.id, l: x.name }))];
    /** team colour and name of a person (prototype _decTeam) */
    const tOf = (p: MgPerson | undefined) => {
      const x = p ? tById[p.team] : undefined;
      return { tc: x ? x.color : 'transparent', tn: x ? x.name : '' };
    };
    return {
      ...W,
      LV,
      NL,
      LVS,
      LVC,
      SKL,
      SKN,
      ROLE,
      lvIdx,
      ALLP,
      TEAMS,
      tById,
      gTeam,
      P,
      PJ,
      pById,
      pjById,
      cById,
      tsBy,
      inW,
      aDay,
      aWeek,
      loadW,
      avgLoad,
      tsHours,
      forecast,
      weekOpts,
      personOpt,
      projOpt,
      band,
      lc,
      heat,
      pct,
      inTeamProj,
      teamOpts,
      tOf,
      MG_SKN,
    };
  }, [D, team, tr]);
  /** prototype nav(page, patch): the selection travels in the URL */
  const nav = useCallback(
    (page: string, q?: Record<string, string>) =>
      router.push(`/app/${page.replace(/_/g, '-')}${q ? `?${new URLSearchParams(q)}` : ''}`),
    [router],
  );
  const confirmTr = useCallback((s: string) => window.confirm(tr(s)), [tr]);
  return { D, upd, setAll, lang, tr, nav, team, setTeam, cf: confirmTr, ...m };
}
export type Mg = ReturnType<typeof useMg>;
