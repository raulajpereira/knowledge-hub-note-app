'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { Popover } from '@/components/ui';
import { fmtDue, localDay } from '@/lib/tasks';
import {
  isDone,
  PRIORITY_COLOR,
  STATUS_COLOR,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketPriority,
  type TicketStatus,
} from '@/lib/tickets';

// Small pieces shared by the Tickets screen and its Home card: the coloured
// chips (status, priority), the due date (red when overdue), a chip picker
// and the "pick from Management or type a name" field.

export type Ticket = {
  id: string;
  folderId: string | null;
  sharedFolderId: string | null;
  mine: boolean;
  number: string;
  summary: string;
  parentNumber: string;
  parentSummary: string;
  clientId: string | null;
  clientName: string;
  priority: TicketPriority;
  typeId: string | null;
  status: TicketStatus;
  responsibleId: string | null;
  responsibleName: string;
  openedAt: string;
  dueOn: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type TicketType = { id: string; name: string; sort: number };
export type TicketEvent = {
  id: string;
  kind: 'created' | 'comment' | 'status' | 'priority' | 'responsible';
  from: string;
  to: string;
  body: string;
  author: string;
  mine: boolean;
  at: string;
};
export type TicketFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
  author: string;
  mine: boolean;
  createdAt: string;
};

export const STATUSES = TICKET_STATUSES;
export const PRIORITIES = [...TICKET_PRIORITIES].reverse() as TicketPriority[];
export const statusLabel = (t: (k: string) => string, s: string) => t(`tks_${s}`);
export const prioLabel = (t: (k: string) => string, p: string) => t(`tkp_${p}`);
export const tint = (c: string, a = 0.2) => c.replace(')', ` / ${a})`);

export function Chip({ label, color, strong }: { label: string; color: string; strong?: boolean }) {
  return (
    <span
      className="kh-tkt-chip"
      data-strong={strong || undefined}
      style={{ background: tint(color, strong ? 0.3 : 0.18), borderColor: tint(color, 0.45) }}
    >
      <span style={{ background: color }} />
      {label}
    </span>
  );
}
export function StatusChip({ s }: { s: TicketStatus }) {
  const { t } = useI18n();
  return <Chip label={statusLabel(t, s)} color={STATUS_COLOR[s]} />;
}
export function PrioChip({ p }: { p: TicketPriority }) {
  const { t } = useI18n();
  return <Chip label={prioLabel(t, p)} color={PRIORITY_COLOR[p]} strong={p === 'very_high'} />;
}

/** Overdue: a due date before today on a ticket that is still open. */
export const overdue = (x: Pick<Ticket, 'dueOn' | 'status'>, today = localDay(new Date())) =>
  !!x.dueOn && x.dueOn < today && !isDone(x.status);

export function Due({ x }: { x: Pick<Ticket, 'dueOn' | 'status'> }) {
  const { t } = useI18n();
  if (!x.dueOn) return <span className="kh-tkt-dim">—</span>;
  const late = overdue(x);
  return (
    <span className="kh-tkt-due" data-late={late || undefined} title={late ? t('tk_overdue') : undefined}>
      {late && (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      )}
      {fmtDue(x.dueOn)}
    </span>
  );
}

export const Ico = ({ d, s = 15, w = 1.9 }: { d: string; s?: number; w?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={w}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: d }}
  />
);
export const I = {
  search: '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
  x: '<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>',
  trash: '<path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path>',
  gear: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
  share:
    '<circle cx="18" cy="5" r="2.5"></circle><circle cx="6" cy="12" r="2.5"></circle><circle cx="18" cy="19" r="2.5"></circle><path d="M8.2 10.8l7.6-4.4"></path><path d="M8.2 13.2l7.6 4.4"></path>',
  more: '<circle cx="5" cy="12" r="1.2"></circle><circle cx="12" cy="12" r="1.2"></circle><circle cx="19" cy="12" r="1.2"></circle>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"></path>',
  chev: '<path d="M6 9l6 6 6-6"></path>',
  clip: '<path d="M21 11.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.3 3.3 0 0 1 4.7 4.7l-9 9a1.7 1.7 0 0 1-2.4-2.4l8.3-8.3"></path>',
  file: '<path d="M7 3h7l5 5v13H7z"></path><path d="M14 3v5h5"></path>',
  down: '<path d="M12 4v11"></path><path d="M7 10l5 5 5-5"></path><path d="M5 20h14"></path>',
  clock: '<circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l3 2"></path>',
  up: '<path d="M6 15l6-6 6 6"></path>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"></path>',
  comment: '<path d="M5 5h14v10H9l-4 4z"></path>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"></rect><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"></path>',
};

/** A chip that opens a list of coloured options (status, priority). */
export function ChipSelect<V extends string>({
  value,
  options,
  label,
  render,
  colorOf,
  disabled,
  onChange,
}: {
  value: V;
  options: readonly V[];
  label: string;
  render: (v: V) => React.ReactNode;
  colorOf: (v: V) => string;
  disabled?: boolean;
  onChange: (v: V) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="kh-tkt-pick"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        style={{ background: tint(colorOf(value), 0.22), borderColor: tint(colorOf(value), 0.55) }}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className="kh-tkt-dot"
          style={{ background: colorOf(value), boxShadow: `0 0 8px ${colorOf(value)}` }}
        />
        <span>{render(value)}</span>
        {!disabled && <Ico d={I.chev} s={12} w={2.6} />}
      </button>
      {open && (
        <Popover
          anchor={ref}
          align="left"
          onClose={() => setOpen(false)}
          className="kh-ot-menu kh-tkt-menu"
          width={240}
          maxHeight={380}
          role="listbox"
          aria-label={label}
        >
          {options.map((o) => (
            <button
              key={o}
              type="button"
              role="option"
              aria-selected={o === value}
              onClick={() => {
                setOpen(false);
                if (o !== value) onChange(o);
              }}
            >
              <span className="kh-tkt-dot" style={{ background: colorOf(o) }} />
              <span className="kh-ot-ol">{render(o)}</span>
              {o === value && <Ico d={I.check} s={13} w={2.6} />}
            </button>
          ))}
        </Popover>
      )}
    </>
  );
}

/**
 * Cliente / Responsável: pick a Management record (when there is one) or keep
 * a free name. Typing filters the records; Enter or "Usar “x”" keeps the name.
 */
export function PartyField({
  label,
  value,
  linked,
  options,
  disabled,
  onPick,
  onName,
}: {
  label: string;
  value: string;
  /** the value is a Management record */
  linked: boolean;
  options: Array<{ id: string; name: string }>;
  disabled?: boolean;
  onPick: (o: { id: string; name: string }) => void;
  onName: (name: string) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  useEffect(() => setQ(value), [value]);
  const s = q.trim().toLowerCase();
  const hits = useMemo(
    () => options.filter((o) => !s || o.name.toLowerCase().includes(s)).slice(0, 8),
    [options, s],
  );
  const exact = options.find((o) => o.name.toLowerCase() === s);
  const commit = () => {
    setOpen(false);
    const v = q.trim();
    if (v === value.trim()) return;
    if (exact) onPick(exact);
    else onName(v);
  };
  return (
    <div className="kh-tkt-party" data-tag={value ? '' : undefined}>
      <input
        ref={ref}
        className="kh-sap-input"
        value={q}
        maxLength={120}
        disabled={disabled}
        placeholder={t('tk_pickOrType')}
        aria-label={label}
        aria-autocomplete="list"
        aria-controls={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
            ref.current?.blur();
          } else if (e.key === 'Escape') {
            setQ(value);
            setOpen(false);
          }
        }}
        onBlur={() => setTimeout(commit, 120)}
      />
      {value && (
        <span className="kh-tkt-party__tag" data-linked={linked || undefined}>
          {linked ? t('tk_fromMg') : t('tk_freeName')}
        </span>
      )}
      {open && !disabled && (hits.length > 0 || s) && (
        <div className="kh-tkt-party__list" id={id} role="listbox" aria-label={label}>
          {hits.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={linked && o.name === value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQ(o.name);
                setOpen(false);
                onPick(o);
              }}
            >
              <span className="kh-tkt-party__mg">MG</span>
              {o.name}
            </button>
          ))}
          {s && !exact && (
            <button
              type="button"
              role="option"
              aria-selected={false}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                onName(q.trim());
              }}
            >
              <Ico d={I.pen} s={13} />
              {t('tk_useName').replace('{x}', q.trim())}
            </button>
          )}
          {value && (
            <button
              type="button"
              role="option"
              aria-selected={false}
              className="kh-tkt-party__clear"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQ('');
                setOpen(false);
                onName('');
              }}
            >
              <Ico d={I.x} s={12} />
              {t('tk_clear')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export const fmtSize = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${(n / 1024).toFixed(0)} KB`
      : `${(n / 1024 / 1024).toFixed(1)} MB`;

/** ISO ↔ the value of <input type="datetime-local"> (local time). */
export const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
