'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useI18n } from '@/i18n/client';
import type { NavEntry } from '@/lib/prefs';
import { normalizeNav, sideRows } from './nav';
import { Crown, Icon, NavIcon } from './icons';
import { initials, tierGradient, tierOf } from './plan';
import { usePref } from './PrefsProvider';
import { useShell } from './ShellContext';

export function Sidebar() {
  const { t } = useI18n();
  const path = usePathname();
  const { me, modules, openAccount, openAbout } = useShell();
  const [saved, setNav] = usePref<NavEntry[] | undefined>('nav', undefined);
  const layout = useMemo(() => normalizeNav(saved), [saved]);
  const rows = useMemo(() => sideRows(layout, modules, t), [layout, modules, t]);
  const tier = tierOf(me.tenant.planCode);

  const toggleGroup = (index: number) => {
    const next = layout.map((e, i) => (i === index && e.type === 'group' ? { ...e, open: !e.open } : e));
    setNav(next);
  };
  const current = (href: string) => (path === href ? 'page' : undefined);

  return (
    <aside className="kh-aside" data-zs="" aria-label="Navigation">
      <nav className="kh-nav">
        {rows.map((r, i) =>
          r.kind === 'item' ? (
            <Link
              key={r.id}
              href={r.href}
              className={`kh-nav__item${r.nested ? ' kh-nav__item--nested' : ''}`}
              aria-current={current(r.href)}
            >
              <span className="kh-nav__icon">
                <NavIcon id={r.id} />
              </span>
              <span className="kh-nav__label">{r.label}</span>
              {r.count ? <span className="kh-nav__count">{r.count}</span> : null}
            </Link>
          ) : r.kind === 'group' ? (
            <button
              key={`g${r.index}`}
              type="button"
              className="kh-nav__group"
              aria-expanded={r.open}
              onClick={() => toggleGroup(r.index)}
            >
              <Icon name="chevDown" size={12} sw={2.6} />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.name}
              </span>
            </button>
          ) : (
            <div key={`s${i}`} className="kh-nav__spacer" role="separator" />
          ),
        )}
      </nav>
      <div className="kh-aside__fill" />

      {tier === 'FREE' && (
        <div className="kh-upgrade">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="kh-upgrade__crown">
              <Crown />
            </span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{t('shell_upTitle')}</span>
          </div>
          <div className="kh-upgrade__desc">{t('premiumDesc')}</div>
          <Link
            href="/app/pricing"
            className="kh-upgrade__cta"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
            }}
          >
            {t('premiumCta')}
          </Link>
        </div>
      )}

      {modules.has('notes') && (
        <Link href="/app/trash" className="kh-aside__btn" aria-current={current('/app/trash')}>
          <Icon name="trash" size={16} />
          <span style={{ flex: 1 }}>{t('nav_trash')}</span>
        </Link>
      )}
      <Link href="/app/settings" className="kh-aside__btn" aria-current={current('/app/settings')}>
        <Icon name="settings" size={16} />
        {t('settings')}
      </Link>
      <button type="button" className="kh-aside__btn" onClick={openAbout}>
        <Icon name="about" size={16} />
        {t('nav_about')}
      </button>
      <button type="button" className="kh-acct" title={t('acc_title')} onClick={openAccount}>
        <span className="kh-avatar" style={{ width: 42, height: 42 }}>
          <span
            className="kh-avatar__face"
            style={{ fontSize: 14.5, boxShadow: '0 0 0 2px rgba(255,255,255,.14)' }}
          >
            {initials(me.user.name)}
          </span>
          <span className="kh-avatar__dot" />
        </span>
        <span className="kh-acct__meta">
          <span className="kh-acct__name">{me.user.name}</span>
          <span className="kh-tier" style={{ background: tierGradient(tier) }}>
            {tier}
          </span>
        </span>
        <span className="kh-acct__chev">
          <Icon name="chevRight" size={14} sw={2} />
        </span>
      </button>
    </aside>
  );
}
