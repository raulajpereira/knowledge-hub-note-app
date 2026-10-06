'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/brand/Logo';
import { AmbientBackground, Button, Glass, Pill, Tag } from '@/components/ui';
import { api } from '@/lib/client/api';
import { useI18n } from '@/i18n/client';

export function AppHome(props: {
  name: string;
  tenant: string;
  plan: string;
  modules: string[];
  isAdmin: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    setBusy(true);
    await api('/auth/logout', {}).catch(() => {});
    router.replace('/login');
    router.refresh();
  };

  return (
    <>
      <AmbientBackground />
      <main
        className="kh-above"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Glass
          variant="panel"
          style={{
            width: 'min(640px, 100%)',
            padding: 34,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          <Logo size={40} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: '-.03em' }}>
              {t('app_hello').replace('{name}', props.name)}
            </h1>
            <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{t('app_soon')}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <Pill>{props.tenant}</Pill>
            <Tag tone="info">
              {t('app_plan')} {props.plan}
            </Tag>
            {props.isAdmin && <Tag tone="danger">{t('app_admin')}</Tag>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span
              style={{
                fontSize: 11,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color: 'var(--text-3)',
              }}
            >
              {t('app_modules')}
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {props.modules.map((m) => (
                <Pill key={m}>{m}</Pill>
              ))}
            </div>
          </div>
          <div>
            <Button variant="glass" onClick={logout} loading={busy}>
              {t('app_logout')}
            </Button>
          </div>
        </Glass>
      </main>
    </>
  );
}
