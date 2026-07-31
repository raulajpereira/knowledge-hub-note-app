import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { api } from '../api.js';
import { backdropClose } from '../lib/backdropClose.js';
import Icon from './Icon.jsx';
import { hueForModule } from '../lib/transactionsMeta.js';

function ResultRow({ tx, theme, copied, onClick }) {
  const hue = hueForModule(tx.module);
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 10px', borderRadius: 9, cursor: 'pointer' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = theme.subtleBg)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 11.5, color: theme.accentText,
          background: theme.accentSoftBg, padding: '3px 7px', borderRadius: 6, flexShrink: 0, whiteSpace: 'nowrap',
        }}
      >
        {tx.tcode}
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: theme.textPrimary, lineHeight: 1.4 }}>
        {tx.description}
      </span>
      {copied ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 800, color: 'oklch(0.6 0.17 145)', flexShrink: 0 }}>
          <Icon name="check" size={12} color="oklch(0.6 0.17 145)" />
        </span>
      ) : (
        <span
          style={{
            fontSize: 10, fontWeight: 700, color: `oklch(0.32 0.17 ${hue})`, background: `oklch(0.90 0.11 ${hue})`,
            padding: '2px 7px', borderRadius: 5, flexShrink: 0, whiteSpace: 'nowrap',
          }}
        >
          {tx.module}
        </span>
      )}
    </div>
  );
}

export default function TransactionsQuickSearch() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    if (open) {
      api.listTransactions().then(({ transactions }) => setTransactions(transactions));
    }
  }, [open]);

  const openPopup = () => {
    setQuery('');
    setOpen(true);
  };

  const topUsed = useMemo(
    () => [...transactions].sort((a, b) => b.usageCount - a.usageCount).slice(0, 5),
    [transactions]
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return transactions.filter(
      (tx) =>
        tx.tcode.toLowerCase().includes(q) ||
        tx.description.toLowerCase().includes(q) ||
        (tx.program || '').toLowerCase().includes(q) ||
        tx.module.toLowerCase().includes(q)
    );
  }, [transactions, query]);

  const copyTcode = (tx) => {
    navigator.clipboard.writeText(tx.tcode).catch(() => {});
    api.useTransaction(tx.id).catch(() => {});
    setCopiedId(tx.id);
    setTimeout(() => {
      setOpen(false);
      setQuery('');
      setCopiedId(null);
    }, 700);
  };

  return (
    <>
      <div
        onClick={openPopup}
        title={t('transactions.headerButton')}
        style={{
          display: 'flex', alignItems: 'center', gap: 7, height: 38, borderRadius: 19, padding: '0 15px 0 13px',
          cursor: 'pointer', flexShrink: 0, background: '#fff', color: theme.accentText,
          border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
        }}
      >
        <Icon name="terminal" size={15} color={theme.accentText} />
        <span style={{ fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{t('transactions.headerButton')}</span>
      </div>

      {open && (
        <div
          onMouseDown={backdropClose(() => setOpen(false))}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 620, maxWidth: '100%', maxHeight: '80vh', overflowY: 'auto', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff',
              border: `1px solid ${theme.border}`, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 14,
              boxShadow: '0 24px 70px rgba(0,0,0,0.45)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800 }}>
                <Icon name="terminal" size={16} color={theme.accentText} />
                {t('transactions.headerButton')}
              </div>
              <span onClick={() => setOpen(false)} style={{ cursor: 'pointer', opacity: 0.6, fontSize: 20, lineHeight: 1 }}>&times;</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '10px 12px' }}>
              <Icon name="search" size={14} color={theme.textMuted} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('transactions.quickSearchPlaceholder')}
                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: theme.textPrimary, flex: 1 }}
              />
            </div>

            {!query.trim() ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 2px' }}>
                  <Icon name="sparkle" size={11} color={theme.accentText} /> {t('transactions.mostSearched')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {topUsed.map((tx) => (
                    <ResultRow key={tx.id} tx={tx} theme={theme} copied={copiedId === tx.id} onClick={() => copyTcode(tx)} />
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 2px' }}>
                  {results.length === 1 ? t('transactions.resultSingular') : t('transactions.results', { n: results.length })}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {results.length === 0 && (
                    <div style={{ fontSize: 12.5, color: theme.textMuted, padding: '10px 2px' }}>{t('transactions.noResults')}</div>
                  )}
                  {results.map((tx) => (
                    <ResultRow key={tx.id} tx={tx} theme={theme} copied={copiedId === tx.id} onClick={() => copyTcode(tx)} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
