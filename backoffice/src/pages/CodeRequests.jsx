import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import FeatureCheckboxGrid, { FEATURE_KEYS } from '../components/FeatureCheckboxGrid.jsx';

function ApproveRequestModal({ theme, t, request, onClose, onApproved }) {
  const [selected, setSelected] = useState(new Set(FEATURE_KEYS));
  const [approving, setApproving] = useState(false);
  const toggle = (key) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const approve = async () => {
    setApproving(true);
    try {
      await api.approveCodeRequest(request.id, { allowedFeatures: [...selected] });
      onApproved();
    } finally {
      setApproving(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', borderRadius: 14, padding: 22, width: 480, maxWidth: '92vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: 14, border: `1px solid ${theme.border}` }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{t('settings.approveRequest')}</div>
          <div style={{ fontSize: 12.5, color: theme.textMuted }}>{request.name} · {request.email}</div>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 11.5, fontWeight: 700 }}>
          <span onClick={() => setSelected(new Set(FEATURE_KEYS))} style={{ cursor: 'pointer', color: theme.accentText }}>{t('settings.selectAll')}</span>
          <span onClick={() => setSelected(new Set())} style={{ cursor: 'pointer', color: theme.textMuted }}>{t('settings.selectNone')}</span>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 40 }}>
          <FeatureCheckboxGrid theme={theme} t={t} selected={selected} onToggle={toggle} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: theme.textPrimary }}>
            {t('common.cancel')}
          </button>
          <button onClick={approve} disabled={approving} style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: approving ? 0.6 : 1 }}>
            {approving ? t('settings.generating') : t('settings.approveRequest')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CodeRequests() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const confirm = useConfirm();
  const { onCodeRequestsChanged } = useOutletContext();
  const [requests, setRequests] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [approvingRequest, setApprovingRequest] = useState(null);

  const card = { background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 18 };
  const outlineButton = { background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' };

  const load = () => api.listCodeRequests().then((r) => setRequests(r.requests));

  useEffect(() => {
    load();
  }, []);

  const reject = async (r) => {
    const ok = await confirm({ message: t('settings.confirmRejectRequest', { name: r.name }), confirmLabel: t('settings.rejectRequest') });
    if (!ok) return;
    setBusyId(r.id);
    try {
      await api.rejectCodeRequest(r.id);
      await load();
      onCodeRequestsChanged();
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (r) => {
    setBusyId(r.id);
    try {
      await api.deleteCodeRequest(r.id);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const copyCode = async (code, id) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId((v) => (v === id ? null : v)), 1500);
    } catch {
      /* clipboard unavailable — the code is still selectable/visible */
    }
  };

  if (!requests) return null;

  const pending = requests.filter((r) => r.status === 'pending');
  const handled = requests.filter((r) => r.status !== 'pending');

  return (
    <>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="mail" size={14} color={theme.textMuted} /> {t('settings.codeRequests')}
          </div>
          {pending.length > 0 && (
            <span style={{ fontSize: 11, fontWeight: 800, background: 'oklch(0.6 0.2 25 / 0.15)', color: 'oklch(0.55 0.18 25)', padding: '2px 9px', borderRadius: 20 }}>
              {pending.length}
            </span>
          )}
        </div>

        {requests.length === 0 && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('settings.noCodeRequestsYet')}</div>}

        {pending.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pending.map((r) => {
              const busy = busyId === r.id;
              return (
                <div key={r.id} style={{ padding: '10px 12px', borderRadius: 10, background: theme.subtleBg, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{r.name}</div>
                      <div style={{ fontSize: 11.5, color: theme.textMuted }}>{r.email}{r.professionalArea ? ` · ${r.professionalArea}` : ''}</div>
                    </div>
                    <div style={{ fontSize: 10.5, color: theme.textMuted, flexShrink: 0, whiteSpace: 'nowrap' }}>{new Date(r.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div style={{ fontSize: 12, color: theme.textPrimary, whiteSpace: 'pre-wrap' }}>{r.reason}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                    <button
                      onClick={() => setApprovingRequest(r)}
                      disabled={busy}
                      style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}
                    >
                      {t('settings.approveRequest')}
                    </button>
                    <button onClick={() => reject(r)} disabled={busy} style={{ ...outlineButton, padding: '6px 12px', fontSize: 11.5, opacity: busy ? 0.6 : 1 }}>
                      {t('settings.rejectRequest')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {handled.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('settings.handledRequests')}
            </div>
            {handled.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, background: theme.subtleBg, opacity: 0.8 }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.name} <span style={{ color: theme.textMuted, fontWeight: 400 }}>({r.email})</span>
                </div>
                {r.status === 'approved' && r.inviteCode && (
                  <span onClick={() => copyCode(r.inviteCode.code, r.id)} style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700, color: theme.accentText, cursor: 'pointer', flexShrink: 0 }}>
                    {copiedId === r.id ? t('settings.copied') : r.inviteCode.code}
                  </span>
                )}
                <span style={{ fontSize: 10, fontWeight: 700, color: r.status === 'approved' ? theme.accentText : 'oklch(0.55 0.18 25)', textTransform: 'uppercase', flexShrink: 0 }}>
                  {r.status === 'approved' ? t('settings.requestApproved') : t('settings.requestRejected')}
                </span>
                <span onClick={() => dismiss(r)} title={t('common.delete')} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 15, padding: '0 2px', flexShrink: 0 }}>
                  &times;
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {approvingRequest && (
        <ApproveRequestModal
          theme={theme}
          t={t}
          request={approvingRequest}
          onClose={() => setApprovingRequest(null)}
          onApproved={() => { setApprovingRequest(null); load(); onCodeRequestsChanged(); }}
        />
      )}
    </>
  );
}
