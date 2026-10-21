'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { api, isApiFailure } from '@/lib/client/api';
import {
  inboundAddress,
  inboundCodeProblem,
  normalizeInboundCode,
  INBOUND_CODE_MAX,
  MEETING_LEADS,
  type NotifyPrefs,
} from '@/lib/notify';
import { useConfirm, useToast } from '@/components/ui';
import { useShell } from '@/components/shell/ShellContext';
import '@/components/sap/sap.css';

// Definições › Notificações: what goes to the header bell, by email and in
// the daily summary; and "Email para a app" (inbound address) when the
// server has the inbound mailbox configured.

type Inbound = {
  base: string;
  code: string | null;
  address: string | null;
  enabled: boolean;
  target: 'note' | 'task' | 'email';
  folderId: string | null;
  emailFolderId: string | null;
  taskType: 'tech' | 'mgmt';
  senders: string[];
  reserved: Array<{ code: string; address: string; until: string }>;
};
type Folder = { id: string; name: string };
/** the availability of the code being typed (current = it is already the address) */
type CodeState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'reserved' | 'current' | 'rate';
const CODE_MSG: Partial<Record<CodeState, string>> = {
  checking: 'nf_codeChecking',
  available: 'nf_codeAvail',
  taken: 'nf_codeTaken',
  invalid: 'nf_codeInvalid',
  reserved: 'nf_codeReserved',
  current: 'nf_codeCurrent',
  rate: 'nf_codeRate',
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
  const { t, lang } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const { modules } = useShell();
  const [s, setS] = useState<Settings | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [emailFolders, setEmailFolders] = useState<Folder[]>([]);
  const [senders, setSenders] = useState('');
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState<CodeState>('idle');

  useEffect(() => {
    api<{ settings: Settings }>('/notifications/settings')
      .then((r) => {
        setS(r.settings);
        setSenders(r.settings.inbound?.senders.join('\n') ?? '');
        setCode(r.settings.inbound?.code ?? '');
      })
      .catch(() => {});
    if (modules.has('notes'))
      api<{ folders: Folder[] }>('/folders?kind=notes')
        .then((r) => setFolders(r.folders))
        .catch(() => {});
    if (modules.has('emails'))
      api<{ folders: Folder[] }>('/emails/folders')
        .then((r) => setEmailFolders(r.folders))
        .catch(() => {});
  }, [modules]);

  // availability while typing: the rules here first, then the server (debounced)
  const current = s?.inbound?.code ?? null;
  const ownReserved = s?.inbound?.reserved.map((r) => r.code).join(' ') ?? '';
  useEffect(() => {
    const c = normalizeInboundCode(code);
    if (!c) return setCodeState('idle');
    if (c === current) return setCodeState('current');
    const problem = inboundCodeProblem(c);
    if (problem && !ownReserved.split(' ').includes(c)) return setCodeState(problem);
    setCodeState('checking');
    let live = true;
    const h = setTimeout(() => {
      api<{ status: CodeState }>(`/notifications/inbound/code?code=${encodeURIComponent(c)}`)
        .then((r) => live && setCodeState(r.status))
        .catch((e: unknown) => live && setCodeState(isApiFailure(e) && e.status === 429 ? 'rate' : 'idle'));
    }, 350);
    return () => {
      live = false;
      clearTimeout(h);
    };
  }, [code, current, ownReserved]);

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
  const ibModules = modules.has('notes') || modules.has('tasks') || modules.has('emails');
  const typed = normalizeInboundCode(code);

  // the old address stops at once but stays theirs for 30 days: say so before any change
  const confirmChange = (title: string, label: string) =>
    !ib?.code || confirm({ title, body: t('nf_codeB'), confirmLabel: label, cancelLabel: t('tr_cancel') });
  const applied = (st: Settings) => {
    setS(st);
    setCode(st.inbound?.code ?? '');
  };
  const regenerate = async () => {
    if (!(await confirmChange(t('nf_regenT'), t('nf_regen')))) return;
    const r = await api<{ settings: Settings }>('/notifications/inbound', {}).catch(() => null);
    if (r) applied(r.settings);
  };
  const saveCode = async (c: string, back = false) => {
    if (!(await confirmChange(back ? t('nf_backT') : t('nf_codeT'), back ? t('nf_back') : t('nf_codeSave'))))
      return;
    try {
      const r = await api<{ settings: Settings }>('/notifications/inbound/code', { code: c }, 'PUT');
      applied(r.settings);
      toast({ message: t('nf_codeSaved'), tone: 'success' });
    } catch (e) {
      const code = isApiFailure(e) ? e.code : '';
      if (!back)
        setCodeState(
          code === 'code_taken'
            ? 'taken'
            : code === 'reserved_code'
              ? 'reserved'
              : code === 'invalid_code'
                ? 'invalid'
                : code === 'too_many_requests'
                  ? 'rate'
                  : codeState,
        );
      toast({ message: t(code === 'code_taken' ? 'nf_codeTaken' : 'ne_saveFail'), tone: 'error' });
    }
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
            <Row title={t('nf_code')} desc={t('nf_codeD')}>
              <div className="kh-nf__code">
                <div className="kh-nf__codeline">
                  <input
                    className="kh-sap-input"
                    data-testid="inbound-code"
                    value={code}
                    maxLength={INBOUND_CODE_MAX}
                    spellCheck={false}
                    autoCapitalize="none"
                    autoComplete="off"
                    placeholder={t('nf_codePh')}
                    aria-label={t('nf_code')}
                    aria-describedby="kh-nf-code-state"
                    aria-invalid={['taken', 'invalid', 'reserved'].includes(codeState)}
                    onChange={(e) => setCode(e.target.value.toLowerCase())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && codeState === 'available') void saveCode(typed);
                    }}
                  />
                  <button
                    type="button"
                    className="kh-set__ghost"
                    disabled={codeState !== 'available'}
                    onClick={() => void saveCode(typed)}
                  >
                    {t('nf_codeSave')}
                  </button>
                </div>
                <span
                  id="kh-nf-code-state"
                  className="kh-nf__state"
                  data-state={codeState}
                  data-testid="inbound-code-state"
                  role="status"
                  aria-live="polite"
                >
                  {CODE_MSG[codeState] ? t(CODE_MSG[codeState]!) : ''}
                </span>
                {typed && codeState !== 'current' && (
                  <span className="kh-nf__preview" data-testid="inbound-preview">
                    {t('nf_codeNew')} <code>{inboundAddress(ib.base, typed)}</code>
                  </span>
                )}
              </div>
            </Row>
            {ib.reserved.length > 0 && (
              <div className="kh-nf__row kh-nf__resv" data-testid="inbound-reserved">
                <div className="kh-nf__lbl">
                  <span>{t('nf_reservedT')}</span>
                  <span className="kh-nf__sub">{t('nf_reservedD')}</span>
                </div>
                <ul className="kh-nf__resvlist">
                  {ib.reserved.map((r) => (
                    <li key={r.code}>
                      <code>{r.address}</code>
                      <span className="kh-nf__sub">
                        {t('nf_reservedUntil').replace(
                          '{d}',
                          new Date(r.until).toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-PT'),
                        )}
                      </span>
                      <button
                        type="button"
                        className="kh-set__ghost"
                        onClick={() => void saveCode(r.code, true)}
                      >
                        {t('nf_back')}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="kh-set__rows">
            <Row title={t('nf_inTarget')}>
              <div className="kh-set__seg">
                {(
                  [
                    ['note', 'nf_inNote', 'notes'],
                    ['task', 'nf_inTask', 'tasks'],
                    ['email', 'nf_inEmail', 'emails'],
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
            ) : ib.target === 'email' ? (
              <Row title={t('nf_inEmailFolder')}>
                <select
                  className="kh-sap-select"
                  style={{ width: 220, height: 34, fontSize: 13 }}
                  value={ib.emailFolderId ?? ''}
                  aria-label={t('nf_inEmailFolder')}
                  onChange={(e) => void save({ inbound: { emailFolderId: e.target.value || null } })}
                >
                  <option value="">{t('nf_inNoEmailFolder')}</option>
                  {emailFolders.map((f) => (
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
