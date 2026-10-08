import Link from 'next/link';
import { env } from '@/lib/env';
import { getLang } from '@/i18n/server';
import { translate } from '@/i18n';
import { PublicFrame } from '@/components/landing/PublicFrame';
import { LEGAL } from './content';

/** Termos / Privacidade: drafted texts filled with LEGAL_* from .env. */
export async function LegalPage({ doc }: { doc: 'terms' | 'privacy' }) {
  const lang = await getLang();
  const t = (k: string) => translate(lang, k as never) as string;
  const e = env();
  const unset = t('lg_unset');
  const vars: Record<string, string> = {
    entity: e.LEGAL_ENTITY_NAME || unset,
    nif: e.LEGAL_ENTITY_NIF || unset,
    address: e.LEGAL_ENTITY_ADDRESS || unset,
    email: e.LEGAL_CONTACT_EMAIL || unset,
  };
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? '');
  const d = LEGAL[doc][lang];
  const updated = e.LEGAL_UPDATED_AT
    ? new Date(`${e.LEGAL_UPDATED_AT}T12:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-PT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;
  return (
    <PublicFrame entity={{ name: e.LEGAL_ENTITY_NAME || 'KnowledgeHub', email: e.LEGAL_CONTACT_EMAIL ?? '' }}>
      <article className="kh-lp-doc kh-glass kh-glass--panel">
        <Link href="/" className="kh-lp-doc__back">
          ← {t('lg_back')}
        </Link>
        <h1>{d.title}</h1>
        {updated && (
          <p className="kh-lp-doc__meta">
            {t('lg_updated')}: {updated}
          </p>
        )}
        {!e.LEGAL_REVIEWED && (
          <p className="kh-lp-doc__draft" role="note">
            {t('lg_draft')}
          </p>
        )}
        <p>{fill(d.intro)}</p>
        {d.sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            {s.p.map((x, i) => (
              <p key={i}>{fill(x)}</p>
            ))}
          </section>
        ))}
      </article>
    </PublicFrame>
  );
}
