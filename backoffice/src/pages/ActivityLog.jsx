import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { api } from '../api.js';

const AUDIT_ACTION_HUES = { create: 145, update: 230, delete: 25, login: 145, login_failed: 25, register: 280 };

function AuditActionBadge({ action }) {
  const hue = AUDIT_ACTION_HUES[action] ?? 280;
  return (
    <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap', background: `oklch(0.90 0.10 ${hue})`, color: `oklch(0.35 0.15 ${hue})` }}>
      {action}
    </span>
  );
}

export default function ActivityLog() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const confirm = useConfirm();
  const [entries, setEntries] = useState(null);
  const [entityTypes, setEntityTypes] = useState([]);
  const [actorEmails, setActorEmails] = useState([]);
  const [entityType, setEntityType] = useState('');
  const [actorEmail, setActorEmail] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [purgeDays, setPurgeDays] = useState(90);
  const [purging, setPurging] = useState(false);

  const card = { background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 18 };
  const filters = () => ({ ...(entityType ? { entityType } : {}), ...(actorEmail ? { actorEmail } : {}) });

  const load = (params, append) => {
    api.listAuditLog(params).then((r) => {
      setEntries((prev) => (append ? [...(prev || []), ...r.entries] : r.entries));
      setEntityTypes(r.entityTypes);
      setActorEmails(r.actorEmails || []);
      setNextCursor(r.nextCursor);
    });
  };

  useEffect(() => {
    load(filters(), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, actorEmail]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const r = await api.listAuditLog({ ...filters(), cursor: nextCursor });
      setEntries((prev) => [...(prev || []), ...r.entries]);
      setNextCursor(r.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const purge = async () => {
    const days = Number(purgeDays);
    if (!Number.isFinite(days) || days < 0) return;
    const ok = await confirm({ message: t('settings.auditLogPurgeConfirm', { days }), confirmLabel: t('settings.auditLogPurge') });
    if (!ok) return;
    setPurging(true);
    try {
      await api.purgeAuditLog(days);
      load(filters(), false);
    } finally {
      setPurging(false);
    }
  };

  if (!entries) return null;

  const selectStyle = { border: `1px solid ${theme.border}`, borderRadius: 8, padding: '6px 9px', fontSize: 12, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', colorScheme: theme.dark ? 'dark' : 'light' };
  const optionStyle = { color: '#1a1a1a', background: '#fff' };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{t('settings.auditLog')}</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.auditLogDesc')}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select value={actorEmail} onChange={(e) => setActorEmail(e.target.value)} style={selectStyle}>
            <option value="" style={optionStyle}>{t('backoffice.auditLogAllAccounts')}</option>
            {actorEmails.map((e) => <option key={e} value={e} style={optionStyle}>{e}</option>)}
          </select>
          <select value={entityType} onChange={(e) => setEntityType(e.target.value)} style={selectStyle}>
            <option value="" style={optionStyle}>{t('settings.auditLogAllTypes')}</option>
            {entityTypes.map((e) => <option key={e} value={e} style={optionStyle}>{e}</option>)}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11.5, color: theme.textMuted }}>{t('settings.auditLogPurgeOlderThan')}</span>
            <input
              type="number"
              min={0}
              value={purgeDays}
              onChange={(e) => setPurgeDays(e.target.value)}
              style={{ width: 56, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '6px 7px', fontSize: 12, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
            />
            <span style={{ fontSize: 11.5, color: theme.textMuted }}>{t('settings.auditLogPurgeDays')}</span>
          </div>
          <button
            onClick={purge}
            disabled={purging}
            style={{ background: 'transparent', border: `1px solid oklch(0.55 0.18 25)`, color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: purging ? 0.6 : 1 }}
          >
            {purging ? t('common.saving') : t('settings.auditLogPurge')}
          </button>
        </div>
      </div>

      {entries.length === 0 && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('settings.auditLogEmpty')}</div>}

      {entries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 480, overflowY: 'auto' }}>
          {entries.map((e) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: theme.subtleBg, fontSize: 12 }}>
              <AuditActionBadge action={e.action} />
              <span style={{ fontWeight: 700, flexShrink: 0 }}>{e.entityType}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: theme.textMuted }}>
                {e.actorEmail || t('settings.auditLogUnknownActor')}{e.summary ? ` — ${e.summary}` : ''}
              </span>
              <span style={{ flexShrink: 0, color: theme.textMuted, fontSize: 10.5 }}>{new Date(e.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {nextCursor && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          style={{ alignSelf: 'center', background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: loadingMore ? 0.6 : 1 }}
        >
          {t('settings.auditLogLoadMore')}
        </button>
      )}
    </div>
  );
}
