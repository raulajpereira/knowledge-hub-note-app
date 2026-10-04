'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Logo } from '@/components/brand/Logo';
import { AmbientBackground, AMBIENTS, Segmented, Select, type AmbientName } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { CATALOG } from './catalog';

export function CatalogShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { lang, setLang, t } = useI18n();
  const [ambient, setAmbient] = useState<AmbientName>('Areia');

  return (
    <>
      <AmbientBackground ambient={ambient} />
      <div className="kh-above" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 24px 0' }}>
          <Link href="/ui" style={{ textDecoration: 'none' }}>
            <Logo size={40} />
          </Link>
          <span style={{ fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
            componentes · fase 1
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 180 }}>
              <Select
                aria-label="Fundo"
                value={ambient}
                options={Object.keys(AMBIENTS).map((k) => ({ value: k as AmbientName, label: k }))}
                onChange={setAmbient}
                searchPlaceholder={t('ui_search')}
              />
            </div>
            <Segmented
              label="Idioma"
              value={lang}
              onChange={setLang}
              options={[
                { value: 'pt', label: 'PT' },
                { value: 'en', label: 'EN' },
              ]}
            />
          </div>
        </header>
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '240px minmax(0,1fr)',
            gap: 20,
            padding: 24,
          }}
        >
          <nav
            className="kh-glass kh-glass--panel"
            style={{
              alignSelf: 'start',
              position: 'sticky',
              top: 24,
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {CATALOG.map((c) => {
              const active = pathname.endsWith(`/ui/${c.slug}`);
              return (
                <Link
                  key={c.slug}
                  href={`/ui/${c.slug}`}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    height: 40,
                    padding: '0 14px',
                    borderRadius: 14,
                    fontSize: 14,
                    textDecoration: 'none',
                    color: '#fbf8f5',
                    background: active
                      ? 'linear-gradient(180deg,rgba(255,255,255,.28),rgba(255,255,255,.14))'
                      : 'transparent',
                    border: `1px solid ${active ? 'rgba(255,255,255,.3)' : 'transparent'}`,
                  }}
                >
                  {c.title}
                </Link>
              );
            })}
          </nav>
          <main style={{ minWidth: 0 }}>{children}</main>
        </div>
      </div>
    </>
  );
}
