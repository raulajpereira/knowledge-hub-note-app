'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AmbientBackground } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { COL_DEFAULTS, COL_LIMITS, effectivePrefs, type Prefs } from '@/lib/prefs';
import { appearanceCss, appearanceOf } from './appearance';
import { assetUrl } from './assetUrl';
import './fonts';
import { AboutModal } from './AboutModal';
import { AccountModal } from './AccountModal';
import { ActivityModal } from './ActivityModal';
import { AiPanel } from '@/components/ai/AiPanel';
import { Header } from './Header';
import { LockScreen } from './LockScreen';
import { PrefsProvider, usePref, usePrefsContext } from './PrefsProvider';
import { ShellContext, type ShellApi } from './ShellContext';
import { Sidebar } from './Sidebar';
import { Ticker } from './Ticker';
import type { ShellMe } from './types';
import './shell.css';

// ZNotes root: 64px header · content · 36px ticker; sidebar + content
// columns with a drag handle (double-click resets). Pages that need the
// list/inspector columns (Notes, Tasks… — Phase 4) render them inside the
// content area with the same widths from prefs.cols.

const LOCK_KEY = 'kh.locked';

type Cols = { side?: number; list?: number; insp?: number };

function Shell({ me, children }: { me: ShellMe; children: React.ReactNode }) {
  const { t } = useI18n();
  const raw = usePrefsContext()!.prefs;
  const modules = useMemo(() => new Set(me.modules), [me.modules]);
  const look = useMemo(() => appearanceOf(effectivePrefs(raw, modules)), [raw, modules]);
  const photo =
    look.bg.mode === 'photo' && me.assets.background ? assetUrl('background', me.assets.background) : null;
  const [cols, setCols] = usePref<Cols>('cols', {});
  const side = cols.side ?? COL_DEFAULTS.side;
  const [dragW, setDragW] = useState<number | null>(null);
  const drag = useRef<{ x: number; w: number } | null>(null);

  const [focus, setFocus] = useState(false);
  const [locked, setLocked] = useState(false);
  const [accOpen, setAccOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [actOpen, setActOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Locked state survives a reload in this tab (prototype kv.locked in sessionStorage).
  useEffect(() => {
    try {
      if (sessionStorage.getItem(LOCK_KEY) === '1') setLocked(true);
    } catch {
      // ignore
    }
  }, []);

  const lock = useCallback(() => {
    setAccOpen(false);
    setAboutOpen(false);
    setActOpen(false);
    setLocked(true);
    try {
      sessionStorage.setItem(LOCK_KEY, '1');
    } catch {
      // ignore
    }
  }, []);
  const unlock = useCallback(() => {
    setLocked(false);
    try {
      sessionStorage.removeItem(LOCK_KEY);
    } catch {
      // ignore
    }
  }, []);

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    drag.current = { x: e.clientX, w: side };
    setDragW(side);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const [min, max] = COL_LIMITS.side;
    const move = (ev: PointerEvent) => {
      if (!drag.current) return;
      setDragW(Math.round(Math.max(min, Math.min(max, drag.current.w + ev.clientX - drag.current.x))));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const d = drag.current;
      drag.current = null;
      setDragW(null);
      if (d) {
        const w = Math.round(Math.max(min, Math.min(max, d.w + ev.clientX - d.x)));
        if (w !== side) setCols({ ...cols, side: w });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const onReset = () => setCols({ ...cols, side: COL_DEFAULTS.side });

  const width = dragW ?? side;
  const api = useMemo<ShellApi>(
    () => ({
      me,
      modules,
      focus,
      toggleFocus: () => {
        setFocus((f) => !f);
        setActOpen(false);
      },
      lock,
      openAccount: () => setAccOpen(true),
      openAbout: () => setAboutOpen(true),
      query,
      setQuery,
    }),
    [me, modules, focus, lock, query],
  );

  return (
    <ShellContext.Provider value={api}>
      <style>{appearanceCss(look)}</style>
      <AmbientBackground
        ambient={look.bg.mode === 'photo' ? 'Areia' : look.bg.mode}
        photoUrl={photo}
        blur={look.bg.blur}
        dim={look.bg.dim}
      />
      <div className="kh-shell kh-above" aria-hidden={locked || undefined} inert={locked || undefined}>
        <div className="kh-shell__grid">
          <Header
            onActivity={() => setActOpen((o) => !o)}
            activityOpen={actOpen}
            onAi={() => setAiOpen((o) => !o)}
            aiOpen={aiOpen}
          />
          <div
            className="kh-main"
            style={{ gridTemplateColumns: focus ? 'minmax(0,1fr)' : `${width}px minmax(0,1fr)` }}
          >
            {!focus && (
              <div
                className="kh-handle"
                style={{ left: width }}
                title={t('resize')}
                data-drag={dragW !== null}
                onPointerDown={onDown}
                onDoubleClick={onReset}
                role="separator"
                aria-orientation="vertical"
                aria-valuenow={width}
                aria-valuemin={COL_LIMITS.side[0]}
                aria-valuemax={COL_LIMITS.side[1]}
              >
                <div className="kh-handle__bar" />
              </div>
            )}
            {!focus && <Sidebar />}
            <main className="kh-content">{children}</main>
          </div>
          <Ticker />
        </div>
      </div>
      {me.tenant.status === 'suspended' && (
        <div className="kh-suspended" role="status">
          {t('shell_suspended')}
        </div>
      )}
      <AccountModal open={accOpen} onClose={() => setAccOpen(false)} />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <ActivityModal open={actOpen} onClose={() => setActOpen(false)} />
      <AiPanel open={aiOpen} onClose={() => setAiOpen(false)} />
      {locked && (
        <LockScreen name={me.user.name} email={me.user.email} photoV={me.assets.avatar} onUnlock={unlock} />
      )}
    </ShellContext.Provider>
  );
}

export function AppShell({ me, prefs, children }: { me: ShellMe; prefs: Prefs; children: React.ReactNode }) {
  return (
    <PrefsProvider initial={prefs}>
      <Shell me={me}>{children}</Shell>
    </PrefsProvider>
  );
}
