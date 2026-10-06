'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePref, usePrefsContext } from '@/components/shell/PrefsProvider';
import { useShell } from '@/components/shell/ShellContext';
import { NavIcon } from '@/components/shell/icons';
import { hrefOf, moduleOf, normalizeNav } from '@/components/shell/nav';
import { HOME_SIZES, HOME_TYPES, type HomePrefs, type HomeType, type NavEntry } from '@/lib/prefs';
import { useI18n } from '@/i18n/client';
import {
  HOME_ICONS,
  QUICK_DEF,
  QUICK_TINT,
  SC_DEF,
  WIDGET_PAGE,
  defaultWidgets,
  pack,
  resizeRow,
  widgetAllowed,
  type Widget,
} from './homeModel';
import { fmtT, pomo, usePomodoro } from './pomodoro';
import { WeatherCard } from './WeatherCard';
import './home.css';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const svg = (d: string, size = 15, sw = 1.9) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flex: 'none' }}
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: d }}
  />
);
const X = '<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>';
const PENCIL = '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>';
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function Favicon({ domain }: { domain: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !domain) return <>{(domain[0] ?? '?').toUpperCase()}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- icon streamed by our own API
    <img
      src={`${BASE}/api/v1/favicon?domain=${encodeURIComponent(domain)}`}
      alt=""
      width={26}
      height={26}
      style={{ display: 'block' }}
      onError={() => setFailed(true)}
    />
  );
}

export function HomeView() {
  const { t } = useI18n();
  const { me, modules } = useShell();
  const prefsCtx = usePrefsContext()!;
  const [saved, setHome] = usePref<HomePrefs | undefined>('home', undefined);
  const [navSaved] = usePref<NavEntry[] | undefined>('nav', undefined);
  const home: HomePrefs = useMemo(() => saved ?? { widgets: defaultWidgets(modules) }, [saved, modules]);
  const widgets = home.widgets.filter((w) => widgetAllowed(w.type, modules));
  const save = useCallback((patch: Partial<HomePrefs>) => setHome({ ...home, ...patch }), [home, setHome]);
  const latest = useRef(home);
  latest.current = home;

  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [quickEdit, setQuickEdit] = useState(false);
  const [scForm, setScForm] = useState<{ id: string | null; title: string; url: string } | null>(null);
  const [live, setLive] = useState<Record<string, number> | null>(null); // fractions while resizing
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => setHour(new Date().getHours()), []);

  // Focus sessions count, saved per day (prototype pomoDone / pomoDay).
  const onFocusDone = useCallback(() => {
    const h = latest.current;
    const today = todayIso();
    prefsCtx.setPref('home', {
      ...h,
      pomoDone: (h.pomoDay === today ? (h.pomoDone ?? 0) : 0) + 1,
      pomoDay: today,
    });
  }, [prefsCtx]);
  const p = usePomodoro(onFocusDone);
  const pomoDone = home.pomoDay === todayIso() ? (home.pomoDone ?? 0) : 0;

  const navLabel = (id: string) => {
    const e = normalizeNav(modules.has('sidebar') ? navSaved : undefined).find(
      (x) => x.type === 'item' && x.id === id,
    ) as Extract<NavEntry, { type: 'item' }> | undefined;
    return e?.label || t(`nav_${id}`);
  };
  const navAllowed = (id: string) => {
    const m = moduleOf(id);
    return m === null || modules.has(m);
  };

  const first = me.user.name.split(/\s+/)[0] ?? '';
  const greeting =
    hour === null ? '' : `${t(hour < 12 ? 'h_morning' : hour < 20 ? 'h_afternoon' : 'h_evening')}, ${first}`;

  const moveW = (from: string, to: string) => {
    const L = home.widgets.slice();
    const i = L.findIndex((w) => w.id === from);
    const j = L.findIndex((w) => w.id === to);
    if (i < 0 || j < 0 || i === j) return;
    const [x] = L.splice(i, 1);
    L.splice(j, 0, x!);
    save({ widgets: L });
  };
  const addW = (type: HomeType) =>
    save({
      widgets: [
        ...home.widgets,
        {
          id: `w${Date.now()}`,
          type,
          size:
            type === 'today'
              ? 'L'
              : ['tasks', 'deadlines', 'transports', 'issues'].includes(type)
                ? 'M'
                : 'S',
        },
      ],
    });

  const rows = pack(widgets);
  const startResize =
    (row: ReturnType<typeof pack>[number], j: number, side: 'r' | 'l') => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const card = (e.currentTarget as HTMLElement).closest('[data-hw]') as HTMLElement;
      const rowEl = card.parentElement!;
      const gap = parseFloat(getComputedStyle(rowEl).columnGap) || 16;
      const n = row.items.length;
      const avail = rowEl.clientWidth - gap * (n - 1);
      const w0 = card.getBoundingClientRect().width;
      const x0 = e.clientX;
      const minF = Math.min(260 / avail, 1 / n);
      const f = row.items.map((it) => it.f);
      const ids = row.items.map((it) => it.w.id);
      let nf = f;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      const mv = (ev: PointerEvent) => {
        const dx = ev.clientX - x0;
        nf = resizeRow(f, j, (w0 + (side === 'r' ? dx : -dx)) / avail, minF);
        setLive(Object.fromEntries(ids.map((id, k) => [id, nf[k]!])));
      };
      const up = () => {
        window.removeEventListener('pointermove', mv);
        window.removeEventListener('pointerup', up);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setLive(null);
        if (nf !== f)
          save({
            widgets: home.widgets.map((x) => (ids.includes(x.id) ? { ...x, fr: nf[ids.indexOf(x.id)] } : x)),
          });
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
    };
  const cycleSize = (row: ReturnType<typeof pack>[number], w: Widget) => {
    const ids = row.items.map((it) => it.w.id);
    save({
      widgets: home.widgets.map((x) =>
        ids.includes(x.id)
          ? {
              ...x,
              fr: undefined,
              size:
                x.id === w.id ? HOME_SIZES[(HOME_SIZES.indexOf(x.size) + 1) % HOME_SIZES.length]! : x.size,
            }
          : x,
      ),
    });
  };

  // Content of later phases isn't there yet: counts are 0 and lists empty.
  const quick = (home.quick ?? QUICK_DEF).filter(navAllowed);
  const quickAvail = normalizeNav(undefined).flatMap((e) =>
    e.type === 'item' && e.id !== 'home' && navAllowed(e.id) && !quick.includes(e.id) ? [e.id] : [],
  );
  const shortcuts = home.shortcuts ?? SC_DEF;
  const domainOf = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch {
      return u;
    }
  };
  const saveShortcut = () => {
    if (!scForm) return;
    let u = scForm.url.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    const title = scForm.title.trim();
    save({
      shortcuts: scForm.id
        ? shortcuts.map((y) => (y.id === scForm.id ? { ...y, title, url: u } : y))
        : [...shortcuts, { id: `sc${Date.now()}`, title, url: u }],
    });
    setScForm(null);
  };

  const todayStats = [
    {
      m: 'tasks',
      label: t('h_st_tasks'),
      sub: `0 ${t('h_st_overdue')}`,
      dot: 'oklch(0.8 0.13 30)',
      page: 'tasks',
    },
    {
      m: 'issues',
      label: t('h_st_issues'),
      sub: `0 ${t('h_st_critical')}`,
      dot: 'oklch(0.78 0.11 240)',
      page: 'issues',
    },
    {
      m: 'transports',
      label: t('h_st_trs'),
      sub: `0 ${t('h_st_modif')}`,
      dot: 'oklch(0.85 0.12 75)',
      page: 'transports',
    },
    {
      m: 'emails',
      label: t('h_st_mail'),
      sub: `0 ${t('h_st_mailSub')}`,
      dot: 'oklch(0.86 0.13 85)',
      page: 'emails',
    },
  ].filter((s) => modules.has(s.m));

  const body = (type: HomeType) => {
    switch (type) {
      case 'today':
        return (
          <div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10 }}
          >
            {todayStats.map((s) => (
              <Link key={s.m} href={hrefOf(s.page)} className="kh-stat" scroll={false}>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    color: 'rgba(255,248,240,.75)',
                    maxWidth: '100%',
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      flex: 'none',
                      borderRadius: '50%',
                      background: s.dot,
                      boxShadow: `0 0 8px ${s.dot}`,
                    }}
                  />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.label}
                  </span>
                </span>
                <span className="kh-mono" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1 }}>
                  0
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: 'rgba(255,248,240,.6)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%',
                  }}
                >
                  {s.sub}
                </span>
              </Link>
            ))}
            {todayStats.length === 0 && <div className="kh-card__empty">{t('home_noItems')}</div>}
          </div>
        );
      case 'capture':
        return (
          <>
            <div
              style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))',
                gridAutoRows: 'minmax(84px,1fr)',
                gap: 10,
              }}
            >
              {quick.map((id) => (
                <div key={id} style={{ position: 'relative', display: 'flex', minWidth: 0 }}>
                  <Link
                    href={hrefOf(id)}
                    scroll={false}
                    className="kh-quick"
                    style={{
                      background: `linear-gradient(160deg,${QUICK_TINT[id] ?? 'rgba(255,255,255,.14)'},rgba(255,255,255,.04))`,
                    }}
                  >
                    <span className="kh-quick__ic">
                      <NavIcon id={id} />
                    </span>
                    <span
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        minWidth: 0,
                        maxWidth: '100%',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {navLabel(id)}
                      </span>
                      <span style={{ fontSize: 11, color: 'rgba(255,248,240,.65)', whiteSpace: 'nowrap' }}>
                        {t('qk_goTo').trim()}
                      </span>
                    </span>
                  </Link>
                  {editing && (
                    <button
                      type="button"
                      className="kh-mini-x"
                      title={t('del')}
                      aria-label={`${t('del')} ${navLabel(id)}`}
                      onClick={() => save({ quick: quick.filter((x) => x !== id) })}
                    >
                      {svg(X, 11, 2.6)}
                    </button>
                  )}
                </div>
              ))}
              {editing && (
                <button type="button" className="kh-dashed" onClick={() => setQuickEdit((v) => !v)}>
                  <span style={{ fontSize: 22, lineHeight: 1 }}>{quickEdit ? '✓' : '+'}</span>
                  {quickEdit ? t('qk_doneEdit') : t('qk_add')}
                </button>
              )}
            </div>
            {editing && quickEdit && (
              <div className="kh-form-row" style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 12, color: 'rgba(255,248,240,.7)' }}>{t('qk_pick')}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {quickAvail.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="kh-chip-add"
                      style={{ height: 32, fontSize: 12, padding: '0 12px' }}
                      onClick={() => save({ quick: [...quick, id] })}
                    >
                      <NavIcon id={id} size={15} />
                      {navLabel(id)}
                    </button>
                  ))}
                  {quickAvail.length === 0 && (
                    <span style={{ fontSize: 12, color: 'rgba(255,248,240,.6)' }}>{t('qk_all')}</span>
                  )}
                </div>
              </div>
            )}
          </>
        );
      case 'shortcuts':
        return (
          <>
            <div
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}
            >
              {shortcuts.map((x) => {
                const dom = domainOf(x.url);
                return (
                  <div key={x.id} style={{ position: 'relative', display: 'flex', minWidth: 0 }}>
                    <a href={x.url} target="_blank" rel="noopener noreferrer" className="kh-sc">
                      <span className="kh-sc__ic">
                        <Favicon domain={dom} />
                      </span>
                      <span
                        style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 3,
                          minWidth: 0,
                          paddingRight: editing ? 58 : 0,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 15,
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {x.title || dom}
                        </span>
                        <span
                          style={{
                            fontSize: 12.5,
                            color: 'rgba(255,248,240,.62)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {dom}
                        </span>
                      </span>
                    </a>
                    {editing && (
                      <>
                        <button
                          type="button"
                          className="kh-sc__btn"
                          style={{ right: 44 }}
                          title={t('home_edit')}
                          aria-label={`${t('home_edit')} ${x.title || dom}`}
                          onClick={() => setScForm({ id: x.id, title: x.title, url: x.url })}
                        >
                          {svg(PENCIL, 13, 2.2)}
                        </button>
                        <button
                          type="button"
                          className="kh-sc__btn"
                          style={{ right: 12, color: 'rgba(255,220,210,.85)' }}
                          title={t('del')}
                          aria-label={`${t('del')} ${x.title || dom}`}
                          onClick={() => save({ shortcuts: shortcuts.filter((y) => y.id !== x.id) })}
                        >
                          {svg(X, 12, 2.4)}
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
              {editing && (
                <button
                  type="button"
                  className="kh-dashed"
                  style={{
                    flexDirection: 'row',
                    minHeight: 78,
                    fontSize: 14,
                    color: 'rgba(255,248,240,.85)',
                  }}
                  onClick={() => setScForm(scForm ? null : { id: null, title: '', url: '' })}
                >
                  + {t('sc_add')}
                </button>
              )}
            </div>
            {editing && scForm && (
              <div
                className="kh-form-row"
                style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr) auto' }}
              >
                <input
                  value={scForm.title}
                  maxLength={80}
                  placeholder={t('sc_name')}
                  aria-label={t('sc_name')}
                  onChange={(e) => setScForm({ ...scForm, title: e.target.value })}
                />
                <input
                  value={scForm.url}
                  maxLength={500}
                  placeholder="https://…"
                  aria-label="URL"
                  onChange={(e) => setScForm({ ...scForm, url: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && saveShortcut()}
                />
                <button
                  type="button"
                  className="kh-btn-solid"
                  style={{ height: 38, borderRadius: 999, fontSize: 13 }}
                  onClick={saveShortcut}
                >
                  {t('h_save')}
                </button>
              </div>
            )}
          </>
        );
      case 'focus':
        return (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', gap: 6 }}>
              {(
                [
                  ['focus', t('h_focus')],
                  ['break', t('h_break')],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className="kh-pill-btn"
                  aria-pressed={p.mode === id}
                  onClick={() => pomo.mode(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              style={{
                position: 'relative',
                width: 140,
                height: 140,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `conic-gradient(#fbf8f5 ${Math.round((1 - p.left / pomo.total()) * 100)}%,rgba(255,255,255,.12) 0)`,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 8,
                  borderRadius: '50%',
                  background: 'rgba(40,30,24,.85)',
                }}
              />
              <span
                className="kh-mono"
                style={{ position: 'relative', fontSize: 34, fontWeight: 600, letterSpacing: '-.02em' }}
                role="timer"
              >
                {fmtT(p.left)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="kh-btn-solid"
                style={{ height: 38, borderRadius: 999, fontSize: 13, padding: '0 20px' }}
                onClick={pomo.toggle}
              >
                {p.running ? t('h_pause') : t('h_start')}
              </button>
              <button
                type="button"
                className="kh-chip-sm"
                style={{ height: 38, padding: '0 16px', fontSize: 13, fontWeight: 400 }}
                onClick={pomo.reset}
              >
                {t('h_reset2')}
              </button>
            </div>
            <span style={{ fontSize: 12, color: 'rgba(255,248,240,.62)' }}>
              {pomoDone}
              {pomoDone === 1 ? t('h_session1') : t('h_sessions')}
            </span>
          </div>
        );
      case 'transports':
      case 'issues':
        return <div className="kh-card__empty">{t('home_noItems')}</div>;
      case 'tasks':
        return <div className="kh-card__empty">{t('h_noTasks')}</div>;
      case 'deadlines':
        return <div className="kh-card__empty">{t('h_noDeadlines')}</div>;
      case 'notes':
        return <div className="kh-card__empty">{t('home_noNotes')}</div>;
      case 'favs':
        return <div className="kh-card__empty">{t('h_noFavs')}</div>;
      case 'tcodes':
        return <div className="kh-card__empty">{t('x_noFav')}</div>;
      case 'systems':
        return <div className="kh-card__empty">{t('h_noSystems')}</div>;
      case 'qnotes':
        return <div className="kh-card__empty">{t('h_noQnotes')}</div>;
      case 'emails':
        return <div className="kh-card__empty">{t('h_noEmails')}</div>;
    }
  };
  const counts: Partial<Record<HomeType, number>> = {
    shortcuts: shortcuts.length,
    tcodes: 0,
    tasks: 0,
    deadlines: 0,
    notes: 0,
    favs: 0,
    transports: 0,
    issues: 0,
    systems: 0,
    qnotes: 0,
    emails: 0,
  };
  const catalog = HOME_TYPES.filter(
    (k) => widgetAllowed(k, modules) && !home.widgets.some((w) => w.type === k),
  );

  return (
    <section className="kh-home" data-zs="">
      {home.showWx !== false && <WeatherCard />}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          gap: 12,
          padding: '24px 24px 16px',
        }}
      >
        <h1
          style={{
            margin: '0 auto 0 0',
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: '-.03em',
            minHeight: 36,
          }}
        >
          {greeting}
        </h1>
        <button
          type="button"
          onClick={() => {
            setEditing((v) => !v);
            setQuickEdit(false);
            setScForm(null);
          }}
          className="kh-pill-btn"
          aria-pressed={editing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 42,
            padding: '0 18px',
            fontSize: 14,
            borderColor: editing ? undefined : 'rgba(255,255,255,.2)',
            background: editing ? undefined : 'rgba(255,255,255,.1)',
          }}
        >
          {svg(
            '<rect x="3" y="3" width="8" height="8" rx="2"></rect><rect x="13" y="3" width="8" height="5" rx="2"></rect><rect x="13" y="10" width="8" height="11" rx="2"></rect><rect x="3" y="13" width="8" height="8" rx="2"></rect>',
          )}
          {editing ? t('h_done') : t('h_customize')}
        </button>
      </div>
      {editing && (
        <div className="kh-home__edit">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>{t('h_addCard')}</span>
            <span style={{ fontSize: 12, color: 'rgba(255,248,240,.65)' }}>{t('h_editHint')}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {catalog.map((k) => (
              <button key={k} type="button" className="kh-chip-add" onClick={() => addW(k)}>
                + {t(`w_${k}`)}
              </button>
            ))}
            {catalog.length === 0 && (
              <span style={{ fontSize: 13, color: 'rgba(255,248,240,.6)' }}>{t('h_allAdded')}</span>
            )}
            <button
              type="button"
              className="kh-chip-add"
              style={{ background: 'rgba(255,255,255,.06)' }}
              onClick={() => save({ showWx: home.showWx === false })}
            >
              {home.showWx === false ? t('wx_show') : t('wx_hide')}
            </button>
            <button
              type="button"
              onClick={() => setHome(null)}
              style={{
                height: 36,
                padding: '0 14px',
                borderRadius: 999,
                border: 0,
                background: 'transparent',
                color: 'rgba(255,248,240,.75)',
                font: 'inherit',
                fontSize: 13,
                cursor: 'pointer',
                textDecoration: 'underline',
                marginLeft: 'auto',
              }}
            >
              {t('h_reset')}
            </button>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 24px 28px' }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', flexWrap: 'wrap', gap: 16, minWidth: 0 }}>
            {row.items.map((it, j) => {
              const w = it.w;
              const f = live?.[w.id] ?? it.f;
              const n = row.items.length;
              const page = WIDGET_PAGE[w.type];
              return (
                <div
                  key={w.id}
                  data-hw=""
                  data-type={w.type}
                  className="kh-card"
                  data-editing={editing}
                  draggable={editing}
                  onDragStart={(e) => {
                    if (!editing) return;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', w.id);
                    setDrag(w.id);
                  }}
                  onDragOver={(e) => editing && drag && e.preventDefault()}
                  onDrop={(e) => {
                    if (!editing || !drag) return;
                    e.preventDefault();
                    moveW(drag, w.id);
                    setDrag(null);
                  }}
                  onDragEnd={() => setDrag(null)}
                  style={{ flex: `${(f * 100).toFixed(3)} 1 0`, opacity: drag === w.id ? 0.45 : 1 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span className="kh-card__icon">{svg(HOME_ICONS[w.type], 15, 1.8)}</span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 15,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {t(`w_${w.type}`)}
                    </span>
                    {counts[w.type] !== undefined && (
                      <span className="kh-mono" style={{ fontSize: 12, color: 'rgba(255,248,240,.62)' }}>
                        {counts[w.type]}
                      </span>
                    )}
                    {!editing && page && (
                      <Link href={hrefOf(page)} scroll={false} className="kh-card__more">
                        {t('h_seeAll')} →
                      </Link>
                    )}
                    {editing && (
                      <>
                        <button
                          type="button"
                          className="kh-card__size"
                          title={t('h_size')}
                          onClick={() => cycleSize(row, w)}
                        >
                          {w.fr !== undefined ? `${Math.round(f * 100)}%` : w.size}
                        </button>
                        <button
                          type="button"
                          className="kh-card__x"
                          title={t('del')}
                          aria-label={`${t('del')} ${t(`w_${w.type}`)}`}
                          onClick={() => save({ widgets: home.widgets.filter((x) => x.id !== w.id) })}
                        >
                          {svg(X, 12, 2.4)}
                        </button>
                      </>
                    )}
                  </div>
                  {j < n - 1 && (
                    <div
                      className="kh-card__grip"
                      style={{ right: -12 }}
                      title={t('h_resize')}
                      onPointerDown={startResize(row, j, 'r')}
                    >
                      <span />
                    </div>
                  )}
                  {n > 1 && j === n - 1 && (
                    <div
                      className="kh-card__grip"
                      style={{ left: -12 }}
                      title={t('h_resize')}
                      onPointerDown={startResize(row, j, 'l')}
                    >
                      <span />
                    </div>
                  )}
                  {body(w.type)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
