import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import FeatureCheckboxGrid, { FEATURE_KEYS } from '../components/FeatureCheckboxGrid.jsx';

function NewInviteCodeModal({ theme, t, creating, onClose, onCreate }) {
  const [selected, setSelected] = useState(new Set(FEATURE_KEYS));
  const toggle = (key) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', borderRadius: 14, padding: 22, width: 480, maxWidth: '92vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: 14, border: `1px solid ${theme.border}` }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{t('settings.generateCode')}</div>
          <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('settings.newCodeFeaturesDesc')}</div>
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
          <button onClick={() => onCreate([...selected])} disabled={creating} style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: creating ? 0.6 : 1 }}>
            {creating ? t('settings.generating') : t('settings.generateCode')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CreateCodes() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const confirm = useConfirm();
  const [codes, setCodes] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [newCodeOpen, setNewCodeOpen] = useState(false);

  const card = { background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 18 };

  const load = () => api.listInviteCodes().then((r) => setCodes(r.codes));

  useEffect(() => {
    load();
  }, []);

  const createCode = async (allowedFeatures) => {
    setGenerating(true);
    try {
      await api.createInviteCode({ allowedFeatures });
      await load();
      setNewCodeOpen(false);
    } finally {
      setGenerating(false);
    }
  };

  const copyCode = async (c) => {
    try {
      await navigator.clipboard.writeText(c.code);
      setCopiedId(c.id);
      setTimeout(() => setCopiedId((v) => (v === c.id ? null : v)), 1500);
    } catch {
      /* clipboard unavailable — user can still select and copy the text manually */
    }
  };

  const revokeCode = async (c) => {
    const ok = await confirm({ message: t('settings.confirmRevokeCode', { code: c.code }) });
    if (!ok) return;
    await api.revokeInviteCode(c.id);
    await load();
  };

  // The same endpoint hard-deletes a code that's already revoked (see
  // server/src/routes/auth.routes.js) — revoke is a soft first step, this is
  // the actual removal from the list.
  const deleteCode = async (c) => {
    const ok = await confirm({ message: t('backoffice.confirmDeleteCode', { code: c.code }), confirmLabel: t('common.delete') });
    if (!ok) return;
    await api.revokeInviteCode(c.id);
    await load();
  };

  if (!codes) return null;
  const activeCodes = codes.filter((c) => !c.usedAt && !c.revokedAt);

  return (
    <>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="lock" size={14} color={theme.textMuted} /> {t('settings.inviteCodes')}
            </div>
            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{activeCodes.length} {t('settings.statPendingCodes').toLowerCase()}</div>
          </div>
          <button
            onClick={() => setNewCodeOpen(true)}
            disabled={generating}
            style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: generating ? 0.6 : 1 }}
          >
            {generating ? t('settings.generating') : t('settings.generateCode')}
          </button>
        </div>
        {codes.length === 0 && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('settings.noCodesYet')}</div>}
        {codes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {codes.map((c) => {
              const status = c.usedAt ? 'used' : c.revokedAt ? 'revoked' : 'pending';
              const statusLabel = { pending: t('settings.codePending'), used: t('settings.codeUsed', { name: c.usedBy?.name || '' }), revoked: t('settings.codeRevoked') }[status];
              const statusColor = { pending: theme.accentText, used: theme.textMuted, revoked: 'oklch(0.55 0.18 25)' }[status];
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: theme.subtleBg }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, letterSpacing: '0.03em' }}>{c.code}</span>
                  {status === 'pending' && (
                    <span onClick={() => copyCode(c)} style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, color: theme.accentText }}>
                      {copiedId === c.id ? t('settings.copied') : t('common.copy')}
                    </span>
                  )}
                  <span style={{ flex: 1, fontSize: 11.5, color: statusColor, fontWeight: 600, textAlign: 'right' }}>{statusLabel}</span>
                  {status === 'pending' && (
                    <span onClick={() => revokeCode(c)} title={t('settings.revokeCode')} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 16, padding: '0 2px' }}>
                      &times;
                    </span>
                  )}
                  {status === 'revoked' && (
                    <span onClick={() => deleteCode(c)} title={t('common.delete')} style={{ cursor: 'pointer', color: 'oklch(0.55 0.18 25)', fontSize: 16, padding: '0 2px' }}>
                      &times;
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {activeCodes.length > 0 && <div style={{ fontSize: 11, color: theme.textMuted }}>{t('settings.codesHint')}</div>}
      </div>
      {newCodeOpen && (
        <NewInviteCodeModal theme={theme} t={t} creating={generating} onClose={() => setNewCodeOpen(false)} onCreate={createCode} />
      )}
    </>
  );
}
