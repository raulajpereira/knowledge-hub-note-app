'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { Modal, useToast } from '@/components/ui';
import { APP_VERSION } from './AboutModal';

/** "Reportar problema": a message, sent with the page, the browser and the app version. */
export function ReportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const path = usePathname();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent.slice(0, 300);
  const send = async () => {
    if (!msg.trim()) return;
    setBusy(true);
    try {
      await api('/support', { message: msg.trim(), page: path, ua, version: APP_VERSION });
      toast({ message: t('rp_sent'), tone: 'success' });
      setMsg('');
      onClose();
    } catch {
      toast({ message: t('rp_fail'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('rp_title')}
      subtitle={t('rp_sub')}
      closeLabel={t('ui_close')}
      footer={
        <>
          <button type="button" className="kh-btn kh-btn--ghost" onClick={onClose}>
            {t('tl_cancel')}
          </button>
          <button
            type="button"
            className="kh-btn kh-btn--primary"
            disabled={busy || !msg.trim()}
            onClick={() => void send()}
          >
            {t('rp_send')}
          </button>
        </>
      }
    >
      <label className="kh-field">
        <span className="kh-field__label">{t('rp_what')}</span>
        <textarea
          className="kh-input"
          style={{
            height: 'auto',
            minHeight: 130,
            padding: '10px 14px',
            resize: 'vertical',
            font: 'inherit',
          }}
          maxLength={4000}
          value={msg}
          placeholder={t('rp_ph')}
          onChange={(e) => setMsg(e.target.value)}
          autoFocus
        />
      </label>
      <p style={{ margin: '10px 0 0', fontSize: 12, opacity: 0.65 }}>
        {t('rp_auto')} {path} · {APP_VERSION}
      </p>
    </Modal>
  );
}
