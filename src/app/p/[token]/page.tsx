import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getLang } from '@/i18n/server';
import { translate, type AppKey } from '@/i18n';
import { Logo } from '@/components/brand/Logo';
import { PublicPassword } from '@/components/share/PublicPassword';
import { docHtml } from '@/server/share/render';
import { findLink, isUnlocked, publicItem, unlockCookie } from '@/server/share/links';
import { fmtBytes, previewKind } from '@/lib/drive';
import '@/components/notes/notes.css';
import '@/components/share/public.css';

export const metadata: Metadata = { title: 'KnowledgeHub', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

/**
 * The public, read-only page of a shared note or artifact (`/p/<token>`).
 * No session: the link is looked up by the hash of its token; a password,
 * when set, is asked first; expired/removed links show the same "gone" card.
 */
export default async function PublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lang = await getLang();
  const t = (k: string) => translate(lang, k as AppKey) as string;
  const f = await findLink(token);
  const unlocked = f ? isUnlocked(f, (await cookies()).get(unlockCookie(f))?.value) : false;
  const item = f && unlocked ? await publicItem(f, true) : null;
  const when = item
    ? new Date(item.updatedAt).toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-PT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  return (
    <div className="kh-pub">
      <header className="kh-pub__top">
        <Logo size={34} />
        <span className="kh-pub__badge">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          {t('sh_pubReadOnly')}
        </span>
      </header>
      {f && !unlocked ? (
        <main className="kh-pub__center">
          <PublicPassword
            token={token}
            labels={{
              title: t('sh_pubPwdTitle'),
              sub: t('sh_pubPwdSub'),
              ph: t('sh_pubPwdPh'),
              open: t('sh_pubOpen'),
              wrong: t('sh_pubWrong'),
            }}
          />
        </main>
      ) : !item ? (
        <main className="kh-pub__center">
          <div className="kh-glass kh-glass--panel kh-pub__card" role="status">
            <span className="kh-pub__icon" aria-hidden="true">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
                <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
                <path d="M3 3l18 18" />
              </svg>
            </span>
            <h1 className="kh-pub__h">{t('sh_pubGone')}</h1>
            <p className="kh-pub__p">{t('sh_pubGoneSub')}</p>
          </div>
        </main>
      ) : item.type === 'note' ? (
        <main className="kh-pub__main">
          <article className="kh-glass kh-glass--panel kh-pub__doc">
            <h1 className="kh-pub__title">{item.title || '—'}</h1>
            <div className="kh-pub__meta">
              {t('sh_pubUpdated')} {when}
            </div>
            <div
              className="kh-ne kh-pub__ne"
              // docHtml escapes every text and attribute of the validated document
              dangerouslySetInnerHTML={{
                __html: docHtml(item.doc, (id) => `${BASE}/api/v1/public/${token}/files/${id}`),
              }}
            />
          </article>
        </main>
      ) : item.type === 'file' ? (
        <main className="kh-pub__main kh-pub__main--wide">
          <div className="kh-pub__arthead">
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 className="kh-pub__title">{item.title}</h1>
              <p className="kh-pub__p">
                {fmtBytes(item.size, lang)} · {t('sh_pubUpdated')} {when}
              </p>
            </div>
            <a className="kh-pub__btn" href={`${BASE}/api/v1/public/${token}/raw?dl=1`}>
              {t('fl_download')}
            </a>
          </div>
          {(() => {
            const src = `${BASE}/api/v1/public/${token}/raw`;
            const k = previewKind(item.title);
            if (k === 'pdf') return <iframe className="kh-pub__frame" src={src} title={item.title} />;
            if (k === 'image')
              return (
                // eslint-disable-next-line @next/next/no-img-element -- a stored file, not a static asset
                <img className="kh-pub__img" src={src} alt={item.title} />
              );
            if (k === 'video') return <video className="kh-pub__img" src={src} controls preload="metadata" />;
            if (k === 'audio')
              return <audio src={src} controls preload="metadata" style={{ width: '100%' }} />;
            return (
              <div className="kh-glass kh-glass--panel kh-pub__card kh-pub__nofile">{t('fl_noPreview')}</div>
            );
          })()}
        </main>
      ) : (
        <main className="kh-pub__main kh-pub__main--wide">
          <div className="kh-pub__arthead">
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 className="kh-pub__title">{item.title}</h1>
              {item.description && <p className="kh-pub__p">{item.description}</p>}
            </div>
            <a
              className="kh-pub__btn"
              href={`${BASE}/api/v1/public/${token}/view`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('sh_pubOpenTab')}
            </a>
          </div>
          <iframe
            className="kh-pub__frame"
            src={`${BASE}/api/v1/public/${token}/view`}
            sandbox="allow-scripts allow-popups allow-modals"
            referrerPolicy="no-referrer"
            title={item.title}
          />
        </main>
      )}
      <footer className="kh-pub__foot">{t('sh_pubShared')}</footer>
    </div>
  );
}
