'use client';

import { useEffect, useRef, useState } from 'react';
import { usePersistentState } from '@/components/ui';
import { useShell } from '@/components/shell/ShellContext';
import { useI18n } from '@/i18n/client';
import { BrandTab } from './BrandTab';
import { LookTab } from './LookTab';
import { NavTab } from './NavTab';
import { NewsTab } from './NewsTab';
import { SapTab } from './SapTab';
import { AiTab } from './AiTab';
import { MgSettingsTab } from '@/components/mg/MgSettings';
import { SharingTab } from '@/components/share/SharingTab';
import './settings.css';

// Definições (ZNotes `isSettings`). Tabs whose module isn't in the plan are
// hidden, like the prototype's planFeat(); Partilhas needs the `share` module; Management shows with any mg_* module.
const TABS = [
  {
    id: 'look',
    label: 'set_tab_look',
    module: null,
    icon: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor"></path>',
  },
  { id: 'brand', label: 'set_tab_brand', module: 'brand', icon: '<path d="M4 20l4-12 4 7 3-4 5 9z"></path>' },
  {
    id: 'news',
    label: 'set_tab_news',
    module: null,
    icon: '<path d="M4 5h13v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z"></path><path d="M17 9h3v10a2 2 0 0 1-2 2"></path><path d="M7.5 9h6"></path><path d="M7.5 13h6"></path>',
  },
  {
    id: 'sap',
    label: 'set_tab_sap',
    module: 'systems',
    icon: '<rect x="3" y="4" width="18" height="16" rx="3"></rect><path d="M7 10l3 2.5L7 15"></path><line x1="12.5" y1="15" x2="17" y2="15"></line>',
  },
  {
    id: 'ai',
    label: 'set_tab_ai',
    module: 'ai',
    icon: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"></path><path d="M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"></path>',
  },
  {
    id: 'share',
    label: 'set_tab_share',
    module: 'share',
    icon: '<circle cx="18" cy="5" r="2.5"></circle><circle cx="6" cy="12" r="2.5"></circle><circle cx="18" cy="19" r="2.5"></circle><path d="M8.2 10.8l7.6-4.4"></path><path d="M8.2 13.2l7.6 4.4"></path>',
  },
  {
    id: 'nav',
    label: 'set_tab_nav',
    module: 'sidebar',
    icon: '<rect x="3" y="4" width="18" height="16" rx="3"></rect><line x1="9" y1="4" x2="9" y2="20"></line>',
  },
  {
    id: 'mgmt',
    label: 'set_tab_mgmt',
    module: 'mg_*',
    icon: '<circle cx="9" cy="8" r="3.5"></circle><path d="M3 20a6 6 0 0 1 12 0"></path><path d="M16 4.5a3.5 3.5 0 0 1 0 7"></path><path d="M18 14.5a6 6 0 0 1 3 5.5"></path>',
  },
] as const;

type TabId = (typeof TABS)[number]['id'];
const NAV_W = 230;

export function SettingsView() {
  const { t } = useI18n();
  const { modules } = useShell();
  const tabs = TABS.filter(
    (x) =>
      !x.module ||
      (x.module === 'mg_*' ? [...modules].some((m) => m.startsWith('mg_')) : modules.has(x.module)),
  );
  const [saved, setTab] = usePersistentState<TabId>('setTab', 'look');
  // a link may open a given tab (e.g. ?tab=ai from the assistant)
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get('tab');
    if (want && TABS.some((x) => x.id === want)) setTab(want as TabId);
  }, [setTab]);
  const tab = tabs.some((x) => x.id === saved) ? saved : 'look';
  const current = tabs.find((x) => x.id === tab)!;

  const [navW, setNavW, resetNavW] = usePersistentState('setNavW', NAV_W);
  const [dragW, setDragW] = useState<number | null>(null);
  const drag = useRef<{ x: number; w: number } | null>(null);
  const w = dragW ?? navW;
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    drag.current = { x: e.clientX, w: navW };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const clamp = (v: number) => Math.round(Math.max(180, Math.min(520, v)));
    const move = (ev: PointerEvent) =>
      drag.current && setDragW(clamp(drag.current.w + ev.clientX - drag.current.x));
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (drag.current) setNavW(clamp(drag.current.w + ev.clientX - drag.current.x));
      drag.current = null;
      setDragW(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <section className="kh-set">
      <div className="kh-set__grid" style={{ gridTemplateColumns: `min(${w}px, 45%) minmax(0,1fr)` }}>
        <div
          className="kh-set__handle"
          style={{ left: `calc(min(${w}px, 45%) - 7px)` }}
          title={t('resize')}
          onPointerDown={onDown}
          onDoubleClick={resetNavW}
          role="separator"
          aria-orientation="vertical"
        >
          <div
            className="kh-handle__bar"
            style={dragW !== null ? { background: 'rgba(255,255,255,.75)' } : undefined}
          />
        </div>
        <nav className="kh-set__nav" data-zs="">
          <div style={{ padding: '0 10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-.02em' }}>
              {t('settings')}
            </h1>
            <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'rgba(255,248,240,.65)' }}>
              {t('settingsSub')}
            </div>
          </div>
          <div
            role="tablist"
            aria-orientation="vertical"
            aria-label={t('settings')}
            style={{ display: 'contents' }}
          >
            {tabs.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                className="kh-set__tab"
                aria-selected={x.id === tab}
                onClick={() => setTab(x.id)}
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flex: 'none', opacity: 0.9 }}
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: x.icon }}
                />
                <span style={{ flex: 1 }}>{t(x.label)}</span>
              </button>
            ))}
          </div>
        </nav>
        <div className="kh-set__body" data-zs="">
          <div className="kh-set__inner" role="tabpanel">
            <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-.02em' }}>{t(current.label)}</div>
            {tab === 'look' && <LookTab />}
            {tab === 'brand' && <BrandTab />}
            {tab === 'news' && <NewsTab />}
            {tab === 'sap' && <SapTab />}
            {tab === 'ai' && <AiTab />}
            {tab === 'share' && <SharingTab />}
            {tab === 'nav' && <NavTab />}
            {tab === 'mgmt' && <MgSettingsTab />}
          </div>
        </div>
      </div>
    </section>
  );
}
