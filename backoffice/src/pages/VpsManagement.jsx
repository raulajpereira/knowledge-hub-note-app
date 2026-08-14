import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';

function formatMb(mb) {
  if (mb == null) return null;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

function UsageBar({ theme, label, usedMb, totalMb, usedPct, raw }) {
  const known = usedPct != null;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
        <span>{label}</span>
        <span style={{ color: theme.textMuted }}>
          {known ? `${formatMb(usedMb)} / ${formatMb(totalMb)} (${usedPct}%)` : raw ? `${raw.value} ${raw.unit || ''}` : '—'}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 5, background: theme.subtleBg, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%', borderRadius: 5, transition: 'width 0.3s',
            width: known ? `${Math.max(2, usedPct)}%` : '0%',
            background: known && usedPct > 85 ? 'oklch(0.6 0.18 30)' : theme.accent,
          }}
        />
      </div>
    </div>
  );
}

// Same feature as the "VPS" card in the product app's Settings (Team tab) —
// deliberately kept in both places rather than migrated, since it's useful
// from either surface. They talk to the same account (hostingerConnected
// lives on the User row), so connecting/disconnecting here also shows up
// there and vice versa.
export default function VpsManagement() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { user, refreshMe } = useAuth();
  const confirm = useConfirm();
  const card = { background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 18 };

  const connected = !!user?.hostingerConnected;
  const [tokenInput, setTokenInput] = useState('');
  const [tokenReveal, setTokenReveal] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const loadStatus = async () => {
    setLoadingStatus(true);
    setStatusError(false);
    try {
      const data = await api.getVpsStatus();
      setStatus(data);
    } catch {
      setStatusError(true);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (connected) loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  const connect = async () => {
    if (!tokenInput.trim()) return;
    setConnecting(true);
    setError('');
    try {
      await api.setHostingerToken(tokenInput.trim());
      setTokenInput('');
      await refreshMe();
    } catch (err) {
      setError(err.message || t('settings.vpsLoadError'));
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    const ok = await confirm({ message: t('settings.vpsDisconnectConfirm') });
    if (!ok) return;
    await api.clearHostingerToken();
    setStatus(null);
    await refreshMe();
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{t('settings.vps')}</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.vpsDesc')}</div>
        </div>
        {connected && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'oklch(0.55 0.15 145)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'oklch(0.55 0.15 145)' }} />
            {t('settings.vpsConnected')}
          </div>
        )}
      </div>

      {!connected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ position: 'relative', display: 'flex' }}>
            <input
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && connect()}
              type={tokenReveal ? 'text' : 'password'}
              placeholder={t('settings.vpsTokenPlaceholder')}
              style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 90px 9px 11px', fontSize: 12.5, fontFamily: 'var(--font-mono)', background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
            />
            <span onClick={() => setTokenReveal((v) => !v)} style={{ position: 'absolute', right: 74, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', opacity: 0.5, display: 'flex' }}>
              <Icon name={tokenReveal ? 'eyeOff' : 'eye'} size={15} />
            </span>
            <button
              onClick={connect}
              disabled={connecting || !tokenInput.trim()}
              style={{ position: 'absolute', right: 4, top: 4, bottom: 4, background: theme.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '0 12px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', opacity: connecting || !tokenInput.trim() ? 0.6 : 1 }}
            >
              {connecting ? t('settings.vpsConnecting') : t('settings.vpsConnect')}
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: theme.textMuted }}>{t('settings.vpsTokenHint')}</div>
          {error && <div style={{ fontSize: 12, color: 'oklch(0.55 0.18 25)' }}>{error}</div>}
        </div>
      )}

      {connected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loadingStatus && !status && <div style={{ fontSize: 13, color: theme.textMuted }}>{t('common.loading')}</div>}
          {statusError && <div style={{ fontSize: 12.5, color: 'oklch(0.55 0.18 25)' }}>{t('settings.vpsLoadError')}</div>}

          {status && (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {status.hostname && (
                  <div style={{ background: theme.subtleBg, borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600 }}>
                    {status.hostname}
                  </div>
                )}
                {status.plan && (
                  <div style={{ background: theme.subtleBg, borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600 }}>
                    {status.plan}
                  </div>
                )}
                {status.state && (
                  <div style={{ background: theme.accentSoftBg, color: theme.accentText, borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, textTransform: 'capitalize' }}>
                    {status.state}
                  </div>
                )}
              </div>

              <UsageBar theme={theme} label={t('settings.vpsDisk')} usedMb={status.disk.usedMb} totalMb={status.disk.totalMb} usedPct={status.disk.usedPct} raw={status.disk.raw} />
              <UsageBar theme={theme} label={t('settings.vpsMemory')} usedMb={status.memory.usedMb} totalMb={status.memory.totalMb} usedPct={status.memory.usedPct} raw={status.memory.raw} />

              <div style={{ display: 'flex', gap: 20, fontSize: 12.5, color: theme.textMuted, flexWrap: 'wrap' }}>
                {status.cpu?.cores != null && <span>{t('settings.vpsCpuCores')}: {status.cpu.cores}</span>}
                {status.uptime && <span>{t('settings.vpsUptime')}: {Math.floor(status.uptime.value / 86400)}d</span>}
              </div>

              {status.metricsError && (
                <div style={{ fontSize: 11.5, color: 'oklch(0.6 0.15 40)', background: theme.subtleBg, borderRadius: 8, padding: '8px 10px' }}>
                  {t('settings.vpsMetricsError', { status: status.metricsError.status ?? '?' })}: {status.metricsError.body}
                </div>
              )}
              {status.metricsEmpty && (
                <div style={{ fontSize: 11.5, color: theme.textMuted }}>{t('settings.vpsNoData')}</div>
              )}
              {status.metricsRaw && (
                <textarea
                  readOnly
                  value={status.metricsRaw}
                  onClick={(e) => e.target.select()}
                  style={{ width: '100%', boxSizing: 'border-box', height: 90, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 10.5, background: theme.subtleBg, color: theme.textMuted, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 8 }}
                />
              )}
            </>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={loadStatus} disabled={loadingStatus} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
              {t('settings.vpsRefresh')}
            </button>
            <button onClick={disconnect} style={{ background: 'transparent', border: '1px solid oklch(0.55 0.18 25 / 0.35)', color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
              {t('settings.vpsDisconnect')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
