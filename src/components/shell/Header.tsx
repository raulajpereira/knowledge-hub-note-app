'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/brand/Logo';
import { useI18n } from '@/i18n/client';
import { assetUrl } from './assetUrl';
import { Icon } from './icons';
import { useShell } from './ShellContext';
import { TcodesPopup } from '@/components/sap/TcodesPopup';

function useClock(lang: string) {
  // Client-only (server and browser clocks differ → no hydration mismatch).
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const loc = lang === 'en' ? 'en-GB' : 'pt-PT';
  return {
    clock: now?.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) ?? ' ',
    date:
      now?.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) ?? '',
  };
}

export function Header({ onActivity, activityOpen }: { onActivity: () => void; activityOpen: boolean }) {
  const { t, lang } = useI18n();
  const [tcOpen, setTcOpen] = useState(false);
  const { modules, me, focus, toggleFocus, lock, query, setQuery } = useShell();
  const path = usePathname();
  const { clock, date } = useClock(lang);
  const isOwner = me.admin?.role === 'owner';

  return (
    <header className="kh-hdr">
      <Link href="/app" className="kh-hdr__brand" aria-label="KnowledgeHub">
        {modules.has('brand') && me.assets.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- the user's logo, streamed by our API
          <img
            src={assetUrl('logo', me.assets.logo)}
            alt="Logo"
            style={{ height: 34, maxWidth: 170, objectFit: 'contain', display: 'block' }}
          />
        ) : (
          <>
            <Logo size={45} showWordmark={false} />
            <div className="kh-hdr__word">
              <span>Knowledge</span>
              <span style={{ color: 'var(--accent)' }}>Hub</span>
            </div>
          </>
        )}
      </Link>

      <label className="kh-hdr__search kh-hdr__glass">
        <span style={{ display: 'flex', opacity: 0.65 }}>
          <Icon name="search" size={16} sw={2} />
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search')}
          aria-label={t('search')}
        />
      </label>

      {modules.has('tcodes') && (
        <button
          type="button"
          title="SAP TCodes"
          className="kh-hdr__pill kh-hdr__glass"
          aria-haspopup="dialog"
          onClick={() => setTcOpen(true)}
        >
          <Icon name="tcodes" size={18} />
          <span>SAP TCodes</span>
        </button>
      )}
      {tcOpen && <TcodesPopup onClose={() => setTcOpen(false)} />}
      {modules.has('news') && (
        <Link href="/app/news" title="SAP News" className="kh-hdr__btn kh-hdr__glass" aria-label="SAP News">
          <Icon name="news" size={18} />
        </Link>
      )}

      <div style={{ flex: 1 }} />

      <div className="kh-hdr__date">
        <span className="kh-hdr__clock">{clock}</span>
        <span className="kh-hdr__dtext">{date}</span>
      </div>

      {modules.has('whiteboard') && (
        <Link
          href="/app/whiteboard"
          title={t('nav_whiteboard')}
          aria-label={t('nav_whiteboard')}
          className="kh-hdr__btn kh-hdr__glass"
          data-on={path === '/app/whiteboard'}
        >
          <Icon name="whiteboard" />
        </Link>
      )}
      <button
        type="button"
        onClick={onActivity}
        title={t('activity')}
        aria-label={t('activity')}
        className="kh-hdr__btn kh-hdr__glass"
        data-on={activityOpen}
      >
        <Icon name="activity" />
      </button>
      <button
        type="button"
        onClick={toggleFocus}
        title={t('focus')}
        aria-label={t('focus')}
        aria-pressed={focus}
        className="kh-hdr__btn kh-hdr__glass"
        data-on={focus}
      >
        <Icon name="focus" />
      </button>
      <button
        type="button"
        title={t('shell_notifications')}
        aria-label={t('shell_notifications')}
        className="kh-hdr__btn kh-hdr__glass"
      >
        <Icon name="bell" />
      </button>

      <span className="kh-hdr__sep" />
      {isOwner && (
        <Link
          href="/admin"
          title={t('shell_adminLbl')}
          aria-label={t('shell_adminLbl')}
          className="kh-hdr__btn kh-hdr__btn--admin"
        >
          <Icon name="shield" sw={1.9} />
        </Link>
      )}
      <button
        type="button"
        onClick={lock}
        title={t('lock')}
        aria-label={t('lock')}
        className="kh-hdr__btn kh-hdr__btn--lock"
      >
        <Icon name="lock" />
      </button>
    </header>
  );
}
