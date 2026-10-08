'use client';

import { cloneElement, useId } from 'react';
import { useI18n } from '@/i18n/client';

// Building blocks of the Admin Console (prototype table, chips, drawer).

export const useA = () => {
  const { tAdmin, lang } = useI18n();
  return { A: (s: string) => tAdmin(s), lang };
};

export const eur = (n: number) =>
  `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 }).format(Math.round(n))} €`;
export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};
export const fmtStamp = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const daysTo = (iso: string | null) =>
  iso ? Math.round((Date.parse(iso) - Date.now()) / 86_400_000) : null;

const hue = (s: string) => [...(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
export const avColor = (s: string) => `oklch(0.55 0.09 ${hue(s)})`;
export const initials = (n: string) =>
  (n || '?')
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

export function Avatar({ name, square }: { name: string; square?: boolean }) {
  return (
    <span
      className="kh-ad-av"
      aria-hidden="true"
      style={{ background: avColor(name), borderRadius: square ? 10 : '50%' }}
    >
      {initials(name)}
    </span>
  );
}

export const CLIENT_ST: Record<string, [string, string]> = {
  active: ['Ativo', 'oklch(0.75 0.13 150 / .45)'],
  trial: ['Trial', 'oklch(0.75 0.12 245 / .5)'],
  past_due: ['Em atraso', 'oklch(0.72 0.15 50 / .55)'],
  canceled: ['Cancelado', 'rgba(255,255,255,.14)'],
  suspended: ['Suspenso', 'oklch(0.66 0.17 25 / .5)'],
};
export const USER_ST: Record<string, [string, string]> = {
  active: ['Ativo', 'oklch(0.75 0.13 150 / .45)'],
  invited: ['Convidado', 'oklch(0.75 0.12 245 / .5)'],
  disabled: ['Desativado', 'rgba(255,255,255,.14)'],
  paused: ['Pausado', 'oklch(0.72 0.15 50 / .55)'],
};
export const CODE_ST: Record<string, [string, string]> = {
  active: ['Ativo', 'oklch(0.75 0.13 150 / .45)'],
  paused: ['Pausado', 'oklch(0.72 0.15 50 / .55)'],
  expired: ['Expirado', 'rgba(255,255,255,.14)'],
  revoked: ['Revogado', 'oklch(0.66 0.17 25 / .5)'],
};
export const CODE_TY: Record<string, [string, string]> = {
  invite: ['Convite', 'oklch(0.75 0.12 245 / .5)'],
  license: ['Licença', 'oklch(0.75 0.13 150 / .45)'],
};

export function StatusChip({ map, value }: { map: Record<string, [string, string]>; value: string }) {
  const { A } = useA();
  const [l, c] = map[value] ?? [value, 'rgba(255,255,255,.14)'];
  return (
    <span className="kh-ad-st" style={{ background: c }}>
      {A(l)}
    </span>
  );
}

export function PlanChip({ plan }: { plan: { code: string; color: string | null } | null }) {
  const { A } = useA();
  if (!plan) return <span className="kh-ad-td__sub">—</span>;
  const custom = plan.code === 'CUSTOM';
  return (
    <span
      className="kh-ad-plan"
      style={{
        background: custom
          ? 'linear-gradient(135deg,#b8e0ff,#d8c4ff)'
          : (plan.color ?? 'rgba(255,255,255,.3)'),
      }}
    >
      {custom ? A('INDIVIDUAL') : plan.code}
    </span>
  );
}

export function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <>
      <span className="kh-ad-mono" style={{ fontSize: 12.5 }}>
        {label}
      </span>
      <div className="kh-ad-bar" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <div style={{ width: `${pct}%` }} />
      </div>
    </>
  );
}

export type Col<T> = { label: string; cell: (r: T) => React.ReactNode; row?: boolean };

/** The prototype's table: sticky glass header, rows on a grid, optional click. */
export function Table<T>({
  cols,
  grid,
  minW,
  rows,
  rowKey,
  onRow,
  empty,
  label,
}: {
  cols: Col<T>[];
  grid: string;
  minW: number;
  rows: T[];
  rowKey: (r: T) => string;
  onRow?: (r: T) => void;
  empty?: string;
  label: string;
}) {
  const { A } = useA();
  return (
    <div className="kh-ad-table" role="table" aria-label={label}>
      <div className="kh-ad-table__in" style={{ ['--min-w' as string]: `${minW}px` }}>
        <div className="kh-ad-tr kh-ad-tr--head" role="row" style={{ ['--cols' as string]: grid }}>
          {cols.map((c, i) => (
            <div key={i} className="kh-ad-td" role="columnheader">
              {c.label}
            </div>
          ))}
        </div>
        {rows.map((r) => (
          <div
            key={rowKey(r)}
            className="kh-ad-tr"
            role="row"
            style={{ ['--cols' as string]: grid }}
            data-click={onRow ? '' : undefined}
            tabIndex={onRow ? 0 : undefined}
            onClick={onRow ? () => onRow(r) : undefined}
            onKeyDown={
              onRow
                ? (e) => {
                    if (e.key === 'Enter' && e.target === e.currentTarget) onRow(r);
                  }
                : undefined
            }
          >
            {cols.map((c, i) => (
              <div key={i} className={`kh-ad-td${c.row ? ' kh-ad-td--row' : ''}`} role="cell">
                {c.cell(r)}
              </div>
            ))}
          </div>
        ))}
        {!rows.length && <div className="kh-ad-empty">{empty ?? A('Sem resultados.')}</div>}
      </div>
    </div>
  );
}

export function Cell({ main, sub, mono }: { main: React.ReactNode; sub?: React.ReactNode; mono?: boolean }) {
  return (
    <>
      <span className={`kh-ad-td__main${mono ? ' kh-ad-mono' : ''}`}>{main}</span>
      {sub !== undefined && sub !== '' && <span className="kh-ad-td__sub">{sub}</span>}
    </>
  );
}

export function Chips<V extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ v: V; l: string; n?: number; dot?: string }>;
  value: V;
  onChange: (v: V) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          className="kh-ad-chip"
          aria-pressed={value === o.v}
          onClick={() => onChange(o.v)}
        >
          {o.dot && <span className="kh-ad-dot" style={{ background: o.dot }} />}
          {o.l}
          {o.n !== undefined && <span className="kh-ad-chip__n">{o.n}</span>}
        </button>
      ))}
    </div>
  );
}

/** Label + control, linked by id (the label's text alone is the control's name). */
export function Field({ label, children }: { label: string; children: React.ReactElement<{ id?: string }> }) {
  const id = useId();
  return (
    <div className="kh-ad-field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}

export function DrawerHead({ title, sub, onClose }: { title: string; sub?: string; onClose: () => void }) {
  const { A } = useA();
  return (
    <div className="kh-ad-drawer__head">
      <div style={{ minWidth: 0 }}>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      <button
        type="button"
        className="kh-ad-x"
        onClick={onClose}
        aria-label={A('Fechar')}
        title={A('Fechar')}
      >
        ×
      </button>
    </div>
  );
}
