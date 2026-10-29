'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { Modal, Segmented } from '@/components/ui';
import type { Mg } from '../store';
import { ABS_LABEL, ABS_TYPE_LABEL, dayMon, newBooking } from './shared';
import './alloc.css';

/** A floating glass panel next to a point, kept inside the window. */
export function Floating({
  x,
  y,
  w,
  label,
  onClose,
  children,
  className = '',
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
        style={{ position: 'fixed', inset: 0, zIndex: 8999 }}
      />
      <div
        ref={ref}
        role="dialog"
        aria-label={label}
        className={`kh-popover al-pop${className ? ` ${className}` : ''}`}
        style={{ left: pos.left, top: pos.top, width: w }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

const WD = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WD_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WD_LONG = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const MODES: Array<[BkMode, string, string]> = [
  ['hpd', 'Horas/dia', 'h'],
  ['hpw', 'Horas/semana', 'h'],
  ['pct', '% capacidade', '%'],
  ['fte', 'FTE', ''],
  ['total', 'Total', 'h'],
];

/** A labelled field of the dialogs: the label above, the control under it. */
export function Fld({
  label,
  hint,
  children,
  wide,
  as = 'label',
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
  as?: 'label' | 'div';
}) {
  const T = as;
  return (
    <T className={`al-f${wide ? ' wide' : ''}`}>
      <span className="al-f-l">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </T>
  );
}

/** The booking dialog (A4): project, dates, the linked effort fields, weekdays, status, role, conflicts. */
export function BookingPop({
  mg,
  draft,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  mg: Mg;
  draft: Booking;
  isNew: boolean;
  onClose: () => void;
  onSave: (b: Booking) => void;
  onDelete?: () => void;
}) {
  const { tr, lang } = mg;
  const en = lang === 'en';
  const formId = useId();
  const [b, setB] = useState<Booking>(draft);
  // what is being typed in the effort field of the current mode
  const [typed, setTyped] = useState<string>(fmtNum(draft.value, lang, 2));
  const set = (p: Partial<Booking>) => setB((o) => ({ ...o, ...p }));
  const person = b.person ? mg.pById[b.person] : undefined;
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
      if (h && (((n + 3) % 7) + 7) % 7 < 5) hol.push([isoOf(n), h]);
      if ((((n + 3) % 7) + 7) % 7 >= 5) we = true;
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
    <Modal
      open
      onClose={onClose}
      title={title}
      subtitle={person ? `${person.name} · ${tr(person.role)} · ${mg.LV[person.level]}` : tr('Por atribuir')}
      closeLabel={tr('Fechar')}
      className="al-dlg"
      footer={
        <>
          {onDelete && (
            <button type="button" className="al-btn danger al-dlg-del" onClick={onDelete}>
              {tr('Eliminar')}
            </button>
          )}
          <button type="button" className="al-btn ghost" onClick={onClose}>
            {tr('Cancelar')}
          </button>
          <button type="submit" form={formId} className="al-btn" disabled={!ok}>
            {tr(isNew ? 'Criar alocação' : 'Guardar')}
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="al-form"
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
        <div className="al-grid2">
          <Fld label={tr('Pessoa')}>
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
          </Fld>
          <Fld label={tr('Projeto')}>
            <select
              className="al-in"
              value={b.project}
              onChange={(e) => set({ project: e.target.value })}
              aria-label={tr('Projeto')}
              data-autofocus={isNew && !b.project ? '' : undefined}
            >
              {!b.project && <option value="">—</option>}
              {mg.PJ.filter((p) => p.status !== 'Concluído' || p.id === b.project).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </Fld>
          <Fld label={tr('De')}>
            <DateField
              value={b.from}
              onChange={(from) => set({ from })}
              label={tr('De')}
              pickLabel={tr('Escolher no calendário')}
            />
          </Fld>
          <Fld label={tr('Até')} hint={eq ? tr(`${eq.days} dias úteis`) : undefined}>
            <DateField
              value={b.to}
              min={b.from}
              onChange={(to) => set({ to })}
              label={tr('Até')}
              pickLabel={tr('Escolher no calendário')}
            />
          </Fld>
        </div>
        <Fld as="div" label={tr('Esforço')} hint={tr('escreva num dos campos, os outros acompanham')}>
          <div className="al-eff" role="group" aria-label={tr('Esforço')}>
            {MODES.map(([m, l, u]) => (
              <label key={m} className={b.mode === m ? 'on' : ''}>
                <span className="k">{tr(l)}</span>
                <span className="v">
                  <input
                    inputMode="decimal"
                    value={shown(m)}
                    aria-label={tr(l)}
                    data-mode={m}
                    onFocus={() => switchMode(m)}
                    onChange={(e) => typeIn(m, e.target.value)}
                    data-autofocus={!!b.project && m === b.mode ? '' : undefined}
                  />
                  {u && <i>{u}</i>}
                </span>
              </label>
            ))}
          </div>
        </Fld>
        <div className="al-grid2 al-grid2--wd">
          <Fld as="div" label={tr('Dias da semana')}>
            <div className="al-wd" role="group" aria-label={tr('Dias da semana')}>
              {(en ? WD_EN : WD).map((d, i) => (
                <button
                  key={i}
                  type="button"
                  className="wdb"
                  aria-pressed={(b.mask & (1 << i)) !== 0}
                  title={tr(WD_LONG[i]!)}
                  aria-label={tr(WD_LONG[i]!)}
                  onClick={() => {
                    const m = b.mask ^ (1 << i);
                    if (m & AL_MASK_ALL) set({ mask: m });
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </Fld>
          <Fld as="div" label={tr('Estado')}>
            <Segmented
              label={tr('Estado')}
              value={b.status}
              onChange={(status) => set({ status })}
              options={[
                { value: 'confirmed', label: tr('Confirmado') },
                { value: 'tentative', label: tr('Tentativo') },
              ]}
            />
          </Fld>
        </div>
        <Fld label={b.person ? tr('Função') : tr('Função a preencher')}>
          <input
            className="al-in"
            value={b.role}
            maxLength={120}
            list="al-role-sugg"
            placeholder={b.person ? tr('ex.: Líder FI-GL / AA') : tr('ex.: Consultor FI · Sénior')}
            onChange={(e) => set({ role: e.target.value })}
            aria-label={b.person ? tr('Função') : tr('Função a preencher')}
          />
          <datalist id="al-role-sugg">
            {roleSugg.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Fld>
        {!b.person && (
          <div className="al-grid2">
            <Fld label={tr('Competência pedida')}>
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
            </Fld>
            <Fld label={tr('Nível mínimo')}>
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
            </Fld>
          </div>
        )}
        {conflict && (
          <div className="al-warn" role="alert">
            <span className="ic">!</span>
            <div className="tx">
              <b>
                {tr(`Sobre-alocação em ${conflict.days.length} dias`)} ({fmtD(isoOf(conflict.days[0]!))}
                {conflict.days.length > 1 ? ` – ${fmtD(isoOf(conflict.days.at(-1)!))}` : ''})
              </b>
              <span>
                {person?.name}{' '}
                {tr(
                  `chega a ${fmtNum(conflict.peak, lang)}h/dia (capacidade ${fmtNum(conflict.peakCap, lang)}h).`,
                )}{' '}
                {tr('É só um aviso: pode manter assim.')}
              </span>
              <div className="acts">
                {conflict.startFree && conflict.startFree <= b.to && (
                  <button type="button" className="al-act" onClick={() => set({ from: conflict.startFree })}>
                    {tr(`começar a ${fmtD(conflict.startFree)}`)}
                  </button>
                )}
                {conflict.fits > 0 && (
                  <button
                    type="button"
                    className="al-act"
                    onClick={() => {
                      set({ mode: 'hpd', value: conflict.fits });
                      setTyped(fmtNum(conflict.fits, lang));
                    }}
                  >
                    {tr(`só o que cabe (${fmtNum(conflict.fits, lang)}h/dia)`)}
                  </button>
                )}
                <button type="button" className="al-act" onClick={() => set({ status: 'tentative' })}>
                  {tr('Passar a tentativo')}
                </button>
              </div>
            </div>
          </div>
        )}
        {notes.hol.length > 0 && (
          <div className="al-warn soft" role="note">
            <span className="ic">!</span>
            <div className="tx">
              <span>
                {tr('Inclui feriado')}:{' '}
                {notes.hol.map(([d, k]) => `${fmtD(d)} (${holidayName(k, lang)})`).join(', ')}
                {' — '}
                {b.hol ? tr('conta como dia de trabalho (capacidade 0).') : tr('não conta.')}
              </span>
              <div className="acts">
                <button type="button" className="al-act" onClick={() => set({ hol: !b.hol })}>
                  {b.hol ? tr('não trabalhar no feriado') : tr('trabalhar no feriado')}
                </button>
              </div>
            </div>
          </div>
        )}
        {notes.abs.length > 0 && (
          <div className="al-warn soft" role="note">
            <span className="ic">!</span>
            <div className="tx">
              <span>
                {notes.abs
                  .map((a) => `${tr(ABS_LABEL[a.type] ?? a.type)} ${fmtD(a.from)} → ${fmtD(a.to)}`)
                  .join(' · ')}
                {' — '}
                {tr('esses dias não contam.')}
              </span>
            </div>
          </div>
        )}
        {notes.we && (
          <span className="al-note">
            {tr('Inclui fins de semana (ex.: cutover) — capacidade 0, conta como extra.')}
          </span>
        )}
      </form>
    </Modal>
  );
}

/** Marking an absence (vacation, sickness, training, other) — the manager marks it, no approval. */
export function AbsencePop({
  mg,
  draft,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  mg: Mg;
  draft: Absence;
  isNew: boolean;
  onClose: () => void;
  onSave: (a: Absence) => void;
  onDelete?: () => void;
}) {
  const { tr } = mg;
  const formId = useId();
  const [a, setA] = useState(draft);
  const set = (p: Partial<Absence>) => setA((o) => ({ ...o, ...p }));
  const p = mg.pById[a.person];
  const ok = !!a.person && isIsoDay(a.from) && isIsoDay(a.to) && a.from <= a.to;
  const title = isNew ? tr('Marcar ausência') : tr('Ausência');
  const affected = ok
    ? mg.BK.filter(
        (b) => b.person === a.person && b.from <= a.to && b.to >= a.from && b.status === 'confirmed',
      )
    : [];
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      subtitle={p ? `${p.name} · ${tr(p.role)}` : tr('Escolha a pessoa')}
      closeLabel={tr('Fechar')}
      className="al-dlg al-dlg--abs"
      footer={
        <>
          {onDelete && (
            <button type="button" className="al-btn danger al-dlg-del" onClick={onDelete}>
              {tr('Eliminar')}
            </button>
          )}
          <button type="button" className="al-btn ghost" onClick={onClose}>
            {tr('Cancelar')}
          </button>
          <button type="submit" form={formId} className="al-btn" disabled={!ok}>
            {tr(isNew ? 'Marcar' : 'Guardar')}
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="al-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onSave(a);
        }}
      >
        <Fld label={tr('Pessoa')}>
          <select
            className="al-in"
            value={a.person}
            onChange={(e) => set({ person: e.target.value })}
            data-autofocus={!a.person ? '' : undefined}
          >
            {!a.person && <option value="">—</option>}
            {mg.ALLP.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Fld>
        <Fld as="div" label={tr('Tipo')}>
          <div className="al-types" role="group" aria-label={tr('Tipo')}>
            {ABS_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className="al-type"
                aria-pressed={a.type === t}
                onClick={() => set({ type: t })}
                data-autofocus={a.person && a.type === t ? '' : undefined}
              >
                {tr(ABS_TYPE_LABEL[t]!)}
              </button>
            ))}
          </div>
        </Fld>
        <div className="al-grid2">
          <Fld label={tr('De')}>
            <DateField
              value={a.from}
              onChange={(from) => set({ from })}
              label={tr('De')}
              pickLabel={tr('Escolher no calendário')}
            />
          </Fld>
          <Fld label={tr('Até')}>
            <DateField
              value={a.to}
              min={a.from}
              onChange={(to) => set({ to })}
              label={tr('Até')}
              pickLabel={tr('Escolher no calendário')}
            />
          </Fld>
        </div>
        <div className="al-grid2">
          <Fld as="div" label={tr('Duração')}>
            <Segmented
              label={tr('Duração')}
              value={a.hours == null ? 'day' : 'part'}
              onChange={(v) => set({ hours: v === 'day' ? null : (a.hours ?? 4) })}
              options={[
                { value: 'day', label: tr('Dia inteiro') },
                { value: 'part', label: tr('Parte do dia') },
              ]}
            />
          </Fld>
          {a.hours != null && (
            <Fld label={tr('Horas por dia')}>
              <span className="al-unit">
                <input
                  className="al-in mono"
                  inputMode="decimal"
                  value={fmtNum(a.hours, mg.lang)}
                  aria-label={tr('Horas por dia')}
                  onChange={(e) => {
                    const v = roundStep(Number(e.target.value.replace(',', '.')));
                    if (Number.isFinite(v)) set({ hours: Math.min(24, Math.max(0.5, v)) });
                  }}
                />
                <i>h</i>
              </span>
            </Fld>
          )}
        </div>
        <Fld label={tr('Nota')}>
          <input
            className="al-in"
            value={a.note}
            maxLength={500}
            placeholder={tr('Opcional')}
            onChange={(e) => set({ note: e.target.value })}
          />
        </Fld>
        {affected.length > 0 && (
          <span className="al-note">
            {tr('Nesses dias não contam')}: {affected.map((b) => mg.pjById[b.project]?.code).join(', ')}
          </span>
        )}
      </form>
    </Modal>
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

/** 'YYYY-MM-DD' from what was typed: dd/mm/aaaa, d-m-aa or ISO; null when it is not a day. */
export function parseDay(s: string): string | null {
  const t = s.trim();
  let y: number;
  let m: number;
  let d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const pt = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (iso) [y, m, d] = [+iso[1]!, +iso[2]!, +iso[3]!];
  else if (pt) [d, m, y] = [+pt[1]!, +pt[2]!, pt[3]!.length === 2 ? 2000 + +pt[3]! : +pt[3]!];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}
const fmtField = (s: string) => (isIsoDay(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');

/** A day typed as dd/mm/aaaa (whatever the browser's language), with the browser's calendar next to it. */
export function DateField({
  value,
  onChange,
  label,
  min,
  pickLabel,
}: {
  value: string;
  onChange: (iso: string) => void;
  label: string;
  min?: string;
  pickLabel: string;
}) {
  const [txt, setTxt] = useState(fmtField(value));
  const pick = useRef<HTMLInputElement>(null);
  useEffect(() => setTxt(fmtField(value)), [value]);
  return (
    <span className="al-date">
      <input
        className="al-in mono"
        value={txt}
        aria-label={label}
        placeholder="dd/mm/aaaa"
        inputMode="numeric"
        onChange={(e) => {
          setTxt(e.target.value);
          const d = parseDay(e.target.value);
          if (d) onChange(d);
        }}
        onBlur={() => setTxt(fmtField(value))}
      />
      <button
        type="button"
        className="al-date-btn"
        aria-label={pickLabel}
        title={pickLabel}
        onClick={() => {
          const el = pick.current;
          try {
            el?.showPicker();
          } catch {
            el?.focus();
          }
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </button>
      <input
        ref={pick}
        type="date"
        tabIndex={-1}
        aria-hidden
        className="al-date-native"
        value={value}
        min={min}
        onChange={(e) => isIsoDay(e.target.value) && onChange(e.target.value)}
      />
    </span>
  );
}
