'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui';
import { api, isApiFailure } from '@/lib/client/api';
import { useI18n } from '@/i18n/client';
import { Icon } from './icons';

// "Exportar os meus dados" (Conta e Dados): ask for a ZIP, follow its status
// (pedido → a preparar → pronto / expirado) and download it while signed in.

type ExportInfo = {
  id: string;
  status: 'pending' | 'running' | 'ready' | 'failed' | 'expired';
  size: number | null;
  createdAt: string;
  finishedAt: string | null;
  expiresAt: string | null;
};

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

const fmtSize = (n: number) =>
  n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export function ExportCard() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [cur, setCur] = useState<ExportInfo | null | undefined>(undefined);
  const [left, setLeft] = useState(3);
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      api<{ exports: ExportInfo[]; left: number }>('/me/exports')
        .then((r) => {
          setCur(r.exports[0] ?? null);
          setLeft(r.left);
        })
        .catch(() => setCur(null)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  // follow a request being prepared
  const working = cur?.status === 'pending' || cur?.status === 'running';
  useEffect(() => {
    if (!working) return;
    const h = setInterval(() => void load(), 4000);
    return () => clearInterval(h);
  }, [working, load]);

  const ask = async () => {
    setBusy(true);
    try {
      const r = await api<{ export: ExportInfo }>('/me/exports', {});
      setCur(r.export);
      setLeft((n) => Math.max(0, n - 1));
    } catch (e) {
      toast({
        message: t(
          isApiFailure(e) && e.code === 'rate_limited'
            ? 'exp_limit'
            : isApiFailure(e) && e.code === 'export_in_progress'
              ? 'exp_busy'
              : 'exp_fail',
        ),
        tone: 'error',
      });
      void load();
    } finally {
      setBusy(false);
    }
  };

  const when = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'en' ? 'en-GB' : 'pt-PT', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  const status = cur?.status;
  const chip =
    status === 'pending'
      ? { label: t('exp_stPending'), bg: 'rgba(255,255,255,.16)' }
      : status === 'running'
        ? { label: t('exp_stRunning'), bg: 'oklch(0.75 0.11 245 / .35)' }
        : status === 'ready'
          ? { label: t('exp_stReady'), bg: 'oklch(0.72 0.13 155 / .4)' }
          : status === 'expired'
            ? { label: t('exp_stExpired'), bg: 'rgba(255,255,255,.1)' }
            : status === 'failed'
              ? { label: t('exp_stFailed'), bg: 'oklch(0.6 0.16 28 / .4)' }
              : null;

  return (
    <div className="kh-acc-card" id="kh-acc-export" data-export-status={status ?? 'none'}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span
          aria-hidden="true"
          style={{
            width: 38,
            height: 38,
            flex: 'none',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,.14)',
          }}
        >
          <Icon name="download" size={17} sw={2} />
        </span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="kh-acc-card__title">{t('exp_title')}</span>
          <span className="kh-acc-card__sub">{t('exp_sub')}</span>
        </div>
        {chip && (
          <span
            role="status"
            className="kh-exp-chip"
            style={{
              flex: 'none',
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              background: chip.bg,
              border: '1px solid rgba(255,255,255,.18)',
            }}
          >
            {chip.label}
          </span>
        )}
      </div>

      {cur && (
        <div style={{ fontSize: 12.5, color: 'rgba(255,248,240,.78)', lineHeight: 1.5 }}>
          {status === 'ready' && cur.expiresAt
            ? t('exp_readyLine')
                .replace('{size}', fmtSize(cur.size ?? 0))
                .replace('{d}', when(cur.expiresAt))
            : status === 'expired'
              ? t('exp_expiredLine').replace('{d}', when(cur.createdAt))
              : status === 'failed'
                ? t('exp_failedLine')
                : t('exp_workLine').replace('{d}', when(cur.createdAt))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {status === 'ready' && (
          <a
            className="kh-btn-solid"
            style={{
              height: 40,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              textDecoration: 'none',
            }}
            href={`${BASE}/api/v1/me/exports/${cur!.id}/download`}
            download
          >
            <Icon name="download" size={15} sw={2} />
            {t('exp_download')}
          </a>
        )}
        {!working && cur !== undefined && (
          <button
            type="button"
            className={status === 'ready' ? 'kh-acc__wide' : 'kh-btn-solid'}
            style={{ height: 40, padding: '0 16px' }}
            onClick={() => void ask()}
            aria-disabled={busy || left === 0}
            disabled={busy || left === 0}
          >
            {status ? t('exp_again') : t('exp_ask')}
          </button>
        )}
        {working && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span className="kh-exp-spin" aria-hidden="true" />
            {t('exp_wait')}
          </span>
        )}
        <span style={{ fontSize: 12, color: 'rgba(255,248,240,.6)' }}>
          {left === 0 ? t('exp_none') : t('exp_left').replace('{n}', String(left))}
        </span>
      </div>
    </div>
  );
}
