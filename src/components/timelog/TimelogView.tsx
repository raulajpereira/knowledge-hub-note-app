'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { DateInput, Modal, Select, Switch, useConfirm, useToast } from '@/components/ui';
import { XlsxButton } from '@/components/content/XlsxButton';
import { downloadTableXlsx, xlsxName } from '@/lib/client/xlsxTable';
import { fmtMinutes, roundUp15 } from '@/lib/timelog';
import {
  EMPTY_FORM,
  formOf,
  payloadOf,
  TIMER_EVENT,
  TimeFields,
  tzQ,
  useDayLabel,
  useTimeOptions,
  type TimeEntry,
  type TimeForm,
} from './Timer';
import '@/components/sap/sap.css';
import './timelog.css';

// "Registo de Tempos": the person's entries of a week or a month, grouped by
// day with totals; edit / delete / manual entry; "Folha" switch per entry and
// "Enviar para a folha de tempos" for the whole range; Excel export.

type Range = 'week' | 'month';
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
function bounds(range: Range, offset: number): [Date, Date] {
  const n = new Date();
  if (range === 'month')
    return [
      new Date(n.getFullYear(), n.getMonth() + offset, 1),
      new Date(n.getFullYear(), n.getMonth() + offset + 1, 1),
    ];
  const mon = new Date(n.getFullYear(), n.getMonth(), n.getDate() - ((n.getDay() + 6) % 7) + offset * 7);
  return [mon, new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7)];
}
/** ISO week number of a Monday */
const isoWeek = (d: Date) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7)));
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - y.getTime()) / 86_400_000 - 3 + ((y.getUTCDay() + 6) % 7)) / 7);
};
const minsOf = (e: TimeEntry) =>
  e.minutes ?? roundUp15((Date.now() - new Date(e.startedAt).getTime()) / 1000);

type Edit = {
  id: string | null;
  day: string;
  from: string;
  to: string;
  form: TimeForm;
  inTs: boolean;
  running: boolean;
};

export function TimelogView() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const sp = useSearchParams();
  const dayLabel = useDayLabel();
  const [range, setRange] = useState<Range>('week');
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<TimeEntry[] | null>(null);
  const [q, setQ] = useState('');
  const [client, setClient] = useState('');
  const [project, setProject] = useState('');
  const [edit, setEdit] = useState<Edit | null>(null);
  const [busy, setBusy] = useState(false);
  const opts = useTimeOptions(true);
  const [from, to] = useMemo(() => bounds(range, offset), [range, offset]);

  const load = useCallback(() => {
    api<{ entries: TimeEntry[] }>(`/timelog?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then((r) => setItems(r.entries))
      .catch(() => setItems([]));
  }, [from, to]);
  useEffect(() => {
    load();
    window.addEventListener(TIMER_EVENT, load);
    return () => window.removeEventListener(TIMER_EVENT, load);
  }, [load]);

  const openEdit = useCallback((e: TimeEntry) => {
    setEdit({
      id: e.id,
      day: dayKey(new Date(e.startedAt)),
      from: hm(e.startedAt),
      to: hm(e.endedAt),
      form: formOf(e),
      inTs: e.inTimesheet,
      running: !e.endedAt,
    });
  }, []);
  // ?e=<id> (from the Activity or a notification)
  const target = sp.get('e');
  useEffect(() => {
    const e = target && items?.find((x) => x.id === target);
    if (e) openEdit(e);
  }, [target, items, openEdit]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items ?? []).filter(
      (e) =>
        (!client || (e.clientId ?? e.clientLabel) === client) &&
        (!project || e.projectId === project) &&
        (!s ||
          [e.refLabel, e.clientLabel, e.projectLabel, e.description].some((v) =>
            v.toLowerCase().includes(s),
          )),
    );
  }, [items, q, client, project]);
  const days = useMemo(() => {
    const m = new Map<string, TimeEntry[]>();
    for (const e of shown) {
      const k = dayKey(new Date(e.startedAt));
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()];
  }, [shown]);
  const sum = (xs: TimeEntry[]) => xs.reduce((a, e) => a + minsOf(e), 0);
  const today = dayKey(new Date());
  const clientOpts = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of items ?? []) if (e.clientLabel) m.set(e.clientId ?? e.clientLabel, e.clientLabel);
    return [...m.entries()];
  }, [items]);
  const projectOpts = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of items ?? []) if (e.projectId) m.set(e.projectId, e.projectLabel);
    return [...m.entries()];
  }, [items]);

  const fail = (e: unknown) =>
    toast({
      message: (e as { code?: string })?.code === 'invalid_range' ? t('tl_badRange') : t('tl_fail'),
      tone: 'error',
    });
  const changed = () => window.dispatchEvent(new Event(TIMER_EVENT));

  const toggleTs = async (e: TimeEntry, on: boolean) => {
    try {
      const r = await api<{ entry: TimeEntry }>(`/timelog/${e.id}?${tzQ()}`, { inTimesheet: on }, 'PATCH');
      setItems((cur) => cur?.map((x) => (x.id === e.id ? r.entry : x)) ?? null);
      const st = r.entry.tsState;
      if (on && st && st !== 'added') toast({ message: t(`tl_ts_${st}`), tone: 'info' });
    } catch (err) {
      fail(err);
    }
  };
  const save = async () => {
    if (!edit) return;
    const at = (hhmm: string) => new Date(`${edit.day}T${hhmm || '00:00'}:00`).toISOString();
    setBusy(true);
    try {
      const body = {
        ...payloadOf(edit.form),
        inTimesheet: edit.inTs,
        startedAt: at(edit.from),
        ...(edit.running ? {} : { endedAt: at(edit.to) }),
      };
      if (edit.id) await api(`/timelog/${edit.id}?${tzQ()}`, body, 'PATCH');
      else await api(`/timelog?${tzQ()}`, body);
      setEdit(null);
      changed();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!edit?.id) return;
    const ok = await confirm({
      title: t('tl_askDel'),
      body: t('tl_askDelB'),
      confirmLabel: t('tl_delete'),
      cancelLabel: t('tl_cancel'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/timelog/${edit.id}`, undefined, 'DELETE');
      setEdit(null);
      changed();
    } catch (e) {
      fail(e);
    }
  };
  const sendRange = async () => {
    try {
      const r = await api<{ added: number }>(`/timelog/include?${tzQ()}`, {
        from: from.toISOString(),
        to: to.toISOString(),
      });
      toast({ message: t('tl_sent').replace('{n}', String(r.added)), tone: 'success' });
      changed();
    } catch (e) {
      fail(e);
    }
  };

  const loc = lang === 'en' ? 'en-GB' : 'pt-PT';
  const rangeLabel =
    range === 'week'
      ? `${t('tl_weekN').replace('{n}', String(isoWeek(from)))} · ${from.toLocaleDateString(loc, { day: 'numeric', month: 'short' })} – ${new Date(to.getTime() - 86_400_000).toLocaleDateString(loc, { day: 'numeric', month: 'short' })}`
      : from.toLocaleDateString(loc, { month: 'long', year: 'numeric' });
  const stat = (color: string, label: string, mins: number) => (
    <button type="button" style={{ background: 'rgb(var(--w) / .05)' }} tabIndex={-1}>
      <span>
        <span style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
        <span>{label}</span>
      </span>
      <span>{fmtMinutes(mins)}</span>
    </button>
  );

  return (
    <section className="kh-sap kh-tl-page">
      <div className="kh-sap-main">
        <div className="kh-sap-head">
          <div className="kh-sap-titles">
            <h1>{t('tl_title')}</h1>
            <div>{t('tl_sub')}</div>
          </div>
          <div className="kh-sap-seg" role="radiogroup" aria-label={t('tl_title')}>
            {(['week', 'month'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={range === v}
                data-on={range === v || undefined}
                onClick={() => {
                  setRange(v);
                  setOffset(0);
                }}
              >
                {t(v === 'week' ? 'tl_week' : 'tl_month')}
              </button>
            ))}
          </div>
          <label className="kh-sap-search">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('tl_search')}
              aria-label={t('tl_search')}
            />
          </label>
          <button
            type="button"
            className="kh-sap-new"
            onClick={() => {
              const n = new Date();
              setEdit({
                id: null,
                day: dayKey(n),
                from: `${pad(Math.max(0, n.getHours() - 1))}:00`,
                to: `${pad(n.getHours())}:00`,
                form: EMPTY_FORM,
                inTs: true,
                running: false,
              });
            }}
          >
            + {t('tl_manual')}
          </button>
        </div>
        <div className="kh-ot-stats">
          {stat(
            'oklch(0.72 0.15 150)',
            t('tl_today'),
            sum((items ?? []).filter((e) => dayKey(new Date(e.startedAt)) === today)),
          )}
          {stat(
            'oklch(0.7 0.12 250)',
            range === 'week' ? t('tl_weekN').replace('{n}', String(isoWeek(from))) : rangeLabel,
            sum(items ?? []),
          )}
          {stat('oklch(0.75 0.13 80)', t('tl_total'), sum(shown))}
          {stat(
            'oklch(0.7 0.14 300)',
            t('tl_inSheet'),
            sum((items ?? []).filter((e) => e.tsState === 'added')),
          )}
        </div>
        <div className="kh-tl-tools" style={{ padding: '0 22px 12px' }}>
          <span className="kh-tl-nav">
            <button
              type="button"
              className="kh-btn kh-btn--sm kh-btn--ghost"
              aria-label={t('tl_prev')}
              onClick={() => setOffset((o) => o - 1)}
            >
              ‹
            </button>
            <span>{rangeLabel}</span>
            <button
              type="button"
              className="kh-btn kh-btn--sm kh-btn--ghost"
              aria-label={t('tl_next')}
              onClick={() => setOffset((o) => o + 1)}
            >
              ›
            </button>
          </span>
          <div className="kh-tl-sel">
            <Select
              aria-label={t('tl_cClient')}
              searchPlaceholder={t('tl_cClient')}
              value={client}
              options={[
                { value: '', label: t('tl_allClients') },
                ...clientOpts.map(([v, l]) => ({ value: v, label: l })),
              ]}
              onChange={setClient}
            />
          </div>
          <div className="kh-tl-sel">
            <Select
              aria-label={t('tl_cProject')}
              searchPlaceholder={t('tl_cProject')}
              value={project}
              options={[
                { value: '', label: t('tl_allProjects') },
                ...projectOpts.map(([v, l]) => ({ value: v, label: l })),
              ]}
              onChange={setProject}
            />
          </div>
          <span style={{ flex: 1 }} />
          <XlsxButton
            onExport={() =>
              downloadTableXlsx({
                title: t('tl_title'),
                subtitle: rangeLabel,
                sheet: t('tl_title'),
                lang,
                totalLabel: t('xl_total'),
                generatedLabel: t('xl_generated'),
                fileName: xlsxName(t('tl_title')),
                rows: [...shown].reverse(),
                columns: [
                  {
                    header: t('tl_day'),
                    type: 'date',
                    width: 12,
                    value: (e) => dayKey(new Date(e.startedAt)),
                  },
                  { header: t('tl_cFrom'), width: 8, value: (e) => hm(e.startedAt) },
                  { header: t('tl_cTo'), width: 8, value: (e) => hm(e.endedAt) },
                  { header: `${t('tl_cDur')} (h)`, type: 'hours', width: 11, value: (e) => minsOf(e) / 60 },
                  { header: t('tl_cRef'), width: 30, value: (e) => e.refLabel },
                  { header: t('tl_cClient'), width: 22, value: (e) => e.clientLabel },
                  { header: t('tl_cProject'), width: 24, value: (e) => e.projectLabel },
                  { header: t('tl_cDesc'), width: 50, value: (e) => e.description },
                  { header: t('tl_cSheet'), width: 10, value: (e) => (e.tsState === 'added' ? '✓' : '') },
                ],
              })
            }
          />
          {opts?.timesheet && (
            <button
              type="button"
              className="kh-btn kh-btn--sm kh-btn--glass"
              onClick={() => void sendRange()}
            >
              {t('tl_sendWeek')}
            </button>
          )}
        </div>
        <div className="kh-sap-body" style={{ padding: '0 22px 22px' }}>
          <div className="kh-well kh-table kh-tl-table" role="table" aria-label={t('tl_title')}>
            <div className="kh-table__head kh-tl-cols" role="row">
              {[
                'tl_cFrom',
                'tl_cTo',
                'tl_cDur',
                'tl_cRef',
                'tl_cClient',
                'tl_cProject',
                'tl_cDesc',
                'tl_cSheet',
              ].map((k) => (
                <div key={k} role="columnheader" className="kh-table__th">
                  {t(k)}
                </div>
              ))}
            </div>
            {items && !days.length && <div className="kh-table__empty">{t('tl_empty')}</div>}
            {days.map(([k, list]) => (
              <div key={k} role="rowgroup">
                <div className="kh-tl-day">
                  <span>{dayLabel(new Date(`${k}T12:00:00`))}</span>
                  <b>{fmtMinutes(sum(list))}</b>
                </div>
                {list.map((e) => (
                  <div
                    key={e.id}
                    role="row"
                    tabIndex={0}
                    className="kh-table__row kh-table__row--click kh-tl-cols"
                    onClick={() => openEdit(e)}
                    onKeyDown={(ev) => ev.key === 'Enter' && ev.target === ev.currentTarget && openEdit(e)}
                  >
                    <div role="cell" className="kh-table__td kh-tl-mono">
                      {hm(e.startedAt)}
                    </div>
                    <div role="cell" className="kh-table__td kh-tl-mono">
                      {e.endedAt ? hm(e.endedAt) : <span className="kh-tl-run">{t('tl_running')}</span>}
                    </div>
                    <div role="cell" className="kh-table__td kh-tl-mono kh-tl-strong">
                      {fmtMinutes(minsOf(e))}
                    </div>
                    <div role="cell" className="kh-table__td" title={e.refLabel}>
                      {e.refLabel || '—'}
                    </div>
                    <div role="cell" className="kh-table__td">
                      {e.clientLabel || '—'}
                    </div>
                    <div role="cell" className="kh-table__td kh-tl-dim">
                      {e.projectLabel || '—'}
                    </div>
                    <div role="cell" className="kh-table__td kh-tl-dim" title={e.description}>
                      {e.description || '—'}
                    </div>
                    <div
                      role="cell"
                      className="kh-table__td"
                      onClick={(ev) => ev.stopPropagation()}
                      onKeyDown={(ev) => ev.stopPropagation()}
                    >
                      {e.endedAt && opts?.timesheet ? (
                        <Switch
                          checked={e.inTimesheet && e.tsState === 'added'}
                          onChange={(v) => void toggleTs(e, v)}
                          label={`${t('tl_inTs')} · ${e.refLabel || e.description}`}
                          title={e.tsState ? t(`tl_ts_${e.tsState}`) : undefined}
                        />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? t('tl_editT') : t('tl_newT')}
        closeLabel={t('ui_close')}
        className="kh-tl-modal"
        footer={
          <div className="kh-tl-foot">
            {edit?.id && (
              <button type="button" className="kh-btn kh-btn--danger" onClick={() => void remove()}>
                {t('tl_delete')}
              </button>
            )}
            <span className="kh-tl-foot__sp" />
            <button type="button" className="kh-btn kh-btn--ghost" onClick={() => setEdit(null)}>
              {t('tl_cancel')}
            </button>
            <button
              type="button"
              className="kh-btn kh-btn--primary"
              disabled={busy}
              onClick={() => void save()}
            >
              {t('tl_save')}
            </button>
          </div>
        }
      >
        {edit && (
          <>
            <div className="kh-tl-grid" style={{ gridTemplateColumns: '1.4fr 1fr 1fr', marginBottom: 14 }}>
              <label className="kh-field">
                <span className="kh-field__label">{t('tl_day')}</span>
                <DateInput
                  className="kh-input"
                  value={edit.day}
                  onChange={(v) => v && setEdit({ ...edit, day: v })}
                  aria-label={t('tl_day')}
                />
              </label>
              <label className="kh-field">
                <span className="kh-field__label">{t('tl_cFrom')}</span>
                <input
                  className="kh-input kh-tl-mono"
                  type="time"
                  value={edit.from}
                  onChange={(e) => setEdit({ ...edit, from: e.target.value })}
                />
              </label>
              <label className="kh-field">
                <span className="kh-field__label">{t('tl_cTo')}</span>
                {edit.running ? (
                  <input className="kh-input" value={t('tl_running')} readOnly />
                ) : (
                  <input
                    className="kh-input kh-tl-mono"
                    type="time"
                    value={edit.to}
                    onChange={(e) => setEdit({ ...edit, to: e.target.value })}
                  />
                )}
              </label>
            </div>
            <TimeFields
              form={edit.form}
              set={(p) => setEdit((x) => (x ? { ...x, form: { ...x.form, ...p } } : x))}
              opts={opts}
            />
            {opts?.timesheet && !edit.running && (
              <div className="kh-tl-sw">
                <Switch
                  checked={edit.inTs}
                  onChange={(v) => setEdit({ ...edit, inTs: v })}
                  label={t('tl_inTs')}
                />
                <span>{t('tl_inTs')}</span>
              </div>
            )}
          </>
        )}
      </Modal>
    </section>
  );
}
