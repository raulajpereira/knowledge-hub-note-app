'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { refreshCounts } from '@/components/shell/counts';
import { useWhen } from '@/components/content/useWhen';
import { envColor, modColor, sapShortcut } from '@/lib/sap';
import { downloadShortcut } from '@/components/sap/SidePanel';
import { copyTcode } from '@/components/sap/TcodesView';
import { usePersistentState, useToast } from '@/components/ui';
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

type HomeTask = {
  id: string;
  title: string;
  type: 'tech' | 'mgmt';
  priority: 'low' | 'medium' | 'high';
  dueOn: string | null;
  pinned: boolean;
};
type HomeData = {
  tasks?: HomeTask[];
  recentNotes?: Array<{
    id: string;
    title: string;
    folder: string | null;
    color: string | null;
    updatedAt: string;
  }>;
  favNotes?: Array<{ id: string; title: string }>;
  issues?: Array<{
    id: string;
    title: string;
    status: 'open' | 'progress' | 'waiting';
    priority: 'low' | 'medium' | 'high' | 'critical';
    dueOn: string | null;
  }>;
  emails?: {
    total: number;
    starred: Array<{ id: string; subject: string; from: string; sentAt: string | null }>;
    pinned: Array<{ id: string; subject: string }>;
  };
  tcodes?: Array<{ id: string; code: string; module: string; description: string }>;
  transports?: Array<{
    id: string;
    trkorr: string;
    description: string;
    released: boolean;
    qas: boolean;
    createdAt: string;
  }>;
  systems?: Array<{
    id: string;
    name: string;
    sid: string;
    env: string;
    client: string;
    host: string;
    inst: string;
    mandt: string;
    router: string;
    lang: string;
    sapUser: string;
  }>;
};
// Prototype home: priority dots and the two task groups.
const H_PRI = {
  high: 'oklch(0.82 0.1 35)',
  medium: 'oklch(0.88 0.09 85)',
  low: 'rgba(255,255,255,.35)',
} as const;
const H_GROUPS = [
  ['tech', 'tk_tech', 'oklch(0.8 0.13 245)'],
  ['mgmt', 'tk_mgmt', 'oklch(0.8 0.13 305)'],
] as const;
const MON_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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
const GRIP =
  '<circle cx="9" cy="6" r="1"></circle><circle cx="15" cy="6" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="9" cy="18" r="1"></circle><circle cx="15" cy="18" r="1"></circle>';
const PENCIL = '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>';
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function Favicon({ domain }: { domain: string }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // An error before hydration never reaches onError: check the image once mounted.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  if (failed || !domain) return <>{(domain[0] ?? '?').toUpperCase()}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- icon streamed by our own API
    <img
      ref={ref}
      src={`${BASE}/api/v1/favicon?domain=${encodeURIComponent(domain)}`}
      alt=""
      width={26}
      height={26}
      style={{ display: 'block' }}
      onError={() => setFailed(true)}
    />
  );
}

export function HomeView({ initialHour }: { initialHour?: number | null } = {}) {
  const { t, lang } = useI18n();
  const toast = useToast();
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
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  const [quickEdit, setQuickEdit] = useState(false);
  const [scForm, setScForm] = useState<{ id: string | null; title: string; url: string } | null>(null);
  const [live, setLive] = useState<Record<string, number> | null>(null); // fractions while resizing
  const [hour, setHour] = useState<number | null>(initialHour ?? null);
  useEffect(() => setHour(new Date().getHours()), []);
  const router = useRouter();

  // Real data for the cards (tasks, recent/favourite notes) — Phase 4.
  const [data, setData] = useState<HomeData>({});
  const loadData = useCallback(() => {
    api<HomeData>('/home')
      .then(setData)
      .catch(() => {});
  }, []);
  useEffect(loadData, [loadData]);

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

  /** Moves card `from` right before (or after) card `to`. */
  const moveW = (from: string, to: string, after: boolean) => {
    if (from === to) return;
    const L = home.widgets.slice();
    const i = L.findIndex((w) => w.id === from);
    if (i < 0) return;
    const [x] = L.splice(i, 1);
    const j = L.findIndex((w) => w.id === to);
    if (j < 0) return;
    L.splice(after ? j + 1 : j, 0, x!);
    save({ widgets: L });
  };
  const moveBy = (id: string, delta: -1 | 1) => {
    const vis = widgets.map((w) => w.id);
    const k = vis.indexOf(id);
    const other = vis[k + delta];
    if (other) moveW(id, other, delta === 1);
  };
  // Pointer-based drag from the ⠿ handle: a bar shows where the card will land.
  const startDrag = (id: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    setDrag(id);
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    let target: { id: string; after: boolean } | null = null;
    const mv = (ev: PointerEvent) => {
      const card = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-hw]');
      const tid = card?.dataset.id;
      if (!card || !tid || tid === id) {
        target = null;
      } else {
        const r = card.getBoundingClientRect();
        target = { id: tid, after: ev.clientX > r.left + r.width / 2 };
      }
      setDrop(target);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (target) moveW(id, target.id, target.after);
      setDrag(null);
      setDrop(null);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
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

  // Prototype hTasks / dueItems / favItems, from the server's data.
  const today = todayIso();
  const dayDiff = (iso: string) =>
    Math.round((+new Date(`${iso}T00:00:00`) - +new Date(`${today}T00:00:00`)) / 86_400_000);
  const relOf = (d: number) =>
    d < 0
      ? `${t('h_late')}${-d}d`
      : d === 0
        ? t('t_today')
        : d === 1
          ? t('h_tomorrow')
          : `${t('h_inDays')}${d}${t('h_days')}`;
  const relColor = (d: number) =>
    d < 0 ? 'oklch(0.8 0.13 30)' : d <= 1 ? '#fbf8f5' : 'rgba(255,248,240,.62)';
  const active = data.tasks ?? [];
  const dueToday = active.filter((x) => x.dueOn === today);
  const overdue = active.filter((x) => x.dueOn && dayDiff(x.dueOn) < 0);
  const po = { high: 0, medium: 1, low: 2 } as const;
  const hTasks = active
    .slice()
    .sort((a, b) => {
      const da = a.dueOn ? dayDiff(a.dueOn) : 999;
      const db = b.dueOn ? dayDiff(b.dueOn) : 999;
      return Math.min(da, 1) - Math.min(db, 1) || po[a.priority] - po[b.priority] || da - db;
    })
    .slice(0, 6);
  const openIssues = data.issues ?? [];
  const dueItems = [
    ...active
      .filter((x) => x.dueOn)
      .map((x) => ({
        id: x.id,
        title: x.title,
        dueOn: x.dueOn!,
        kind: 'h_k_task',
        href: `/app/tasks?t=${x.id}`,
      })),
    ...openIssues
      .filter((x) => x.dueOn)
      .map((x) => ({
        id: x.id,
        title: x.title,
        dueOn: x.dueOn!,
        kind: 'h_k_issue',
        href: `/app/issues?i=${x.id}`,
      })),
  ]
    .filter((x) => dayDiff(x.dueOn) <= 14)
    .sort((a, b) => (a.dueOn < b.dueOn ? -1 : 1))
    .slice(0, 6);
  const favItems = [
    ...(data.favNotes ?? []).map((n) => ({
      kind: t('h_k_note'),
      title: n.title,
      href: `/app/notes?n=${n.id}`,
    })),
    ...active
      .filter((x) => x.pinned)
      .map((x) => ({ kind: t('h_k_task'), title: x.title, href: `/app/tasks?t=${x.id}` })),
    ...(data.emails?.pinned ?? []).map((m) => ({
      kind: t('h_k_mail'),
      title: m.subject || t('m_noSubject'),
      href: `/app/emails?m=${m.id}`,
    })),
  ];
  const MON = lang === 'en' ? MON_EN : MON_PT;
  const completeTask = async (id: string) => {
    setData((d) => ({ ...d, tasks: d.tasks?.filter((x) => x.id !== id) }));
    // on failure the reload below brings the task back
    await api(`/tasks/${id}`, { done: true }, 'PATCH').catch(() =>
      toast({ message: t('ne_saveFail'), tone: 'error' }),
    );
    loadData();
    refreshCounts();
  };
  const rowCls = 'kh-hrow';
  const fmtWhen = useWhen();
  const [txCopied, setTxCopied] = useState<string | null>(null);
  const [sapLang] = usePersistentState<string>('sap.lang', '');
  const [sapTx] = usePersistentState<string>('sap.tx', '');

  const todayStats = [
    {
      m: 'tasks',
      label: t('h_st_tasks'),
      count: dueToday.length,
      sub: `${overdue.length} ${t('h_st_overdue')}`,
      dot: 'oklch(0.8 0.13 30)',
      page: 'tasks',
    },
    {
      m: 'issues',
      label: t('h_st_issues'),
      count: openIssues.length,
      sub: `${openIssues.filter((x) => x.priority === 'critical' || x.priority === 'high').length} ${t('h_st_critical')}`,
      dot: 'oklch(0.78 0.11 240)',
      page: 'issues',
    },
    {
      m: 'transports',
      label: t('h_st_trs'),
      count: data.transports?.length ?? 0,
      sub: `${data.transports?.filter((x) => !x.released).length ?? 0} ${t('h_st_modif')}`,
      dot: 'oklch(0.85 0.12 75)',
      page: 'transports',
    },
    {
      m: 'emails',
      label: t('h_st_mail'),
      count: data.emails?.starred.length ?? 0,
      sub: `${data.emails?.total ?? 0} ${t('h_st_mailSub')}`,
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
                  {'count' in s ? s.count : 0}
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
      case 'issues': {
        if (!openIssues.length) return <div className="kh-card__empty">{t('home_noItems')}</div>;
        const ST = [
          ['open', 's_open', 'oklch(0.78 0.11 240)'],
          ['progress', 's_progress', 'oklch(0.76 0.12 300)'],
          ['waiting', 's_waiting', 'oklch(0.85 0.12 75)'],
        ] as const;
        const IPRI = { critical: 'oklch(0.7 0.19 25)', ...H_PRI };
        const ipo = { critical: 0, high: 1, medium: 2, low: 3 };
        return (
          <>
            <div className="kh-hbar">
              {ST.map(([k, l, c]) => {
                const n = openIssues.filter((x) => x.status === k).length;
                return (
                  <div
                    key={k}
                    title={t(l)}
                    style={{ width: `${(n / openIssues.length) * 100}%`, background: c }}
                  />
                );
              })}
            </div>
            <div className="kh-hbar__legend">
              {ST.map(([k, l, c]) => (
                <span key={k}>
                  <span style={{ background: c }} />
                  {t(l)} {openIssues.filter((x) => x.status === k).length}
                </span>
              ))}
            </div>
            <div className="kh-hlist">
              {openIssues
                .slice()
                .sort((a, b) => ipo[a.priority] - ipo[b.priority])
                .slice(0, 4)
                .map((x) => (
                  <Link key={x.id} href={`/app/issues?i=${x.id}`} className={rowCls} scroll={false}>
                    <span
                      className="kh-hdot"
                      style={{ background: IPRI[x.priority], boxShadow: `0 0 8px ${IPRI[x.priority]}` }}
                    />
                    <span className="kh-hrow__t" style={{ flex: 1 }}>
                      {x.title}
                    </span>
                    <span className="kh-hrow__s">{t(`s_${x.status}`)}</span>
                  </Link>
                ))}
            </div>
          </>
        );
      }
      case 'transports': {
        const trs = data.transports ?? [];
        const stOf = (x: (typeof trs)[number]) => (!x.released ? 'mod' : x.qas ? 'qas' : 'rel');
        const TRS = {
          mod: [t('o_mod'), 'oklch(0.82 0.11 210)'],
          rel: [t('o_st_rel'), 'oklch(0.78 0.12 300)'],
          qas: [t('o_st_qas'), 'oklch(0.85 0.12 75)'],
        } as const;
        return (
          <>
            <div className="kh-htr">
              {(['mod', 'rel', 'qas'] as const).map((k) => (
                <div key={k}>
                  <span title={TRS[k][0]}>
                    <span style={{ background: TRS[k][1] }} />
                    <span>{TRS[k][0]}</span>
                  </span>
                  <span>{trs.filter((x) => stOf(x) === k).length}</span>
                </div>
              ))}
            </div>
            {trs.length ? (
              <div className="kh-hlist">
                {trs.slice(0, 4).map((x) => (
                  <Link key={x.id} href={`/app/transports?o=${x.id}`} className={rowCls} scroll={false}>
                    <span className="kh-htr__code">{x.trkorr || '—'}</span>
                    <span className="kh-hrow__t" style={{ flex: 1 }}>
                      {x.description}
                    </span>
                    <span
                      className="kh-htr__st"
                      style={{ background: TRS[stOf(x)][1].replace(')', ' / .28)') }}
                    >
                      {TRS[stOf(x)][0]}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="kh-card__empty">{t('home_noItems')}</div>
            )}
          </>
        );
      }
      case 'tasks': {
        const groups = H_GROUPS.map(([k, label, color]) => ({
          k,
          label: t(label),
          color,
          items: hTasks.filter((x) => x.type === k),
        })).filter((g) => g.items.length);
        if (!groups.length) return <div className="kh-card__empty">{t('h_noTasks')}</div>;
        return (
          <div className="kh-hlist">
            {groups.map((g) => (
              <div key={g.k} style={{ display: 'contents' }}>
                <div className="kh-hgroup">
                  <span
                    style={{ background: g.color, boxShadow: `0 0 0 3px ${g.color.replace(')', ' / .22)')}` }}
                  />
                  <span style={{ color: g.color }}>{g.label}</span>
                  <span className="kh-hgroup__n">{g.items.length}</span>
                  <span
                    className="kh-hgroup__line"
                    style={{
                      background: `linear-gradient(90deg,${g.color.replace(')', ' / .22)')},transparent)`,
                    }}
                  />
                </div>
                {g.items.map((x) => {
                  const d = x.dueOn ? dayDiff(x.dueOn) : null;
                  return (
                    <div
                      key={x.id}
                      className={rowCls}
                      role="link"
                      tabIndex={0}
                      onClick={() => router.push(`/app/tasks?t=${x.id}`)}
                      onKeyDown={(e) =>
                        e.key === 'Enter' &&
                        e.target === e.currentTarget &&
                        router.push(`/app/tasks?t=${x.id}`)
                      }
                    >
                      <button
                        type="button"
                        className="kh-hck"
                        style={{ borderColor: g.color }}
                        aria-label={x.title}
                        onClick={(e) => {
                          e.stopPropagation();
                          void completeTask(x.id);
                        }}
                      />
                      <span className="kh-hrow__t">{x.title}</span>
                      {d !== null && (
                        <span
                          style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', color: relColor(d) }}
                        >
                          {relOf(d)}
                        </span>
                      )}
                      <span className="kh-hdot" style={{ background: H_PRI[x.priority] }} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      }
      case 'deadlines':
        if (!dueItems.length) return <div className="kh-card__empty">{t('h_noDeadlines')}</div>;
        return (
          <div className="kh-hlist">
            {dueItems.map((x) => {
              const d = dayDiff(x.dueOn!);
              const dt = new Date(`${x.dueOn}T00:00:00`);
              return (
                <Link key={x.id} href={x.href} className={rowCls} scroll={false}>
                  <span
                    className="kh-hdate"
                    style={{
                      background:
                        d < 0
                          ? 'oklch(0.65 0.17 30 / .3)'
                          : d <= 1
                            ? 'rgba(255,255,255,.22)'
                            : 'rgba(255,255,255,.1)',
                    }}
                  >
                    <span>{MON[dt.getMonth()]}</span>
                    <span className="kh-mono">{dt.getDate()}</span>
                  </span>
                  <span className="kh-hrow__col">
                    <span className="kh-hrow__t">{x.title}</span>
                    <span className="kh-hrow__s">
                      {t(x.kind)} · <span style={{ color: relColor(d), fontWeight: 600 }}>{relOf(d)}</span>
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        );
      case 'notes':
        if (!data.recentNotes?.length) return <div className="kh-card__empty">{t('home_noNotes')}</div>;
        return (
          <div className="kh-hlist">
            {data.recentNotes.map((n) => (
              <Link key={n.id} href={`/app/notes?n=${n.id}`} className={rowCls} scroll={false}>
                <span className="kh-hdot" style={{ background: n.color ?? 'rgba(255,248,240,.35)' }} />
                <span className="kh-hrow__col">
                  <span className="kh-hrow__t">{n.title || t('ne_untitled')}</span>
                  <span className="kh-hrow__s">
                    {n.folder ?? t('ne_noFolder')} · {fmtWhen(n.updatedAt)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        );
      case 'favs':
        if (!favItems.length) return <div className="kh-card__empty">{t('h_noFavs')}</div>;
        return (
          <div className="kh-hlist">
            {favItems.map((x) => (
              <Link key={x.href} href={x.href} className={rowCls} scroll={false}>
                <span className="kh-hkind">{x.kind}</span>
                <span className="kh-hrow__t">{x.title || t('ne_untitled')}</span>
              </Link>
            ))}
          </div>
        );
      case 'tcodes':
        if (!data.tcodes?.length) return <div className="kh-card__empty">{t('x_noFav')}</div>;
        return (
          <div className="kh-htx">
            {data.tcodes.map((x) => (
              <div
                key={x.id}
                className="kh-htx__it"
                role="link"
                tabIndex={0}
                style={{
                  background: `linear-gradient(160deg,${modColor(x.module).replace(')', ' / .22)')},rgba(255,255,255,.04))`,
                }}
                onClick={() => router.push(`/app/tcodes?x=${x.id}`)}
                onKeyDown={(e) => e.key === 'Enter' && router.push(`/app/tcodes?x=${x.id}`)}
              >
                <div>
                  <span>
                    <span className="kh-htx__code">{x.code}</span>
                    <span className="kh-htx__mod">{x.module}</span>
                  </span>
                  <span className="kh-htx__desc">{x.description}</span>
                </div>
                <button
                  type="button"
                  title={t('x_copy')}
                  aria-label={`${t('x_copy')} ${x.code}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    copyTcode(x.code);
                    setTxCopied(x.id);
                    setTimeout(() => setTxCopied(null), 1400);
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {txCopied === x.id ? (
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    ) : (
                      <>
                        <rect x="9" y="9" width="11" height="11" rx="2.5" />
                        <path d="M5 15V6a2 2 0 0 1 2-2h9" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
            ))}
          </div>
        );
      case 'systems':
        if (!data.systems?.length) return <div className="kh-card__empty">{t('h_noSystems')}</div>;
        return (
          <div className="kh-hsys">
            {data.systems.map((x) => (
              <button
                key={x.id}
                type="button"
                title={t('s_gui')}
                style={{
                  background: envColor(x.env).replace(')', ' / .16)'),
                  borderColor: envColor(x.env).replace(')', ' / .5)'),
                }}
                onClick={() => {
                  const f = sapShortcut(x, { lang: sapLang, tx: sapTx });
                  downloadShortcut(f.file, f.body);
                }}
              >
                <span>
                  <span className="kh-hsys__sid">{x.sid || '—'}</span>
                  <span className="kh-hsys__env">{x.env}</span>
                </span>
                <span className="kh-hsys__cl">{x.client || '—'}</span>
              </button>
            ))}
          </div>
        );
      case 'qnotes':
        return <div className="kh-card__empty">{t('h_noQnotes')}</div>;
      case 'emails':
        if (!data.emails?.starred.length) return <div className="kh-card__empty">{t('h_noEmails')}</div>;
        return (
          <div className="kh-hlist">
            {data.emails.starred.map((m) => (
              <Link key={m.id} href={`/app/emails?m=${m.id}`} className={rowCls} scroll={false}>
                <span style={{ color: 'oklch(0.86 0.13 85)', display: 'flex' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />
                  </svg>
                </span>
                <span className="kh-hrow__col">
                  <span className="kh-hrow__t">{m.subject || t('m_noSubject')}</span>
                  <span className="kh-hrow__s">
                    {m.from || '—'}
                    {m.sentAt ? ` · ${fmtWhen(m.sentAt)}` : ''}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        );
    }
  };
  const counts: Partial<Record<HomeType, number>> = {
    shortcuts: shortcuts.length,
    tcodes: data.tcodes?.length ?? 0,
    tasks: hTasks.length,
    deadlines: dueItems.length,
    notes: data.recentNotes?.length ?? 0,
    favs: favItems.length,
    transports: data.transports?.length ?? 0,
    issues: openIssues.length,
    systems: data.systems?.length ?? 0,
    qnotes: 0,
    emails: data.emails?.starred.length ?? 0,
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
                  data-id={w.id}
                  // While editing, card contents don't navigate (links, tiles).
                  onClickCapture={(e) => {
                    if (editing && (e.target as HTMLElement).closest('a')) e.preventDefault();
                  }}
                  style={{ flex: `${(f * 100).toFixed(3)} 1 0`, opacity: drag === w.id ? 0.45 : 1 }}
                >
                  {drop?.id === w.id && (
                    <span className="kh-card__drop" style={drop.after ? { right: -10 } : { left: -10 }} />
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {editing && (
                      <button
                        type="button"
                        className="kh-card__handle"
                        title={t('dragT')}
                        aria-label={`${t('dragT')} ${t(`w_${w.type}`)}`}
                        onPointerDown={startDrag(w.id)}
                      >
                        {svg(GRIP, 16, 2.4)}
                      </button>
                    )}
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
                          className="kh-card__x"
                          style={{ color: 'var(--text)' }}
                          title={t('upT')}
                          aria-label={`${t('upT')} ${t(`w_${w.type}`)}`}
                          disabled={widgets[0]?.id === w.id}
                          onClick={() => moveBy(w.id, -1)}
                        >
                          {svg('<path d="M15 6l-6 6 6 6"></path>', 13, 2.4)}
                        </button>
                        <button
                          type="button"
                          className="kh-card__x"
                          style={{ color: 'var(--text)' }}
                          title={t('downT')}
                          aria-label={`${t('downT')} ${t(`w_${w.type}`)}`}
                          disabled={widgets[widgets.length - 1]?.id === w.id}
                          onClick={() => moveBy(w.id, 1)}
                        >
                          {svg('<path d="M9 6l6 6-6 6"></path>', 13, 2.4)}
                        </button>
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
                  {editing && j < n - 1 && (
                    <div
                      className="kh-card__grip"
                      style={{ right: -12 }}
                      title={t('h_resize')}
                      onPointerDown={startResize(row, j, 'r')}
                    >
                      <span />
                    </div>
                  )}
                  {editing && n > 1 && j === n - 1 && (
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
