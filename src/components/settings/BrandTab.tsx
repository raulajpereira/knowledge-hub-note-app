'use client';

/* eslint-disable @next/next/no-img-element -- the user's logo, streamed by our API */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Logo } from '@/components/brand/Logo';
import { useShell } from '@/components/shell/ShellContext';
import { assetUrl } from '@/components/shell/assetUrl';
import { removeImage, uploadImage } from '@/components/shell/uploadImage';
import { useI18n } from '@/i18n/client';
import { Card, imageError } from './LookTab';

/** Marca: the company logo replaces the KnowledgeHub mark in the top bar. */
export function BrandTab() {
  const { t } = useI18n();
  const router = useRouter();
  const { me } = useShell();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const v = me.assets.logo;

  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    setMsg(t('set_uploading'));
    try {
      await uploadImage('logo', f);
      setMsg('');
      router.refresh();
    } catch (x) {
      setMsg(imageError(x, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t('logoTitle')} desc={t('logoDesc')}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            height: 72,
            minWidth: 220,
            padding: '0 22px',
            borderRadius: 999,
            background: 'linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,.07))',
            border: '1px solid rgba(255,255,255,.2)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.3)',
          }}
        >
          {v ? (
            <img
              src={assetUrl('logo', v)}
              alt="Logo"
              style={{ height: 44, maxWidth: 220, objectFit: 'contain', display: 'block' }}
            />
          ) : (
            <>
              <Logo size={45} showWordmark={false} />
              <div style={{ fontWeight: 600, fontSize: 20, letterSpacing: '-.02em', whiteSpace: 'nowrap' }}>
                <span>Knowledge</span>
                <span style={{ color: 'var(--accent)' }}>Hub</span>
              </div>
            </>
          )}
        </div>
        <label className="kh-set__solid">
          {t('uploadLogo')}
          <input type="file" accept="image/*" onChange={onLogo} style={{ display: 'none' }} disabled={busy} />
        </label>
        {v && (
          <button
            type="button"
            className="kh-set__soft"
            onClick={async () => {
              await removeImage('logo');
              router.refresh();
            }}
          >
            {t('resetLogo')}
          </button>
        )}
        <span role="status" style={{ fontSize: 13, color: 'rgba(255,248,240,.6)' }}>
          {msg}
        </span>
      </div>
    </Card>
  );
}
