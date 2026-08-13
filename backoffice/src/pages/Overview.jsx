import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { api } from '../api.js';

const AUDIT_ACTION_HUES = { create: 145, update: 230, delete: 25, login: 145, login_failed: 25, register: 280 };

function Tile({ theme, n, l, warn }) {
  return (
    <div style={{ background: theme.cardBg, border: `1px solid ${warn ? theme.accent + '66' : theme.border}`, borderRadius: 14, padding: '18px 18px 16px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: warn ? theme.accentText : theme.textPrimary }}>{n}</div>
      <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 3 }}>{l}</div>
    </div>
  );
}

export default function Overview() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [recentLog, setRecentLog] = useState([]);

  useEffect(() => {
    Promise.all([
      api.listCodeRequests(),
      api.listAdminUsers(),
      api.listInviteCodes(),
      api.listDocTemplatesAdmin(),
      api.listAuditLog(),
    ]).then(([requests, users, codes, templates, log]) => {
      setStats({
        pending: requests.requests.filter((r) => r.status === 'pending').length,
        accounts: users.users.length,
        unusedCodes: codes.codes.filter((c) => !c.usedAt && !c.revokedAt).length,
        templates: templates.templates.length,
      });
      setPendingRequests(requests.requests.filter((r) => r.status === 'pending').slice(0, 5));
      setRecentLog(log.entries.slice(0, 6));
    });
  }, []);

  if (!stats) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
        <Tile theme={theme} n={stats.pending} l={t('backoffice.tilePendingRequests')} warn={stats.pending > 0} />
        <Tile theme={theme} n={stats.accounts} l={t('backoffice.tileActiveAccounts')} />
        <Tile theme={theme} n={stats.unusedCodes} l={t('backoffice.tileUnusedCodes')} />
        <Tile theme={theme} n={stats.templates} l={t('backoffice.tileTemplates')} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 16 }}>
        <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>{t('backoffice.pendingRequestsPanel')}</span>
            {stats.pending > 0 && (
              <span onClick={() => navigate('/pedidos-de-codigo')} style={{ fontSize: 12, fontWeight: 700, color: theme.accentText, cursor: 'pointer' }}>
                {t('backoffice.viewAll')}
              </span>
            )}
          </div>
          {pendingRequests.length === 0 && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('settings.noCodeRequestsYet')}</div>}
          {pendingRequests.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', borderBottom: `1px solid ${theme.border}` }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{r.name}</div>
                <div style={{ fontSize: 11.5, color: theme.textMuted, fontFamily: 'var(--font-mono)' }}>{r.email}</div>
              </div>
              <div style={{ flex: 1, fontSize: 12, color: theme.textMuted }}>{r.professionalArea}</div>
              <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '3px 9px', borderRadius: 20, background: theme.accentSoftBg, color: theme.accentText }}>
                {t('backoffice.pending')}
              </span>
            </div>
          ))}
        </div>

        <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 14 }}>{t('backoffice.recentActivityPanel')}</div>
          {recentLog.length === 0 && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('settings.auditLogEmpty')}</div>}
          {recentLog.map((e) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: `1px solid ${theme.border}`, fontSize: 12.5 }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: theme.textMuted, width: 56, flexShrink: 0 }}>
                {new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span
                style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: `oklch(0.65 0.18 ${AUDIT_ACTION_HUES[e.action] ?? 280})`,
                }}
              />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.entityType}{e.summary ? ` — ${e.summary}` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
