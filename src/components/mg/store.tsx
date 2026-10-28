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
  type MgData,
  type MgPerson,
} from '@/lib/mg';
import {
  bookingSeries,
  bookingSum,
  dnOf,
  loadBand,
  personLoads,
  sumDays,
  todayIso,
  weeklyOf,
  type Absence,
  type Booking,
  type CalcEnv,
  type Dn,
  type Loads,
} from '@/lib/alloc';
import { AlProvider, useAl } from './allocStore';
import { mgTr } from '@/lib/mgText';
import { usePersistentState, useToast, useViewport } from '@/components/ui';

// The Management screens keep the prototype's single data set: `upd(fn)`
// changes a copy, the difference with what the server has becomes a batch of
// puts/deletes (POST /mg/ops), sent one batch at a time.

type Store = {
  D: MgData;
  upd: (fn: (d: MgData) => void) => void;
  setAll: (d: MgData) => void;
  /** a change the server already has (e.g. a photo uploaded through its own route): no ops */
  local: (fn: (d: MgData) => void) => void;
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
      setD({ clients: [], teams: [], people: [], projects: [], ts: [], reqs: [], settings: {} }),
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

  const local = useCallback((fn: (d: MgData) => void) => {
    if (!cur.current) return;
    const d = structuredClone(cur.current);
    fn(d);
    cur.current = d;
    if (synced.current) {
      const sy = structuredClone(synced.current);
      fn(sy);
      synced.current = sy;
    }
    setD(d);
  }, []);

  const value = useMemo(() => (D ? { D, upd, setAll, local } : null), [D, upd, setAll, local]);
  if (!value) return <div aria-busy="true" style={{ flex: 1 }} />;
  return (
    <Ctx.Provider value={value}>
      <AlProvider>{children}</AlProvider>
    </Ctx.Provider>
  );
}

export function useMgStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useMgStore outside MgProvider');
  return s;
}

/** Derived values and helpers of the prototype's _rv(), for every page. */
export function useMg() {
  const { D, upd, setAll, local } = useMgStore();
  const AL = useAl();
  const { lang } = useI18n();
  const router = useRouter();
  const [team, setTeam] = usePersistentState<string>('mg.team', 'all');
  const tr = useCallback((s: string) => mgTr(s, lang), [lang]);
  /** phone / tablet / desktop (D71): phones consult, the big editing tools stay on larger screens */
  const vp = useViewport();
  const m = useMemo(() => {
    const W = mgWeeks();
    const { wk } = W;
    const S = D.settings;
    // the level names as stored (Definições edits them) and as shown
    const LVR = S.levels ?? MG_LV;
    const LV = LVR.map((l) => tr(l));
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
    // ── Alocações v2: hours from the shared calculation (src/lib/alloc.ts) ──
    const base: Dn = dnOf(wk(0));
    const wDays = (w: number): [Dn, Dn] => [base + 7 * w, base + 7 * w + 6];
    const BK = [...AL.bookings].sort((x, y) => x.from.localeCompare(y.from) || x.id.localeCompare(y.id));
    const AB = AL.absences;
    const absBy = new Map<string, Absence[]>();
    for (const a of AB) absBy.set(a.person, [...(absBy.get(a.person) ?? []), a]);
    const env: CalcEnv = {
      weekly: (p) => weeklyOf(pById[p]?.cap),
      absences: (p) => absBy.get(p) ?? [],
    };
    const sCache = new WeakMap<Booking, ReturnType<typeof bookingSeries>>();
    const series = (b: Booking) => {
      let s = sCache.get(b);
      if (!s) sCache.set(b, (s = bookingSeries(b, env)));
      return s;
    };
    const byPerson = new Map<string, Booking[]>();
    for (const b of BK) byPerson.set(b.person, [...(byPerson.get(b.person) ?? []), b]);
    const lCache = new Map<string, Loads>();
    /** confirmed / tentative hours and capacity of a person per day, over the loaded range */
    const loads = (pid: string) => {
      let l = lCache.get(pid);
      if (!l) lCache.set(pid, (l = personLoads(pid, byPerson.get(pid) ?? [], env, AL.lo, AL.hi, series)));
      return l;
    };
    const inW = (b: Booking, w: number) => b.from < wk(w + 1) && b.to >= wk(w);
    /** hours of a booking in week w (0 = this week) */
    const bkW = (b: Booking, w: number) => {
      const [f, t] = wDays(w);
      const s = series(b);
      let h = 0;
      for (let n = Math.max(f, s.from); n <= Math.min(t, s.from + s.h.length - 1); n++) h += s.h[n - s.from]!;
      return Math.round(h * 10) / 10;
    };
    /** confirmed hours of a person in week w (tentative never count) */
    const loadW = (pid: string, w: number) => sumDays(loads(pid).conf, loads(pid), ...wDays(w));
    const tentW = (pid: string, w: number) => sumDays(loads(pid).tent, loads(pid), ...wDays(w));
    /** capacity of a person in week w: weekly hours less holidays and absences */
    const capW = (pid: string, w: number) => sumDays(loads(pid).cap, loads(pid), ...wDays(w));
    const avgLoad = (pid: string, a: number, b: number) => {
      let s = 0;
      for (let w = a; w <= b; w++) s += loadW(pid, w);
      return s / (b - a + 1);
    };
    const avgCap = (pid: string, a: number, b: number) => {
      let s = 0;
      for (let w = a; w <= b; w++) s += capW(pid, w);
      return s / (b - a + 1);
    };
    /** a person's bookings (with a person) overlapping weeks a..b */
    const bkIn = (pid: string, a: number, b: number) =>
      (byPerson.get(pid) ?? []).filter((x) => x.from < wk(b + 1) && x.to >= wk(a));
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
    /** cost still to come of a project: confirmed hours from today to its end × the person's rate */
    const forecast = (pr: string) => {
      const p = pjById[pr];
      if (!p) return 0;
      const t0 = dnOf(todayIso());
      const end = dnOf(p.to) + 6;
      return BK.filter((b) => b.project === pr && b.person && b.status === 'confirmed').reduce(
        (s, b) => s + bookingSum(b, env, t0, end) * (pById[b.person]?.rate ?? 0),
        0,
      );
    };
    const weekOpts: Array<{ v: string; l: string }> = [];
    for (let w = -30; w <= 52; w++) weekOpts.push({ v: wk(w), l: wLblY(wk(w)) });
    // name · cargo (Inativo / Suspenso say so)
    const personOpt = P.map((p) => ({
      v: p.id,
      l: `${p.name} · ${tr(p.role)}${(p.status ?? 'Ativo') !== 'Ativo' ? ` (${tr(p.status)})` : ''}`,
    }));
    const projOpt = PJ.map((p) => ({ v: p.id, l: `${p.code} · ${p.name}` }));
    /** 0 none, 1 under 90 %, 2 90–100 %, 3 over — against the capacity of the same period */
    const band = (h: number, cap: number) => loadBand(h, cap);
    const LC = [
      'rgb(var(--t) / calc(.5 * var(--t-k)))',
      'oklch(0.86 0.12 85)',
      'oklch(0.86 0.12 150)',
      'oklch(0.82 0.14 30)',
    ];
    const lc = (h: number, cap: number) => LC[band(h, cap)]!;
    const HEAT = [
      { bg: 'rgb(var(--w) / .04)', fg: 'rgb(var(--t) / calc(.35 * var(--t-k)))' },
      { bg: 'oklch(0.78 0.12 85 / .42)', fg: 'var(--ink)' },
      { bg: 'oklch(0.7 0.12 150 / .6)', fg: 'var(--ink-hi)' },
      { bg: 'oklch(0.66 0.16 25 / .75)', fg: 'var(--ink-hi)' },
    ];
    const heat = (h: number, cap: number) => HEAT[band(h, cap)]!;
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
    const inTeamProj = (pid: string) =>
      gTeam === 'all' ||
      pjById[pid]?.team === gTeam ||
      BK.some((a) => a.project === pid && pById[a.person]?.team === gTeam);
    const teamOpts = [{ v: '', l: 'Todas as equipas' }, ...TEAMS.map((x) => ({ v: x.id, l: tr(x.name) }))];
    /** team colour and name of a person (prototype _decTeam) */
    const tOf = (p: MgPerson | undefined) => {
      const x = p ? tById[p.team] : undefined;
      return { tc: x ? x.color : 'transparent', tn: x ? x.name : '' };
    };
    return {
      ...W,
      LV,
      LVR,
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
      AL,
      BK,
      AB,
      env,
      series,
      loads,
      base,
      wDays,
      inW,
      bkW,
      bkIn,
      loadW,
      tentW,
      capW,
      avgLoad,
      avgCap,
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
  }, [D, team, tr, AL]);
  /** prototype nav(page, patch): the selection travels in the URL */
  const nav = useCallback(
    (page: string, q?: Record<string, string>) =>
      router.push(`/app/${page.replace(/_/g, '-')}${q ? `?${new URLSearchParams(q)}` : ''}`),
    [router],
  );
  const confirmTr = useCallback((s: string) => window.confirm(tr(s)), [tr]);
  return { D, upd, setAll, local, lang, tr, nav, team, setTeam, cf: confirmTr, vp, ...m };
}
export type Mg = ReturnType<typeof useMg>;
