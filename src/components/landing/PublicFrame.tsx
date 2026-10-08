'use client';

import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { Segmented } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import './landing.css';

export type Entity = { name: string; email: string };

/** Landing and legal pages: brand, PT/EN, Entrar / Tenho um código, footer with the legal links. */
export function PublicFrame({ entity, children }: { entity: Entity; children: React.ReactNode }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="kh-lp">
      <span className="kh-lp__blob kh-lp__blob--a" aria-hidden="true" />
      <span className="kh-lp__blob kh-lp__blob--b" aria-hidden="true" />
      <header className="kh-lp__top">
        <Link href="/" className="kh-lp__brand" aria-label="KnowledgeHub">
          <Logo size={34} />
        </Link>
        <nav className="kh-lp__nav" aria-label="KnowledgeHub">
          <Segmented
            label="Idioma / Language"
            value={lang}
            onChange={setLang}
            options={[
              { value: 'pt', label: 'PT' },
              { value: 'en', label: 'EN' },
            ]}
          />
          <Link href="/register" className="kh-lp__link">
            {t('lp_navCode')}
          </Link>
          <Link href="/login" className="kh-lp__btn kh-lp__btn--light">
            {t('lp_navLogin')}
          </Link>
        </nav>
      </header>
      <main className="kh-lp__main">{children}</main>
      <footer className="kh-lp__foot">
        <span>
          © {new Date().getFullYear()} {entity.name}. {t('lp_rights')}
        </span>
        <span className="kh-lp__footlinks">
          <Link href="/terms">{t('lp_terms')}</Link>
          <Link href="/privacy">{t('lp_privacy')}</Link>
          {entity.email && <a href={`mailto:${entity.email}`}>{t('lp_navContact')}</a>}
        </span>
      </footer>
    </div>
  );
}
