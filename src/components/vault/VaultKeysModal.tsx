'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n/client';
import { Modal } from '@/components/ui';

// Prototype VaultKeys.dc.html: show/save the recovery key, recover with it,
// change the master password, re-download the kit. All crypto is done by the
// caller (VaultView) — this component only collects input and shows results.

export type KeysMode = 'show' | 'recover' | 'change' | 'download' | 'menu';

const Steps = ({ labels }: { labels: string[] }) => (
  <div className="kh-vk__steps">
    {labels.map((l, i) => (
      <div key={l} data-done={i < 2 || undefined}>
        <span />
        <span>{l}</span>
      </div>
    ))}
  </div>
);

export function VaultKeysModal({
  mode,
  setup,
  recoveryKey,
  fp,
  rkCreated,
  lockMinutes,
  onLockMinutes,
  onClose,
  onRecover,
  onWipe,
  onChange,
  onDownloadAuth,
  onRegenerate,
  onMode,
}: {
  mode: KeysMode;
  setup?: boolean;
  recoveryKey?: string;
  fp?: string | null;
  rkCreated?: string | null;
  lockMinutes: number;
  onLockMinutes: (n: number) => void;
  onClose: () => void;
  onRecover: (key: string, pass: string) => Promise<string | null>;
  onWipe: () => void;
  onChange: (cur: string, next: string) => Promise<string | null>;
  onDownloadAuth: (pass: string) => Promise<string | null>;
  onRegenerate: () => void;
  onMode: (m: KeysMode) => void;
}) {
  const { t, lang } = useI18n();
  const L = (k: string) => t(`vk_${k}`);
  const [v, setV] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [ack, setAck] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setV((x) => ({ ...x, [k]: e.target.value }));
    setErr('');
  };
  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    try {
      const e = await fn();
      if (e) setErr(e);
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const title = L('kitTitle');
    const txt = [
      title,
      '='.repeat(title.length),
      '',
      `${L('keyLbl')}:`,
      recoveryKey,
      '',
      `${L('fp')}: ${fp}`,
      `${lang === 'en' ? 'Created' : 'Criada'}: ${new Date().toLocaleString(lang === 'en' ? 'en-GB' : 'pt-PT')}`,
      '',
      L('kitWarn'),
      '',
    ].join('\n');
    const u = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = u;
    a.download = 'KnowledgeHub-Recovery-Kit.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 3000);
  };

  const pass = (k: string, label: string, ph = '') => (
    <label className="kh-vk__field">
      <span>{label}</span>
      <input
        type="password"
        value={v[k] ?? ''}
        placeholder={ph}
        autoComplete="new-password"
        onChange={set(k)}
      />
    </label>
  );
  const msg = (
    <>
      {err && <div className="kh-vk__err">{err}</div>}
      {ok && <div className="kh-vk__ok">{ok}</div>}
    </>
  );

  if (mode === 'show')
    return (
      <Modal
        open
        onClose={() => {}}
        dismissible={false}
        hideClose
        title={L('setupT')}
        subtitle={L('setupS')}
        size="sm"
        closeLabel={t('ui_close')}
      >
        <div className="kh-vk">
          {setup && <Steps labels={[L('s1'), L('s2'), L('s3')]} />}
          <div className="kh-vk__key">
            <span>{L('keyLbl')}</span>
            <span className="kh-mono">{recoveryKey}</span>
            <span>
              {L('fp')} {fp}
            </span>
          </div>
          <div className="kh-vk__row">
            <button type="button" className="kh-vk__btn" onClick={download}>
              {L('download')}
            </button>
            <button
              type="button"
              className="kh-vk__btn"
              onClick={() => {
                void navigator.clipboard?.writeText(recoveryKey ?? '').catch(() => {});
                setCopied(true);
              }}
            >
              {copied ? L('copied') : L('copy')}
            </button>
          </div>
          <div className="kh-vk__warn">
            <span>⚠</span>
            <span>{L('warn')}</span>
          </div>
          <button type="button" className="kh-vk__ack" aria-pressed={ack} onClick={() => setAck(!ack)}>
            <span data-on={ack || undefined}>{ack ? '✓' : ''}</span>
            {L('ack')}
          </button>
          <div className="kh-vk__actions">
            <button type="button" className="kh-vk__pri" disabled={!ack} onClick={onClose}>
              {L('finish')}
            </button>
          </div>
        </div>
      </Modal>
    );

  if (mode === 'recover')
    return (
      <Modal
        open
        onClose={onClose}
        title={L('recT')}
        subtitle={L('recS')}
        size="sm"
        closeLabel={t('ui_close')}
      >
        <div className="kh-vk">
          <label className="kh-vk__field">
            <span>{L('keyIn')}</span>
            <textarea
              rows={3}
              spellCheck={false}
              value={v.key ?? ''}
              placeholder={L('keyPh')}
              onChange={set('key')}
            />
          </label>
          <label className="kh-vk__file">
            {L('upload')}
            <input
              type="file"
              accept=".txt,text/plain"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                void f.text().then((txt) => setV((x) => ({ ...x, key: txt.slice(0, 4000) })));
              }}
            />
          </label>
          {pass('p1', L('newPass'), L('newPh'))}
          {pass('p2', L('conf'))}
          {msg}
          <div className="kh-vk__actions">
            <button
              type="button"
              className="kh-vk__alt"
              onClick={() => {
                if (window.confirm(L('wipeQ'))) onWipe();
              }}
            >
              {L('noKey')}
            </button>
            <button
              type="button"
              className="kh-vk__pri"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if ((v.p1 ?? '').length < 8) return L('short');
                  if (v.p1 !== v.p2) return L('mismatch');
                  return onRecover(v.key ?? '', v.p1 ?? '');
                })
              }
            >
              {busy ? t('vt_opening') : L('recover')}
            </button>
          </div>
        </div>
      </Modal>
    );

  if (mode === 'change')
    return (
      <Modal open onClose={onClose} title={L('chT')} subtitle={L('chS')} size="sm" closeLabel={t('ui_close')}>
        <div className="kh-vk">
          {pass('cur', L('cur'))}
          {pass('p1', L('newPass'), L('newPh'))}
          {pass('p2', L('conf'))}
          {msg}
          <div className="kh-vk__actions">
            <button type="button" className="kh-vk__alt" onClick={() => onMode('menu')}>
              {L('cancel')}
            </button>
            <button
              type="button"
              className="kh-vk__pri"
              disabled={busy || !!ok}
              onClick={() =>
                void run(async () => {
                  if ((v.p1 ?? '').length < 8) return L('short');
                  if (v.p1 !== v.p2) return L('mismatch');
                  const e = await onChange(v.cur ?? '', v.p1 ?? '');
                  if (!e) setOk(L('changed'));
                  return e;
                })
              }
            >
              {busy ? t('vt_opening') : L('change')}
            </button>
          </div>
        </div>
      </Modal>
    );

  if (mode === 'download')
    return (
      <Modal open onClose={onClose} title={L('dlT')} subtitle={L('dlS')} size="sm" closeLabel={t('ui_close')}>
        <div className="kh-vk">
          {pass('cur', L('cur'))}
          {msg}
          <div className="kh-vk__actions">
            <button type="button" className="kh-vk__alt" onClick={() => onMode('menu')}>
              {L('cancel')}
            </button>
            <button
              type="button"
              className="kh-vk__pri"
              disabled={busy}
              onClick={() => void run(() => onDownloadAuth(v.cur ?? ''))}
            >
              {busy ? t('vt_opening') : L('unlock')}
            </button>
          </div>
        </div>
      </Modal>
    );

  // menu (prototype VaultKeys "settings")
  const acts: Array<[string, string, () => void]> = [
    [L('aCh'), L('aChS'), () => onMode('change')],
    ...(fp
      ? ([
          [L('aDl'), L('aDlS'), () => onMode('download')],
          [L('aRg'), L('aRgS'), () => window.confirm(`${L('rgT')}\n\n${L('rgS')}`) && onRegenerate()],
        ] as Array<[string, string, () => void]>)
      : ([[L('aNew'), L('aNewS'), onRegenerate]] as Array<[string, string, () => void]>)),
  ];
  return (
    <Modal
      open
      onClose={onClose}
      title={t('vt_btn')}
      subtitle={t('vt_secDesc')}
      size="sm"
      closeLabel={t('ui_close')}
    >
      <div className="kh-vk">
        <div className="kh-vk__status" data-on={!!fp || undefined}>
          <span />
          <span>
            <span>{fp ? L('stOn') : L('stOff')}</span>
            <span>
              {fp
                ? `${fp} · ${L('created')} ${rkCreated ? new Date(rkCreated).toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-PT') : ''}`
                : L('stOffSub')}
            </span>
          </span>
        </div>
        <div className="kh-vk__acts">
          {acts.map(([label, sub, fn]) => (
            <button key={label} type="button" onClick={fn}>
              <span>{label}</span>
              <span>{sub}</span>
            </button>
          ))}
        </div>
        <label className="kh-vk__field kh-vk__lock">
          <span>{t('vl_setTitleS')}</span>
          <select value={lockMinutes} onChange={(e) => onLockMinutes(Number(e.target.value))}>
            {[1, 5, 15, 30, 60].map((n) => (
              <option key={n} value={n}>
                {t('vl_autoLock')} {t('vt_min').replace('{n}', String(n))}
              </option>
            ))}
          </select>
          <span className="kh-vk__hint">{t('vl_setDescS')}</span>
        </label>
      </div>
    </Modal>
  );
}
