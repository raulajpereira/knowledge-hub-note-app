'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ABS_TYPES,
  dnOf,
  effortLabel,
  fmtNum,
  isIsoDay,
  isoOf,
  isoWeek,
  loadBand,
  sumDays,
  todayIso,
  type Absence,
  type Booking,
  type Dn,
} from '@/lib/alloc';
import type { MgPerson } from '@/lib/mg';
import { Sheet } from '@/components/ui';
import { Av } from '../ui';
import type { Mg } from '../store';
import { ABS_LABEL, BAND_BG, BAND_FG, dayMon, groupOfArea, wdShort } from './shared';
import './alloc.css';

type PF = 'over' | 'free' | 'ph' | string;

// Alocações on a phone (D71, A5/A6): a week at a time to read — who is over,
// who has room, roles still without a person — and the two light actions:
// confirm a tentative booking and mark an absence. Editing stays on the PC.
export function PhoneAlloc({ mg }: { mg: Mg }) {
  const { tr, lang } = mg;
  const t0 = dnOf(todayIso());
  const [mon, setMon] = useState<Dn>(t0 - ((t0 + 3) % 7));
  const [mode, setMode] = useState<'day' | 'week' | 'month'>('week');
  const [f, setF] = useState<PF | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [phOpen, setPhOpen] = useState(false);
  const span = useMemo<[Dn, Dn]>(() => {
    const d = mon + Math.min(4, Math.max(0, t0 - mon));
    return mode === 'day' ? [d, d] : mode === 'week' ? [mon, mon + 6] : [mon, mon + 27];
  }, [mode, mon, t0]);
  useEffect(() => {
    mg.AL.ensure(mon - 7, mon + 35);
  }, [mon, mg.AL]);
  const A = isoOf(span[0]);
  const B = isoOf(span[1]);
  const rows = useMemo(
    () =>
      mg.P.map((p) => {
        const l = mg.loads(p.id);
        const conf = sumDays(l.conf, l, span[0], span[1]);
        const cap = sumDays(l.cap, l, span[0], span[1]);
        const bks = mg.BK.filter((b) => b.person === p.id && b.from <= B && b.to >= A);
        return { p, conf, cap, bks, band: loadBand(conf, cap) };
      }),
    [mg, span, A, B],
  );
  const ph = mg.BK.filter((b) => !b.person && b.from <= B && b.to >= A);
  const areas = [...new Set(mg.P.map((p) => groupOfArea(p.area)))].slice(0, 6);
  const vis = rows.filter(
    (r) =>
      !f ||
      (f === 'over'
        ? r.conf > r.cap + 0.01
        : f === 'free'
          ? r.cap > 0 && r.conf < r.cap * 0.75
          : f === 'ph'
            ? false
            : groupOfArea(r.p.area) === f),
  );
  const nOver = rows.filter((r) => r.conf > r.cap + 0.01).length;
  const nFree = rows.filter((r) => r.cap > 0 && r.conf < r.cap * 0.75).length;
  const wk = isoWeek(mon);
  const title = mode === 'month' ? tr('4 semanas') : tr(`Semana ${wk.w}`);
  const sel = sheet ? rows.find((r) => r.p.id === sheet) : null;
  const days = Array.from({ length: 5 }, (_, i) => mon + i);
  return (
    <section className="al-root" aria-label={tr('Alocações')} style={{ borderRadius: 26 }}>
      <div className="al-phone">
        <div className="al-wkhd">
          <button
            type="button"
            className="al-x"
            style={{ width: 40, height: 40 }}
            aria-label={tr('Anterior')}
            onClick={() => setMon(mon - (mode === 'month' ? 28 : 7))}
          >
            ‹
          </button>
          <span className="t">
            <b>{title}</b>
            <span>
              {dayMon(span[0], lang)} – {dayMon(mode === 'week' ? mon + 4 : span[1], lang)}{' '}
              {new Date(span[1] * 864e5).getUTCFullYear()}
            </span>
          </span>
          <button
            type="button"
            className="al-x"
            style={{ width: 40, height: 40 }}
            aria-label={tr('Seguinte')}
            onClick={() => setMon(mon + (mode === 'month' ? 28 : 7))}
          >
            ›
          </button>
        </div>
        <span
          className="al-seg"
          style={{ alignSelf: 'stretch', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}
        >
          {(
            [
              ['day', 'Dia'],
              ['week', 'Semana'],
              ['month', 'Mês'],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-pressed={mode === k}
              style={{ height: 36, fontSize: 13 }}
              onClick={() => setMode(k)}
            >
              {tr(l)}
            </button>
          ))}
        </span>
        <div className="al-chips" style={{ flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 2 }}>
          <button
            type="button"
            className={`al-chip${nOver ? ' red' : ''}`}
            aria-pressed={f === 'over'}
            onClick={() => setF(f === 'over' ? null : 'over')}
            style={{ height: 34, fontSize: 13 }}
          >
            {tr('Sobre-alocados')} {nOver}
          </button>
          <button
            type="button"
            className="al-chip"
            aria-pressed={f === 'free'}
            onClick={() => setF(f === 'free' ? null : 'free')}
            style={{ height: 34, fontSize: 13 }}
          >
            {tr('Livres')} {nFree}
          </button>
          <button
            type="button"
            className="al-chip"
            aria-pressed={phOpen}
            onClick={() => setPhOpen(true)}
            style={{ height: 34, fontSize: 13 }}
          >
            {tr('Por atribuir')} {ph.length}
          </button>
          {areas.map((a) => (
            <button
              key={a}
              type="button"
              className="al-chip"
              aria-pressed={f === a}
              onClick={() => setF(f === a ? null : a)}
              style={{ height: 34, fontSize: 13 }}
            >
              {a}
            </button>
          ))}
        </div>
        {ph.length > 0 && (
          <button type="button" className="al-phbanner" onClick={() => setPhOpen(true)}>
            <span className="al-ph-av">?</span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <b style={{ fontSize: 15 }}>
                {tr(ph.length === 1 ? '1 função por atribuir' : `${ph.length} funções por atribuir`)}
              </b>
              <span
                style={{
                  fontSize: 12,
                  color: 'rgb(var(--t) / calc(.65 * var(--t-k)))',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {ph
                  .slice(0, 2)
                  .map((b) => `${b.role} · ${mg.pjById[b.project]?.code ?? ''}`)
                  .join(' · ')}
                {ph.length > 2 ? ` ${tr(`e mais ${ph.length - 2}`)}` : ''}
              </span>
            </span>
            <span aria-hidden>›</span>
          </button>
        )}
        {vis.map((r) => (
          <PersonCard
            key={r.p.id}
            mg={mg}
            r={r}
            days={days}
            mode={mode}
            span={span}
            onOpen={() => setSheet(r.p.id)}
          />
        ))}
        {!vis.length && <div className="al-empty">{tr('Ninguém com estes filtros.')}</div>}
      </div>
      {sel && <PersonSheet mg={mg} p={sel.p} mon={mon} onClose={() => setSheet(null)} />}
      <Sheet
        open={phOpen}
        onClose={() => setPhOpen(false)}
        title={tr('Por atribuir')}
        closeLabel={tr('Fechar')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 8 }}>
          {ph.map((b) => (
            <div key={b.id} className="al-sheet-bk tent" style={{ borderColor: 'rgb(var(--w) / .4)' }}>
              <span className="c" style={{ background: mg.pjById[b.project]?.color }} />
              <span className="tx">
                <b>
                  {mg.pjById[b.project]?.code} · {b.role}
                </b>
                <span>
                  {effortLabel(b, lang)} · {dayMon(dnOf(b.from), lang)} → {dayMon(dnOf(b.to), lang)}
                </span>
              </span>
            </div>
          ))}
          <span className="al-hint" style={{ whiteSpace: 'normal' }}>
            {tr('Atribua uma pessoa no computador (Alocações › Projetos).')}
          </span>
        </div>
      </Sheet>
    </section>
  );
}

function PersonCard({
  mg,
  r,
  days,
  mode,
  span,
  onOpen,
}: {
  mg: Mg;
  r: { p: MgPerson; conf: number; cap: number; bks: Booking[]; band: number };
  days: Dn[];
  mode: 'day' | 'week' | 'month';
  span: [Dn, Dn];
  onOpen: () => void;
}) {
  const { tr, lang } = mg;
  const l = mg.loads(r.p.id);
  const cells =
    mode === 'month'
      ? Array.from({ length: 4 }, (_, i) => ({
          a: span[0] + 7 * i,
          b: span[0] + 7 * i + 6,
          lbl: `S${isoWeek(span[0] + 7 * i).w}`,
        }))
      : mode === 'day'
        ? [{ a: span[0], b: span[0], lbl: wdShort(span[0], lang) }]
        : days.map((n) => ({ a: n, b: n, lbl: wdShort(n, lang).slice(0, 1).toUpperCase() }));
  const mix = new Map<string, number>();
  for (const b of r.bks)
    if (b.status === 'confirmed') {
      const s = mg.series(b);
      let h = 0;
      for (let n = Math.max(span[0], s.from); n <= Math.min(span[1], s.from + s.h.length - 1); n++)
        h += s.h[n - s.from]!;
      if (h) mix.set(b.project, (mix.get(b.project) ?? 0) + h);
    }
  const tent = r.bks.filter((b) => b.status === 'tentative').length;
  const tot = [...mix.values()].reduce((a, b) => a + b, 0) || 1;
  return (
    <button type="button" className="al-pcard" onClick={onOpen} aria-label={r.p.name}>
      <span className="r1">
        <Av p={r.p} size={42} fs={14} tc={mg.tOf(r.p).tc} />
        <span className="tx">
          <b>{r.p.name}</b>
          <span>
            {tr(r.p.role)} · {mg.LV[r.p.level]}
          </span>
        </span>
        <span
          className="al-pct"
          style={{
            fontSize: 13,
            padding: '4px 10px',
            background: BAND_BG[r.band],
            color: r.band ? BAND_FG[r.band] : 'var(--ink)',
          }}
        >
          {fmtNum(r.conf, lang)}/{fmtNum(r.cap, lang)}h
        </span>
      </span>
      <span className="al-days" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
        {cells.map((c) => {
          const h = sumDays(l.conf, l, c.a, c.b);
          const cap = sumDays(l.cap, l, c.a, c.b);
          const bd = cap ? loadBand(h, cap) : h ? 3 : 0;
          const off = !cap && !h;
          return (
            <span
              key={c.a}
              style={{
                background: off ? 'rgb(var(--w) / .06)' : BAND_BG[bd],
                color: off ? 'rgb(var(--t) / calc(.4 * var(--t-k)))' : bd ? BAND_FG[bd] : 'var(--ink)',
              }}
            >
              <small>{c.lbl}</small>
              {fmtNum(h, lang)}
            </span>
          );
        })}
      </span>
      <span className="al-mix">
        <span className="bar">
          {[...mix].map(([pj, h]) => (
            <i key={pj} style={{ width: `${(h / tot) * 100}%`, background: mg.pjById[pj]?.color }} />
          ))}
        </span>
        <span>
          {[...mix.keys()]
            .slice(0, 2)
            .map((pj) => mg.pjById[pj]?.code)
            .join(' · ')}
          {tent ? ` · +${tent} ${tr('tent.')}` : ''}
        </span>
      </span>
    </button>
  );
}

/** A6: the person's week, their bookings (confirm a tentative one) and "Marcar férias". */
function PersonSheet({ mg, p, mon, onClose }: { mg: Mg; p: MgPerson; mon: Dn; onClose: () => void }) {
  const { tr, lang } = mg;
  const [abs, setAbs] = useState<Absence | null>(null);
  const l = mg.loads(p.id);
  const conf = sumDays(l.conf, l, mon, mon + 6);
  const cap = sumDays(l.cap, l, mon, mon + 6);
  const A = isoOf(mon);
  const B = isoOf(mon + 6);
  const bks = mg.BK.filter((b) => b.person === p.id && b.from <= B && b.to >= A).sort(
    (a, b) => +(a.status === 'tentative') - +(b.status === 'tentative'),
  );
  const over = conf > cap + 0.01;
  const absList = mg.AB.filter((a) => a.person === p.id && a.from <= B && a.to >= A);
  return (
    <Sheet open onClose={onClose} title={p.name} closeLabel={tr('Fechar')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Av p={p} size={48} fs={16} tc={mg.tOf(p).tc} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <b style={{ fontSize: 18 }}>{p.name}</b>
            <span style={{ fontSize: 12.5, color: 'rgb(var(--t) / calc(.7 * var(--t-k)))' }}>
              {tr(p.role)} · {mg.LV[p.level]} · {fmtNum(+p.cap, lang)}h/{lang === 'en' ? 'wk' : 'sem'}
            </span>
          </span>
        </div>
        {over ? (
          <div className="al-warn">
            <span>
              <b>
                {fmtNum(conf, lang)}h {tr('nesta semana')} ({cap ? Math.round((conf / cap) * 100) : 0}%)
              </b>{' '}
              —{' '}
              {bks
                .filter((b) => b.status === 'confirmed')
                .map((b) => `${mg.pjById[b.project]?.code} ${effortLabel(b, lang)}`)
                .join(' + ')}
            </span>
          </div>
        ) : (
          <div
            className="al-warn soft"
            style={{ background: 'rgb(var(--w) / .06)', borderColor: 'rgb(var(--w) / .14)' }}
          >
            <span>
              <b>
                {fmtNum(conf, lang)}h / {fmtNum(cap, lang)}h
              </b>{' '}
              {tr('nesta semana')}
              {absList.length > 0 && ` · ${absList.map((a) => tr(ABS_LABEL[a.type]!)).join(', ')}`}
            </span>
          </div>
        )}
        <div className="al-days">
          {Array.from({ length: 5 }, (_, i) => {
            const n = mon + i;
            const h = l.conf[n - l.from] ?? 0;
            const c = l.cap[n - l.from] ?? 0;
            const bd = c ? loadBand(h, c) : h ? 3 : 0;
            const off = !c && !h;
            return (
              <span
                key={n}
                style={{
                  padding: '6px 0',
                  background: off ? 'rgb(var(--w) / .06)' : BAND_BG[bd],
                  color: off ? 'rgb(var(--t) / calc(.5 * var(--t-k)))' : bd ? BAND_FG[bd] : 'var(--ink)',
                }}
              >
                <small>
                  {wdShort(n, lang)} {isoOf(n).slice(8)}
                </small>
                {fmtNum(h, lang)}h
              </span>
            );
          })}
        </div>
        {bks.map((b) => {
          const pj = mg.pjById[b.project];
          const tent = b.status === 'tentative';
          return (
            <div key={b.id} className={`al-sheet-bk${tent ? ' tent' : ''}`}>
              <span className="c" style={{ background: pj?.color }} />
              <span className="tx">
                <b>
                  {pj?.code} · {pj?.name}
                </b>
                <span>
                  {effortLabel(b, lang)} · {dayMon(dnOf(b.from), lang)} → {dayMon(dnOf(b.to), lang)}
                </span>
                <span>{tent ? tr('tentativo') : b.role}</span>
              </span>
              {tent && (
                <button
                  type="button"
                  className="al-btn ghost sm"
                  onClick={() => mg.AL.change({ bk: [{ ...b, status: 'confirmed' }] })}
                >
                  {tr('Confirmar')}
                </button>
              )}
            </div>
          );
        })}
        {abs ? (
          <form
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (isIsoDay(abs.from) && isIsoDay(abs.to) && abs.from <= abs.to) {
                mg.AL.change({ ab: [abs] });
                setAbs(null);
              }
            }}
          >
            <div className="al-chips">
              {ABS_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="al-chip"
                  aria-pressed={abs.type === t}
                  onClick={() => setAbs({ ...abs, type: t })}
                >
                  {tr(ABS_LABEL[t]!)}
                </button>
              ))}
            </div>
            <div className="al-2">
              <label className="al-lbl">
                {tr('De')}
                <input
                  type="date"
                  className="al-in mono"
                  value={abs.from}
                  onChange={(e) => setAbs({ ...abs, from: e.target.value })}
                />
              </label>
              <label className="al-lbl">
                {tr('Até')}
                <input
                  type="date"
                  className="al-in mono"
                  value={abs.to}
                  min={abs.from}
                  onChange={(e) => setAbs({ ...abs, to: e.target.value })}
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="al-btn ghost"
                style={{ flex: 1, height: 44 }}
                onClick={() => setAbs(null)}
              >
                {tr('Cancelar')}
              </button>
              <button type="submit" className="al-btn" style={{ flex: 1, height: 44 }}>
                {tr('Marcar')}
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="al-btn ghost"
              style={{ flex: 1, height: 48, fontSize: 14 }}
              onClick={() =>
                setAbs({
                  id: crypto.randomUUID(),
                  person: p.id,
                  type: 'ferias',
                  from: isoOf(mon),
                  to: isoOf(mon + 4),
                  hours: null,
                  note: '',
                  ver: '',
                })
              }
            >
              {tr('Marcar férias')}
            </button>
            <button
              type="button"
              className="al-btn"
              style={{ flex: 1, height: 48, fontSize: 14 }}
              onClick={onClose}
            >
              {tr('Resolver no PC')}
            </button>
          </div>
        )}
        <span
          className="al-hint"
          style={{ justifyContent: 'center', whiteSpace: 'normal', textAlign: 'center' }}
        >
          {tr('No telemóvel: consultar, confirmar tentativos e marcar férias')}
        </span>
      </div>
    </Sheet>
  );
}
