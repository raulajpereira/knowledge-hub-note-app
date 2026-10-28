'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ABS_TYPES,
  AL_MASK_ALL,
  addDays,
  conflictOf,
  convertValue,
  dnOf,
  equivalents,
  fmtNum,
  holidayName,
  holidayOf,
  inMask,
  isIsoDay,
  isoOf,
  roundStep,
  type Absence,
  type BkMode,
  type Booking,
} from '@/lib/alloc';
import { MG_ROLE, isAvailable } from '@/lib/mg';
import { Av } from '../ui';
import type { Mg } from '../store';
import { ABS_LABEL, dayMon, newBooking } from './shared';

/** A floating glass panel next to a point, kept inside the window. */
export function Floating({
  x,
  y,
  w,
  label,
  onClose,
  children,
  className = 'al-pop',
}: {
  x: number;
  y: number;
  w: number;
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const left = Math.max(10, Math.min(window.innerWidth - w - 10, x));
    const top = Math.max(10, Math.min(window.innerHeight - h - 10, y));
    setPos({ left, top });
  }, [x, y, w]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  return createPortal(
    <>
      <div
        onPointerDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        style={{ position: 'fixed', inset: 0, zIndex: 299 }}
      />
      <div
        ref={ref}
        role="dialog"
        aria-label={label}
        className={className}
        style={{ left: pos.left, top: pos.top, width: w }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

const X = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const WD = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const WD_EN = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MODES: Array<[BkMode, string, string]> = [
  ['hpd', 'Horas por dia', 'h'],
  ['hpw', 'Horas por semana', 'h'],
  ['pct', '% da capacidade', '%'],
  ['fte', 'FTE', ''],
  ['total', 'Total', 'h'],
];

/** The booking popover (A4): project, dates, the linked effort fields, weekdays, status, role, conflicts. */
export function BookingPop({
  mg,
  draft,
  isNew,
  x,
  y,
  onClose,
  onSave,
  onDelete,
}: {
  mg: Mg;
  draft: Booking;
  isNew: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onSave: (b: Booking) => void;
  onDelete?: () => void;
}) {
  const { tr, lang } = mg;
  const en = lang === 'en';
  const [b, setB] = useState<Booking>(draft);
  // what is being typed in the effort field of the current mode
  const [typed, setTyped] = useState<string>(fmtNum(draft.value, lang, 2));
  const set = (p: Partial<Booking>) => setB((o) => ({ ...o, ...p }));
  const person = b.person ? mg.pById[b.person] : undefined;
  const pj = mg.pjById[b.project];
  const ok = isIsoDay(b.from) && isIsoDay(b.to) && b.from <= b.to && !!b.project;
  const eq = useMemo(() => (ok ? equivalents(b, mg.env) : null), [b, ok, mg.env]);
  const conflict = useMemo(() => (ok ? conflictOf(b, mg.BK, mg.env) : null), [b, ok, mg.BK, mg.env]);
  // national holidays and absences inside the range, on the days of the mask
  const notes = useMemo(() => {
    if (!ok) return { hol: [] as Array<[string, string]>, abs: [] as Absence[], we: false };
    const F = dnOf(b.from);
    const T = Math.min(dnOf(b.to), F + 800);
    const hol: Array<[string, string]> = [];
    let we = false;
    for (let n = F; n <= T; n++) {
      if (!inMask(b.mask, n)) continue;
      const h = holidayOf(n);
      if (h && ((n + 3) % 7 + 7) % 7 < 5) hol.push([isoOf(n), h]);
      if (((n + 3) % 7 + 7) % 7 >= 5) we = true;
    }
    const abs = b.person ? mg.env.absences(b.person).filter((a) => a.from <= b.to && a.to >= b.from) : [];
    return { hol, abs, we };
  }, [b, ok, mg.env]);

  const typeIn = (mode: BkMode, raw: string) => {
    setTyped(raw);
    const v = Number(raw.replace(',', '.'));
    if (Number.isFinite(v) && v >= 0) set({ mode, value: v });
  };
  const switchMode = (mode: BkMode) => {
    if (mode === b.mode) return;
    const v = ok ? convertValue(b, mode, mg.env) : b.value;
    setB((o) => ({ ...o, mode, value: v }));
    setTyped(fmtNum(v, lang, 2));
  };
  const shown = (m: BkMode) => {
    if (m === b.mode) return typed;
    if (!eq) return '';
    return fmtNum(eq[m], lang, m === 'fte' ? 2 : 1);
  };
  const finish = () => {
    if (!ok) return;
    let out = { ...b, role: b.role.trim().slice(0, 120) };
    // typed hours in half hours (0.5 h is the smallest step)
    if (out.mode === 'hpd' || out.mode === 'hpw' || out.mode === 'total') out.value = roundStep(out.value);
    if (out.mode === 'fte') out.value = Math.min(3, Math.round(out.value * 100) / 100);
    if (out.mode === 'pct') out.value = Math.min(300, Math.round(out.value));
    if (out.mode === 'hpd') out.value = Math.min(24, out.value);
    if (!out.person && !out.role) out = { ...out, role: tr('Por atribuir') };
    onSave(out);
  };
  const roleSugg = useMemo(() => {
    const s = new Set<string>();
    if (person) {
      s.add(person.role);
      for (const k of Object.keys(person.skills)) if (MG_ROLE[k]) s.add(MG_ROLE[k]!);
    }
    for (const x of mg.BK) if (x.project === b.project && x.role) s.add(x.role);
    return [...s].filter(Boolean).slice(0, 20);
  }, [person, mg.BK, b.project]);
  const people = mg.ALLP.filter((p) => isAvailable(p) || p.id === b.person);
  const fmtD = (s: string) => dayMon(dnOf(s), lang);
  const title = isNew ? tr('Nova alocação') : tr('Editar alocação');

  return (
    <Floating x={x} y={y} w={392} label={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          finish();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault();
            finish();
          }
        }}
      >
        <div className="al-pop-hd">
          {person ? (
            <Av p={person} size={34} fs={12} tc={mg.tOf(person).tc} />
          ) : (
            <span className="al-ph-av">?</span>
          )}
          <span className="t">
            <b>{title}</b>
            <span>{person ? `${person.name} · ${tr(person.role)} · ${mg.LV[person.level]}` : tr('Por atribuir')}</span>
          </span>
          <button type="button" className="al-x" onClick={onClose} aria-label={tr('Fechar')} title={tr('Fechar')}>
            <X />
          </button>
        </div>
        <div className="al-pop-bd">
          <div className="al-2">
            <label className="al-lbl">
              {tr('Pessoa')}
              <select
                className="al-in"
                value={b.person}
                onChange={(e) => set({ person: e.target.value })}
                aria-label={tr('Pessoa')}
              >
                <option value="">— {tr('Por atribuir')} —</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="al-lbl">
              {tr('Projeto')}
              <select
                className="al-in"
                value={b.project}
                onChange={(e) => set({ project: e.target.value })}
                aria-label={tr('Projeto')}
                autoFocus={isNew && !b.project}
              >
                {!b.project && <option value="">—</option>}
                {mg.PJ.filter((p) => p.status !== 'Concluído' || p.id === b.project).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="al-2">
            <label className="al-lbl">
              {tr('De')}
              <input
                type="date"
                className="al-in mono"
                value={b.from}
                onChange={(e) => isIsoDay(e.target.value) && set({ from: e.target.value })}
                aria-label={tr('De')}
              />
            </label>
            <label className="al-lbl">
              {tr('Até')}
              <input
                type="date"
                className="al-in mono"
                value={b.to}
                min={b.from}
                onChange={(e) => isIsoDay(e.target.value) && set({ to: e.target.value })}
                aria-label={tr('Até')}
              />
            </label>
          </div>
          <span className="al-lbl" style={{ marginBottom: -4 }}>
            {tr('Esforço — escreva num dos campos, os outros acompanham')}
          </span>
          <div className="al-eff" role="group" aria-label={tr('Esforço')}>
            {MODES.map(([m, l, u]) => (
              <label key={m} className={b.mode === m ? 'on' : ''}>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr(l)}</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                  <input
                    inputMode="decimal"
                    value={shown(m)}
                    aria-label={tr(l)}
                    data-mode={m}
                    onFocus={() => switchMode(m)}
                    onChange={(e) => typeIn(m, e.target.value)}
                    autoFocus={isNew && !!b.project && m === b.mode}
                  />
                  <span style={{ fontSize: 11 }}>{u}</span>
                </span>
              </label>
            ))}
          </div>
          {eq && (
            <span className="al-hint" style={{ marginTop: -2 }}>
              {tr(`${eq.days} dias úteis`)} · {fmtD(b.from)} → {fmtD(b.to)}
            </span>
          )}
          <div className="al-wd" role="group" aria-label={tr('Dias da semana')}>
            {(en ? WD_EN : WD).map((d, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={(b.mask & (1 << i)) !== 0}
                title={tr(['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'][i]!)}
                onClick={() => {
                  const m = b.mask ^ (1 << i);
                  if (m & AL_MASK_ALL) set({ mask: m });
                }}
              >
                {d}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            <span className="al-seg" role="group" aria-label={tr('Estado')}>
              {(['confirmed', 'tentative'] as const).map((s) => (
                <button key={s} type="button" aria-pressed={b.status === s} onClick={() => set({ status: s })}>
                  {tr(s === 'confirmed' ? 'Confirmado' : 'Tentativo')}
                </button>
              ))}
            </span>
          </div>
          <label className="al-lbl">
            {b.person ? tr('Função') : tr('Função a preencher')}
            <input
              className="al-in"
              value={b.role}
              maxLength={120}
              list="al-role-sugg"
              placeholder={b.person ? tr('ex.: Líder FI-GL / AA') : tr('ex.: Consultor FI · Sénior')}
              onChange={(e) => set({ role: e.target.value })}
              aria-label={tr('Função')}
            />
            <datalist id="al-role-sugg">
              {roleSugg.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </label>
          {!b.person && (
            <div className="al-2">
              <label className="al-lbl">
                {tr('Competência pedida')}
                <select
                  className="al-in"
                  value={b.need[0]?.k ?? ''}
                  onChange={(e) =>
                    set({ need: e.target.value ? [{ k: e.target.value, l: b.need[0]?.l ?? 2 }] : [] })
                  }
                >
                  <option value="">—</option>
                  {mg.SKL.map(([k, l]) => (
                    <option key={k} value={k}>
                      {tr(l)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="al-lbl">
                {tr('Nível mínimo')}
                <select
                  className="al-in"
                  value={String(b.need[0]?.l ?? 0)}
                  disabled={!b.need[0]}
                  onChange={(e) => b.need[0] && set({ need: [{ k: b.need[0].k, l: +e.target.value }] })}
                >
                  {mg.lvIdx.map((l) => (
                    <option key={l} value={l}>
                      {mg.LV[l]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {notes.hol.length > 0 && (
            <div className="al-warn soft" role="note">
              <span className="ic">!</span>
              <span>
                {tr('Inclui feriado')}: {notes.hol.map(([d, k]) => `${fmtD(d)} (${holidayName(k, lang)})`).join(', ')}
                {' — '}
                {b.hol ? tr('conta como dia de trabalho (capacidade 0).') : tr('não conta.')}{' '}
                <button type="button" className="lk" onClick={() => set({ hol: !b.hol })}>
                  {b.hol ? tr('não trabalhar no feriado') : tr('trabalhar no feriado')}
                </button>
              </span>
            </div>
          )}
          {notes.abs.length > 0 && (
            <div className="al-warn soft" role="note">
              <span className="ic">!</span>
              <span>
                {notes.abs
                  .map((a) => `${tr(ABS_LABEL[a.type] ?? a.type)} ${fmtD(a.from)} → ${fmtD(a.to)}`)
                  .join(' · ')}
                {' — '}
                {tr('esses dias não contam.')}
              </span>
            </div>
          )}
          {conflict && (
            <div className="al-warn" role="alert">
              <span className="ic">!</span>
              <span>
                <b>
                  {tr(`Sobre-alocação em ${conflict.days.length} dias`)} ({fmtD(isoOf(conflict.days[0]!))}
                  {conflict.days.length > 1 ? `–${fmtD(isoOf(conflict.days.at(-1)!))}` : ''})
                </b>
                : {person?.name}{' '}
                {tr(`chega a ${fmtNum(conflict.peak, lang)}h/dia (capacidade ${fmtNum(conflict.peakCap, lang)}h).`)}
                <br />
                {tr('Resolver')}:{' '}
                {conflict.startFree && conflict.startFree <= b.to && (
                  <>
                    <button type="button" className="lk" onClick={() => set({ from: conflict.startFree })}>
                      {tr(`começar a ${fmtD(conflict.startFree)}`)}
                    </button>
                    {' · '}
                  </>
                )}
                {conflict.fits > 0 && (
                  <>
                    <button
                      type="button"
                      className="lk"
                      onClick={() => {
                        set({ mode: 'hpd', value: conflict.fits });
                        setTyped(fmtNum(conflict.fits, lang));
                      }}
                    >
                      {tr(`só o que cabe (${fmtNum(conflict.fits, lang)}h/dia)`)}
                    </button>
                    {' · '}
                  </>
                )}
                <button type="button" className="lk" onClick={() => set({ status: 'tentative' })}>
                  {tr('tentativo')}
                </button>
                {' · '}
                <span style={{ opacity: 0.8 }}>{tr('ou manter (é só um aviso)')}</span>
              </span>
            </div>
          )}
          {notes.we && (
            <span className="al-hint">{tr('Inclui fins de semana (ex.: cutover) — capacidade 0, conta como extra.')}</span>
          )}
        </div>
        <div className="al-pop-ft">
          {onDelete && (
            <button type="button" className="al-btn sm danger" onClick={onDelete}>
              {tr('Eliminar')}
            </button>
          )}
          <span className="al-hint">
            <span className="al-kbd">↵</span>
            {tr(isNew ? 'criar' : 'guardar')}
            <span className="al-kbd">Esc</span>
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" className="al-btn ghost" onClick={onClose}>
            {tr('Cancelar')}
          </button>
          <button type="submit" className="al-btn" disabled={!ok}>
            {tr(isNew ? 'Criar alocação' : 'Guardar')}
          </button>
        </div>
        {pj && <span hidden>{pj.code}</span>}
      </form>
    </Floating>
  );
}

/** Marking an absence (vacation, sickness, training, other) — the manager marks it, no approval. */
export function AbsencePop({
  mg,
  draft,
  isNew,
  x,
  y,
  onClose,
  onSave,
  onDelete,
}: {
  mg: Mg;
  draft: Absence;
  isNew: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onSave: (a: Absence) => void;
  onDelete?: () => void;
}) {
  const { tr } = mg;
  const [a, setA] = useState(draft);
  const set = (p: Partial<Absence>) => setA((o) => ({ ...o, ...p }));
  const p = mg.pById[a.person];
  const ok = !!a.person && isIsoDay(a.from) && isIsoDay(a.to) && a.from <= a.to;
  const title = isNew ? tr('Marcar ausência') : tr('Ausência');
  const affected = ok
    ? mg.BK.filter((b) => b.person === a.person && b.from <= a.to && b.to >= a.from && b.status === 'confirmed')
    : [];
  return (
    <Floating x={x} y={y} w={360} label={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onSave(a);
        }}
      >
        <div className="al-pop-hd">
          {p ? <Av p={p} size={34} fs={12} tc={mg.tOf(p).tc} /> : <span className="al-ph-av">?</span>}
          <span className="t">
            <b>{title}</b>
            <span>{p?.name ?? '—'}</span>
          </span>
          <button type="button" className="al-x" onClick={onClose} aria-label={tr('Fechar')}>
            <X />
          </button>
        </div>
        <div className="al-pop-bd">
          <label className="al-lbl">
            {tr('Pessoa')}
            <select className="al-in" value={a.person} onChange={(e) => set({ person: e.target.value })}>
              {!a.person && <option value="">—</option>}
              {mg.ALLP.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <div className="al-chips" role="group" aria-label={tr('Tipo')}>
            {ABS_TYPES.map((t) => (
              <button key={t} type="button" className="al-chip" aria-pressed={a.type === t} onClick={() => set({ type: t })}>
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
                value={a.from}
                onChange={(e) => isIsoDay(e.target.value) && set({ from: e.target.value })}
              />
            </label>
            <label className="al-lbl">
              {tr('Até')}
              <input
                type="date"
                className="al-in mono"
                value={a.to}
                min={a.from}
                onChange={(e) => isIsoDay(e.target.value) && set({ to: e.target.value })}
              />
            </label>
          </div>
          <div className="al-wd">
            <span className="al-seg">
              <button type="button" aria-pressed={a.hours == null} onClick={() => set({ hours: null })}>
                {tr('Dia inteiro')}
              </button>
              <button type="button" aria-pressed={a.hours != null} onClick={() => set({ hours: a.hours ?? 4 })}>
                {tr('Parte do dia')}
              </button>
            </span>
            {a.hours != null && (
              <label className="al-hint">
                <input
                  className="al-in mono"
                  style={{ width: 70, height: 30 }}
                  inputMode="decimal"
                  value={fmtNum(a.hours, mg.lang)}
                  onChange={(e) => {
                    const v = roundStep(Number(e.target.value.replace(',', '.')));
                    if (Number.isFinite(v)) set({ hours: Math.min(24, Math.max(0.5, v)) });
                  }}
                />
                {tr('h por dia')}
              </label>
            )}
          </div>
          <label className="al-lbl">
            {tr('Nota')}
            <input className="al-in" value={a.note} maxLength={500} onChange={(e) => set({ note: e.target.value })} />
          </label>
          {affected.length > 0 && (
            <span className="al-hint" style={{ whiteSpace: 'normal' }}>
              {tr('Nesses dias não contam')}: {affected.map((b) => mg.pjById[b.project]?.code).join(', ')}
            </span>
          )}
        </div>
        <div className="al-pop-ft">
          {onDelete && (
            <button type="button" className="al-btn sm danger" onClick={onDelete}>
              {tr('Eliminar')}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="al-btn ghost" onClick={onClose}>
            {tr('Cancelar')}
          </button>
          <button type="submit" className="al-btn" disabled={!ok}>
            {tr(isNew ? 'Marcar' : 'Guardar')}
          </button>
        </div>
      </form>
    </Floating>
  );
}

export const newAbsence = (person: string, from: string, to = from): Absence => ({
  id: crypto.randomUUID(),
  person,
  type: 'ferias',
  from,
  to,
  hours: null,
  note: '',
  ver: '',
});
export { addDays, newBooking };
