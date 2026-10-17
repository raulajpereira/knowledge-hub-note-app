'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { MEETING_LEADS, type NotifyPrefs } from '@/lib/notify';
import { useConfirm, useToast } from '@/components/ui';
import { useShell } from '@/components/shell/ShellContext';
import '@/components/sap/sap.css';

// Definições › Notificações: what goes to the header bell, by email and in
// the daily summary; and "Email para a app" (inbound address) when the
// server has the inbound mailbox configured.

type Inbound = {
  address: string | null;
  enabled: boolean;
  target: 'note' | 'task';
  folderId: string | null;
  taskType: 'tech' | 'mgmt';
  senders: string[];
};
type Settings = { prefs: NotifyPrefs; tz: string; inbound: Inbound | null };

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="kh-toggle"
      onClick={() => onChange(!on)}
    />
  );
}

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="kh-nf__row">
      <div className="kh-nf__lbl">
        <span>{title}</span>
        {desc && <span className="kh-nf__sub">{desc}</span>}
      </div>
      <div className="kh-nf__ctl">{children}</div>
    </div>
  );
}

export function NotifyTab() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const { modules } = useShell();
  const [s, setS] = useState<Settings | null>(null);
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [senders, setSenders] = useState('');

  useEffect(() => {
    api<{ settings: Settings }>('/notifications/settings')
      .then((r) => {
        setS(r.settings);
        setSenders(r.settings.inbound?.senders.join('\n') ?? '');
      })
      .catch(() => {});
    if (modules.has('notes'))
      api<{ folders: Array<{ id: string; name: string }> }>('/folders?kind=notes')
        .then((r) => setFolders(r.folders))
        .catch(() => {});
  }, [modules]);

  const save = useCallback(
    async (patch: { prefs?: Partial<NotifyPrefs>; inbound?: Partial<Inbound> }) => {
      // optimistic: the switch moves at once
      setS(
        (cur) =>
          cur && {
            ...cur,
            prefs: { ...cur.prefs, ...patch.prefs },
            inbound: cur.inbound && { ...cur.inbound, ...patch.inbound },
          },
      );
      try {
        const r = await api<{ settings: Settings }>('/notifications/settings', patch, 'PUT');
        setS(r.settings);
        return true;
      } catch {
        toast({ message: t('ne_saveFail'), tone: 'error' });
        return false;
      }
    },
    [t, toast],
  );

  if (!s) return <div className="kh-set__card" style={{ minHeight: 120 }} />;
  const p = s.prefs;
  const setP = (k: keyof NotifyPrefs) => (v: boolean) => void save({ prefs: { [k]: v } });
  const hasTasks = modules.has('tasks') || modules.has('issues');
  const ib = s.inbound;
  const ibModules = modules.has('notes') || modules.has('tasks');

  const regenerate = async () => {
    const ok = await confirm({
      title: t('nf_regenT'),
      body: t('nf_regenB'),
      confirmLabel: t('nf_regen'),
      cancelLabel: t('tr_cancel'),
    });
    if (!ok) return;
    const r = await api<{ settings: Settings }>('/notifications/inbound', {}).catch(() => null);
    if (r) setS(r.settings);
  };
  const copy = async () => {
    if (!ib?.address) return;
    await navigator.clipboard.writeText(ib.address).catch(() => {});
    toast({ message: t('nf_copied'), tone: 'success' });
  };
  const saveSenders = async () => {
    const list = senders
      .split(/[\n,;]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (await save({ inbound: { senders: list } })) toast({ message: t('nf_saved'), tone: 'success' });
  };

  return (
    <>
      <div className="kh-set__card">
        <div className="kh-set__head">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="kh-set__title">{t('nf_title')}</div>
            <div className="kh-set__desc">{t('nf_desc')}</div>
          </div>
        </div>
        <div className="kh-set__rows">
          {hasTasks && (
            <>
              <Row title={t('nf_taskDue')} desc={t('nf_taskDueD')}>
                <Toggle on={p.taskDue} label={t('nf_taskDue')} onChange={setP('taskDue')} />
              </Row>
              <Row title={t('nf_overdue')} desc={t('nf_overdueD')}>
                <Toggle on={p.taskOverdue} label={t('nf_overdue')} onChange={setP('taskOverdue')} />
              </Row>
            </>
          )}
          {modules.has('tasks') && (
            <Row title={t('nf_reminders')} desc={t('nf_remindersD')}>
              <Toggle on={p.reminders} label={t('nf_reminders')} onChange={setP('reminders')} />
            </Row>
          )}
          {modules.has('meetings') && (
            <Row title={t('nf_meetings')} desc={t('nf_meetingsD')}>
              <select
                className="kh-sap-select"
                style={{ width: 130, height: 34, fontSize: 13 }}
                value={p.meetingLead}
                disabled={!p.meetings}
                aria-label={t('nf_lead')}
                onChange={(e) =>
                  void save({ prefs: { meetingLead: Number(e.target.value) as NotifyPrefs['meetingLead'] } })
                }
              >
                {MEETING_LEADS.map((n) => (
                  <option key={n} value={n}>
                    {t('nf_minBefore').replace('{n}', String(n))}
                  </option>
                ))}
              </select>
              <Toggle on={p.meetings} label={t('nf_meetings')} onChange={setP('meetings')} />
            </Row>
          )}
          {modules.has('share') && (
            <Row title={t('nf_shares')} desc={t('nf_sharesD')}>
              <Toggle on={p.shares} label={t('nf_shares')} onChange={setP('shares')} />
            </Row>
          )}
        </div>
        <div className="kh-set__rows">
          <Row title={t('nf_email')} desc={t('nf_emailD')}>
            <Toggle on={p.email} label={t('nf_email')} onChange={setP('email')} />
          </Row>
          <Row title={t('nf_summary')} desc={t('nf_summaryD')}>
            <input
              type="time"
              className="kh-sap-input"
              style={{ width: 132, height: 34, fontSize: 13 }}
              value={p.summaryTime}
              disabled={!p.summary}
              aria-label={t('nf_summaryTime')}
              onChange={(e) => {
                if (/^\d{2}:\d{2}$/.test(e.target.value))
                  void save({ prefs: { summaryTime: e.target.value } });
              }}
            />
            <Toggle on={p.summary} label={t('nf_summary')} onChange={setP('summary')} />
          </Row>
        </div>
        <div className="kh-sg-tip">
          <span>{t('nf_tzT')}</span>
          <span>{t('nf_tz').replace('{tz}', s.tz)}</span>
        </div>
      </div>

      {ib && ibModules && (
        <div className="kh-set__card" data-testid="inbound-card">
          <div className="kh-set__head">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="kh-set__title">{t('nf_inTitle')}</div>
              <div className="kh-set__desc">{t('nf_inDesc')}</div>
            </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, flex: 'none' }}>
              <span style={{ color: 'rgb(var(--t) / calc(.75 * var(--t-k)))' }}>
                {ib.enabled ? t('ai_on') : t('ai_off')}
              </span>
              <Toggle
                on={ib.enabled}
                label={t('nf_inTitle')}
                onChange={(v) => void save({ inbound: { enabled: v } })}
              />
            </span>
          </div>
          {ib.address && (
            <div className="kh-nf__addr">
              <code data-testid="inbound-address">{ib.address}</code>
              <button type="button" className="kh-set__ghost" onClick={() => void copy()}>
                {t('nf_copy')}
              </button>
              <button type="button" className="kh-set__ghost" onClick={() => void regenerate()}>
                {t('nf_regen')}
              </button>
            </div>
          )}
          <div className="kh-set__rows">
            <Row title={t('nf_inTarget')}>
              <div className="kh-set__seg">
                {(
                  [
                    ['note', 'nf_inNote', 'notes'],
                    ['task', 'nf_inTask', 'tasks'],
                  ] as const
                )
                  .filter(([, , m]) => modules.has(m))
                  .map(([id, k]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={ib.target === id}
                      onClick={() => void save({ inbound: { target: id } })}
                    >
                      {t(k)}
                    </button>
                  ))}
              </div>
            </Row>
            {ib.target === 'note' ? (
              <Row title={t('nf_inFolder')}>
                <select
                  className="kh-sap-select"
                  style={{ width: 220, height: 34, fontSize: 13 }}
                  value={ib.folderId ?? ''}
                  aria-label={t('nf_inFolder')}
                  onChange={(e) => void save({ inbound: { folderId: e.target.value || null } })}
                >
                  <option value="">{t('nf_inNoFolder')}</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </Row>
            ) : (
              <Row title={t('nf_inType')}>
                <select
                  className="kh-sap-select"
                  style={{ width: 220, height: 34, fontSize: 13 }}
                  value={ib.taskType}
                  aria-label={t('nf_inType')}
                  onChange={(e) => void save({ inbound: { taskType: e.target.value as 'tech' | 'mgmt' } })}
                >
                  <option value="tech">{t('tk_tech')}</option>
                  <option value="mgmt">{t('tk_mgmt')}</option>
                </select>
              </Row>
            )}
            <Row title={t('nf_inSenders')} desc={t('nf_inSendersD')}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  alignItems: 'flex-end',
                  width: '100%',
                }}
              >
                <textarea
                  className="kh-sap-input kh-nf__senders"
                  value={senders}
                  rows={3}
                  spellCheck={false}
                  aria-label={t('nf_inSenders')}
                  onChange={(e) => setSenders(e.target.value)}
                />
                <button type="button" className="kh-set__ghost" onClick={() => void saveSenders()}>
                  {t('nf_save')}
                </button>
              </div>
            </Row>
          </div>
          <div className="kh-sg-tip">
            <span>{t('nf_inTipT')}</span>
            <span>{t('nf_inTip')}</span>
          </div>
        </div>
      )}
    </>
  );
}
