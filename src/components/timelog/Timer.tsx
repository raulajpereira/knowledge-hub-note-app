'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { Modal, Select, Switch, useToast } from '@/components/ui';
import { fmtClock, fmtMinutes, roundUp15 } from '@/lib/timelog';
import './timelog.css';

// "Registar horas": the header button. Idle it opens the start dialog
// (ticket / client / project / description); running it shows the clock and
// opens the stop dialog. The running entry lives on the server, so the clock
// survives reloads and other devices. Every full hour a card asks whether you
// are still on it (the worker also sends a notification / push).

export type TimeEntry = {
  id: string;
  refKind: 'ticket' | 'issue' | null;
  refId: string | null;
  refLabel: string;
  clientId: string | null;
  clientLabel: string;
  projectId: string | null;
  projectLabel: string;
  description: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number | null;
  inTimesheet: boolean;
  tsState: string | null;
};
export type TimeOptions = {
  clients: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; code: string; name: string; clientId: string | null }>;
  recent: TimeEntry[];
  timesheet: boolean;
};
type Ref = { kind: 'ticket' | 'issue'; id: string; label: string; sub: string };
export type TimeForm = {
  refKind: 'ticket' | 'issue' | null;
  refId: string | null;
  refLabel: string;
  clientId: string | null;
  clientLabel: string;
  projectId: string | null;
  description: string;
};
export const EMPTY_FORM: TimeForm = {
  refKind: null,
  refId: null,
  refLabel: '',
  clientId: null,
  clientLabel: '',
  projectId: null,
  description: '',
};
export const TIMER_EVENT = 'kh:timer';
export const tzQ = () => {
  try {
    return `tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`;
  } catch {
    return 'tz=Europe/Lisbon';
  }
};
export const formOf = (e: TimeEntry): TimeForm => ({
  refKind: e.refKind,
  refId: e.refId,
  refLabel: e.refLabel,
  clientId: e.clientId,
  clientLabel: e.clientLabel,
  projectId: e.projectId,
  description: e.description,
});
/** What the server takes: a picked item by id, free text by label. */
export const payloadOf = (f: TimeForm) => ({
  refKind: f.refId ? f.refKind : null,
  refId: f.refId,
  refLabel: f.refLabel.trim(),
  clientId: f.clientId,
  clientLabel: f.clientLabel.trim(),
  projectId: f.projectId,
  description: f.description.trim(),
});

let optCache: { at: number; p: Promise<TimeOptions> } | null = null;
export function useTimeOptions(open: boolean) {
  const [o, setO] = useState<TimeOptions | null>(null);
  useEffect(() => {
    if (!open) return;
    if (!optCache || Date.now() - optCache.at > 20_000)
      optCache = { at: Date.now(), p: api<TimeOptions>('/timelog/options') };
    let on = true;
    optCache.p
      .then((v) => on && setO(v))
      .catch(() => on && setO({ clients: [], projects: [], recent: [], timesheet: false }));
    return () => {
      on = false;
    };
  }, [open]);
  return o;
}

const ICON = {
  play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"></path>',
  rec: '<circle cx="12" cy="12" r="7" fill="currentColor" stroke="none"></circle>',
};
const Ico = ({ d }: { d: string }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: d }}
  />
);

/** A text field with suggestions below (the ticket and the client): picking one fills it, typing makes it free text. */
function Suggest<T extends { key: string; label: string; sub?: string; tag?: string }>({
  id,
  label,
  value,
  placeholder,
  items,
  onType,
  onPick,
  freeLabel,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  items: T[];
  onType: (v: string) => void;
  onPick: (x: T) => void;
  freeLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(0);
  const all = items.slice(0, 7);
  const n = all.length + (freeLabel ? 1 : 0);
  return (
    <div className="kh-field kh-tl-sug">
      <label className="kh-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="kh-input"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && n > 0}
        aria-controls={`${id}-list`}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          onType(e.target.value);
          setOpen(true);
          setAct(0);
        }}
        onKeyDown={(e) => {
          if (!open || !n) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAct((a) => (a + 1) % n);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setAct((a) => (a - 1 + n) % n);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (act < all.length) onPick(all[act]!);
            setOpen(false);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {open && n > 0 && (
        <div className="kh-tl-sug__list" role="listbox" id={`${id}-list`}>
          {all.map((x, i) => (
            <button
              key={x.key}
              type="button"
              role="option"
              aria-selected={i === act}
              data-on={i === act || undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(x);
                setOpen(false);
              }}
            >
              <span className="kh-tl-sug__l">{x.label}</span>
              {x.sub && <span className="kh-tl-sug__s">{x.sub}</span>}
              {x.tag && <span className="kh-tl-sug__k">{x.tag}</span>}
            </button>
          ))}
          {freeLabel && (
            <button
              type="button"
              role="option"
              aria-selected={act === all.length}
              data-on={act === all.length || undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpen(false)}
            >
              <span className="kh-tl-sug__l">{freeLabel}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Ticket / client / project / description — the start dialog and the manual entry. */
export function TimeFields({
  form,
  set,
  opts,
  autoFocus,
}: {
  form: TimeForm;
  set: (p: Partial<TimeForm>) => void;
  opts: TimeOptions | null;
  autoFocus?: boolean;
}) {
  const { t } = useI18n();
  const [refs, setRefs] = useState<Ref[]>([]);
  const q = form.refId ? '' : form.refLabel.trim();
  useEffect(() => {
    let on = true;
    const h = setTimeout(() => {
      api<{ refs: Ref[] }>(`/timelog/refs?q=${encodeURIComponent(q)}`)
        .then((r) => on && setRefs(r.refs))
        .catch(() => {});
    }, 180);
    return () => {
      on = false;
      clearTimeout(h);
    };
  }, [q]);
  const first = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (autoFocus) first.current?.querySelector('input')?.focus();
  }, [autoFocus]);
  const clients = (opts?.clients ?? []).filter(
    (c) => !form.clientLabel.trim() || c.name.toLowerCase().includes(form.clientLabel.trim().toLowerCase()),
  );
  const projects = (opts?.projects ?? []).filter(
    (p) => !form.clientId || !p.clientId || p.clientId === form.clientId,
  );
  return (
    <div className="kh-tl-grid">
      <div className="kh-tl-full" ref={first}>
        <Suggest
          id="kh-tl-ref"
          label={t('tl_ref')}
          value={form.refLabel}
          placeholder={t('tl_refPh')}
          items={refs.map((r) => ({
            ...r,
            key: `${r.kind}:${r.id}`,
            tag: t(r.kind === 'ticket' ? 'tl_kTicket' : 'tl_kIssue'),
          }))}
          onType={(v) => set({ refLabel: v, refId: null, refKind: null })}
          onPick={(r) => set({ refKind: r.kind, refId: r.id, refLabel: r.label })}
          freeLabel={q ? t('tl_free').replace('{x}', q) : undefined}
        />
      </div>
      <Suggest
        id="kh-tl-client"
        label={t('tl_client')}
        value={form.clientLabel}
        placeholder={t('tl_clientPh')}
        items={clients.map((c) => ({ key: c.id, label: c.name }))}
        onType={(v) => set({ clientLabel: v, clientId: null })}
        onPick={(c) => {
          const p = (opts?.projects ?? []).find((x) => x.id === form.projectId);
          set({
            clientId: c.key,
            clientLabel: c.label,
            ...(p?.clientId && p.clientId !== c.key ? { projectId: null } : {}),
          });
        }}
      />
      <div className="kh-field">
        <span className="kh-field__label">{t('tl_project')}</span>
        <Select
          aria-label={t('tl_project')}
          searchPlaceholder={t('tl_project')}
          value={form.projectId ?? ''}
          options={[
            { value: '', label: t('tl_noProject') },
            ...projects.map((p) => ({ value: p.id, label: [p.code, p.name].filter(Boolean).join(' · ') })),
          ]}
          onChange={(v) => {
            const p = (opts?.projects ?? []).find((x) => x.id === v);
            const c = p?.clientId ? opts?.clients.find((x) => x.id === p.clientId) : undefined;
            set({
              projectId: v || null,
              ...(c && !form.clientId ? { clientId: c.id, clientLabel: c.name } : {}),
            });
          }}
        />
      </div>
      <label className="kh-field kh-tl-full">
        <span className="kh-field__label">{t('tl_desc')}</span>
        <textarea
          className="kh-input kh-tl-ta"
          rows={3}
          maxLength={4000}
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </label>
    </div>
  );
}

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
const labelOf = (e: TimeEntry) =>
  [e.refLabel, e.clientLabel].filter(Boolean).join(' · ') || e.description || '—';

/** The header button + its dialog + the hourly card. */
export function TimerButton() {
  const { t } = useI18n();
  const toast = useToast();
  const [entry, setEntry] = useState<TimeEntry | null | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  const [mode, setMode] = useState<'start' | 'stop' | 'next' | null>(null);
  const [form, setForm] = useState<TimeForm>(EMPTY_FORM);
  const [desc, setDesc] = useState('');
  const [inTs, setInTs] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ack, setAck] = useState(0);
  const opts = useTimeOptions(mode !== null);

  const load = useCallback(() => {
    api<{ entry: TimeEntry | null }>('/timelog/running')
      .then((r) => setEntry(r.entry))
      .catch(() => setEntry(null));
  }, []);
  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener(TIMER_EVENT, on);
    window.addEventListener('focus', on);
    return () => {
      window.removeEventListener(TIMER_EVENT, on);
      window.removeEventListener('focus', on);
    };
  }, [load]);
  useEffect(() => {
    if (!entry) return;
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [entry]);
  // the hour already answered for this entry ("Sim, continuar")
  useEffect(() => {
    if (!entry) return;
    try {
      setAck(Number(sessionStorage.getItem(`kh.tl.ack.${entry.id}`) ?? 0) || 0);
    } catch {
      setAck(0);
    }
  }, [entry]);

  const secs = entry ? Math.max(0, (now - new Date(entry.startedAt).getTime()) / 1000) : 0;
  const hours = Math.floor(secs / 3600);
  const askHour = !!entry && hours >= 1 && hours > ack && mode === null;
  const answer = () => {
    if (!entry) return;
    try {
      sessionStorage.setItem(`kh.tl.ack.${entry.id}`, String(hours));
    } catch {
      /* private mode */
    }
    setAck(hours);
  };

  const openDialog = () => {
    if (entry) {
      setDesc(entry.description);
      setInTs(entry.inTimesheet);
      setMode('stop');
    } else {
      setForm(EMPTY_FORM);
      setMode('start');
    }
  };
  const fail = (e: unknown) =>
    toast({
      message: (e as { code?: string })?.code === 'timer_running' ? t('tl_busy') : t('tl_fail'),
      tone: 'error',
    });
  const changed = () => window.dispatchEvent(new Event(TIMER_EVENT));

  const start = async () => {
    setBusy(true);
    try {
      const r = await api<{ entry: TimeEntry }>('/timelog/start', payloadOf(form));
      setEntry(r.entry);
      setMode(null);
      changed();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const stop = async (next?: TimeForm) => {
    setBusy(true);
    try {
      const r = await api<{ stopped: TimeEntry; next: TimeEntry | null }>(`/timelog/stop?${tzQ()}`, {
        description: desc.trim(),
        inTimesheet: inTs,
        ...(next ? { next: payloadOf(next) } : {}),
      });
      toast({ message: t('tl_saved').replace('{d}', fmtMinutes(r.stopped.minutes ?? 15)), tone: 'success' });
      setEntry(r.next);
      setMode(null);
      changed();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  if (entry === undefined) return null;
  return (
    <>
      <button
        type="button"
        className="kh-tl-btn"
        data-run={entry ? true : undefined}
        onClick={openDialog}
        aria-haspopup="dialog"
        title={entry ? labelOf(entry) : t('tl_btn')}
        aria-label={entry ? `${t('tl_run_t')} · ${fmtClock(secs)} · ${labelOf(entry)}` : t('tl_btn')}
      >
        <i>
          <Ico d={entry ? ICON.rec : ICON.play} />
        </i>
        {entry ? (
          <>
            <span className="kh-tl-btn__clk">{fmtClock(secs)}</span>
            <span className="kh-tl-btn__sub">{labelOf(entry)}</span>
          </>
        ) : (
          <span className="kh-tl-btn__lbl">{t('tl_btn')}</span>
        )}
      </button>

      {askHour && entry && (
        <div
          className="kh-popover kh-tl-hour"
          role="alertdialog"
          aria-label={t('tl_hourQ').replace('{x}', labelOf(entry))}
        >
          <b>
            {t('tl_hourQ').replace('{x}', entry.refLabel || entry.clientLabel || entry.description || '—')}
          </b>
          <p>{t('tl_hourS').replace('{h}', fmtMinutes(Math.floor(secs / 60)))}</p>
          <div>
            <button
              type="button"
              className="kh-btn kh-btn--sm kh-btn--ghost"
              onClick={() => {
                answer();
                openDialog();
              }}
            >
              {t('tl_end')}
            </button>
            <button type="button" className="kh-btn kh-btn--sm kh-btn--primary" onClick={answer}>
              {t('tl_yes')}
            </button>
          </div>
        </div>
      )}

      <Modal
        open={mode === 'start' || mode === 'next'}
        onClose={() => setMode(mode === 'next' ? 'stop' : null)}
        title={t('tl_start_t')}
        subtitle={t('tl_start_s')}
        className="kh-tl-modal"
        closeLabel={t('ui_close')}
        footer={
          <div className="kh-tl-foot">
            <button
              type="button"
              className="kh-btn kh-btn--ghost"
              onClick={() => setMode(mode === 'next' ? 'stop' : null)}
            >
              {t('tl_cancel')}
            </button>
            <button
              type="button"
              className="kh-btn kh-btn--primary"
              disabled={busy}
              onClick={() => void (mode === 'next' ? stop(form) : start())}
            >
              ▶ {t('tl_startBtn')}
            </button>
          </div>
        }
      >
        <TimeFields form={form} set={(p) => setForm((f) => ({ ...f, ...p }))} opts={opts} autoFocus />
        {!!opts?.recent.length && (
          <div className="kh-tl-recent">
            <span>{t('tl_recent')}</span>
            {opts.recent.map((r) => (
              <button key={r.id} type="button" className="kh-chip" onClick={() => setForm(formOf(r))}>
                {[r.refLabel, r.clientLabel].filter(Boolean).join(' · ') || r.description || '—'}
              </button>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={mode === 'stop' && !!entry}
        onClose={() => setMode(null)}
        title={t('tl_run_t')}
        subtitle={entry ? t('tl_run_s').replace('{t}', hhmm(entry.startedAt)) : ''}
        className="kh-tl-modal"
        closeLabel={t('ui_close')}
        footer={
          <div className="kh-tl-foot">
            <button type="button" className="kh-btn kh-btn--ghost" onClick={() => setMode(null)}>
              {t('tl_continue')}
            </button>
            <span className="kh-tl-foot__sp" />
            <button
              type="button"
              className="kh-btn kh-btn--glass"
              disabled={busy}
              onClick={() => {
                setForm(EMPTY_FORM);
                setMode('next');
              }}
            >
              {t('tl_stopNext')}
            </button>
            <button
              type="button"
              className="kh-btn kh-btn--primary"
              disabled={busy}
              onClick={() => void stop()}
            >
              ■ {t('tl_stop')}
            </button>
          </div>
        }
      >
        {entry && (
          <>
            <div className="kh-tl-big" aria-live="off">
              {fmtClock(secs)}
            </div>
            <div className="kh-tl-meta">
              {[entry.refLabel, entry.clientLabel, entry.projectLabel].filter(Boolean).join(' · ')}
              {' · '}
              {t('tl_keeps').replace('{d}', fmtMinutes(roundUp15(secs)))}
            </div>
            <label className="kh-field">
              <span className="kh-field__label">{t('tl_desc')}</span>
              <textarea
                className="kh-input kh-tl-ta"
                rows={3}
                maxLength={4000}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </label>
            {opts?.timesheet ? (
              <div className="kh-tl-sw">
                <Switch checked={inTs} onChange={setInTs} label={t('tl_inTs')} />
                <span>{t('tl_inTs')}</span>
              </div>
            ) : opts ? (
              <p className="kh-tl-hint">{t('tl_inTsNo')}</p>
            ) : null}
          </>
        )}
      </Modal>
    </>
  );
}

/** "Hoje" / "Ontem" / weekday + date, for the day groups. */
export function useDayLabel() {
  const { t, lang } = useI18n();
  return useMemo(
    () => (d: Date) => {
      const day = d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-PT', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
      });
      const k = (x: Date) => x.toDateString();
      return k(d) === k(new Date()) ? `${t('tl_today')} · ${day}` : day;
    },
    [t, lang],
  );
}
