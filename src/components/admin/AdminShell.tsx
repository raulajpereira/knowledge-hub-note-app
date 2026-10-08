'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AmbientBackground } from '@/components/ui';
import { Logo } from '@/components/brand/Logo';
import { useI18n } from '@/i18n/client';
import { effectivePrefs, type Prefs } from '@/lib/prefs';
import { appearanceCss, appearanceOf } from '@/components/shell/appearance';
import { assetUrl } from '@/components/shell/assetUrl';
import { AvatarFace } from '@/components/shell/Avatar';
import { LockScreen } from '@/components/shell/LockScreen';
import { PrefsProvider, usePrefsContext } from '@/components/shell/PrefsProvider';
import '@/components/shell/fonts';
import '@/components/shell/shell.css';
import { useA } from './ui';
import { Overview } from './Overview';
import { Codes } from './Codes';
import { Audit } from './Audit';
import './admin.css';

export type AdminRole = 'owner' | 'admin' | 'billing' | 'support' | 'readonly';
export type AdminMe = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  totp: boolean;
  assets: Partial<Record<'avatar' | 'background' | 'logo', number>>;
  modules: string[];
};
type Area = 'overview' | 'clients' | 'users' | 'codes' | 'plans' | 'requests' | 'admins' | 'audit';

// The same role table as the server (src/server/admin/guard.ts): the console
// only hides what the API would refuse anyway.
const READ: Record<AdminRole, Area[]> = {
  owner: ['overview', 'clients', 'users', 'codes', 'plans', 'requests', 'admins', 'audit'],
  admin: ['overview', 'clients', 'users', 'codes', 'plans', 'requests', 'audit'],
  billing: ['overview', 'clients', 'users', 'codes', 'plans', 'requests'],
  support: ['overview', 'clients', 'users', 'codes', 'requests', 'audit'],
  readonly: ['overview', 'clients', 'users', 'codes', 'plans', 'requests', 'audit'],
};
const WRITE: Record<AdminRole, Area[]> = {
  owner: READ.owner,
  admin: READ.admin,
  billing: ['overview', 'clients', 'codes', 'plans', 'requests'],
  support: ['users', 'requests'],
  readonly: [],
};
export const ROLES: Record<AdminRole, [string, string, string]> = {
  owner: [
    'Manager',
    'Acesso total, incluindo gerir administradores',
    'linear-gradient(135deg,#ffd9a8,#ff9fb2 45%,#b9a6ff)',
  ],
  admin: ['Administrador', 'Acesso total exceto gerir administradores', 'oklch(0.75 0.12 245)'],
  billing: ['Faturação', 'Clientes, licenças, códigos e pacotes', 'oklch(0.8 0.13 70)'],
  support: ['Suporte', 'Utilizadores, pedidos e auditoria', 'oklch(0.75 0.13 150)'],
  readonly: ['Só leitura', 'Vê tudo, não altera nada', '#e8e2dc'],
};

export type Section = 'overview' | 'packs' | 'inds' | 'codes' | 'plans' | 'requests' | 'admins' | 'audit';
const SEC_AREA: Record<Section, Area> = {
  overview: 'overview',
  packs: 'clients',
  inds: 'clients',
  codes: 'codes',
  plans: 'plans',
  requests: 'requests',
  admins: 'admins',
  audit: 'audit',
};
/** Sections built so far (the rest arrive with Fases 10.2/10.3). */
const READY: Section[] = ['overview', 'codes', 'audit'];

const ICONS: Record<Section, string> = {
  overview:
    '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
  packs:
    '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><circle cx="9" cy="13" r="1.6"/><circle cx="15" cy="13" r="1.6"/>',
  inds: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  codes:
    '<path d="M14 3h7v7"/><path d="M21 3l-9 9"/><path d="M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
  plans:
    '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  requests: '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8"/><path d="M8 12h5"/>',
  admins: '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/>',
  audit:
    '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
};
const NAV: Array<[string | null, Section[]]> = [
  [null, ['overview']],
  ['Gestão', ['packs', 'inds', 'codes', 'plans', 'requests']],
  ['Sistema', ['admins', 'audit']],
];
export const SEC_TITLE: Record<Section, [string, string]> = {
  overview: ['Visão Geral', 'Estado do negócio hoje'],
  packs: ['Packs de Utilizadores', 'Empresas com vários lugares e a sua equipa'],
  inds: ['Utilizadores Individuais', 'Contas com uma licença própria'],
  codes: ['Códigos', 'Convites e licenças: lugares, validade e estado'],
  plans: ['Pacotes e Preços', 'Mensal por utilizador, anual com desconto'],
  requests: ['Pedidos', 'Pedidos de plano e de pacotes personalizados feitos na app'],
  admins: ['Administradores', 'Quem pode aceder a esta consola e com que permissões'],
  audit: ['Auditoria', 'Escolha o período e os filtros para ver as atividades'],
};

export const Svg = ({ d, s = 18, sw = 1.8 }: { d: string; s?: number; sw?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ flex: 'none' }}
    dangerouslySetInnerHTML={{ __html: d }}
  />
);

type ConsoleApi = {
  me: AdminMe;
  can: (area: Area, write?: boolean) => boolean;
  /** whether a section can be opened by this admin */
  has: (sec: Section) => boolean;
  go: (sec: Section, extra?: Record<string, string>) => void;
  /** opens the right-hand drawer (null closes it) */
  drawer: (node: React.ReactNode | null) => void;
};
const Ctx = createContext<ConsoleApi | null>(null);
export const useConsole = () => useContext(Ctx)!;

/** The header row of a section: title, subtitle, back button, tools and the primary action. */
export function SectionHead({
  title,
  sub,
  back,
  children,
}: {
  title: string;
  sub?: string;
  back?: { label: string; onClick: () => void };
  children?: React.ReactNode;
}) {
  return (
    <>
      <div className="kh-ad-head">
        {back && (
          <button type="button" className="kh-ad-back" onClick={back.onClick}>
            <Svg d='<path d="M15 6l-6 6 6 6"/>' s={16} sw={2} />
            {back.label}
          </button>
        )}
        <div className="kh-ad-title">
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
        </div>
      </div>
      {children && <div className="kh-ad-tools">{children}</div>}
    </>
  );
}

const DRAWER_W = 440;
const NAV_W = 240;
const LOCK_KEY = 'kh.adminLocked';

function Console({ me }: { me: AdminMe }) {
  const { A } = useA();
  const { t } = useI18n();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const raw = usePrefsContext()!.prefs;
  const modules = useMemo(() => new Set(me.modules), [me.modules]);
  const look = useMemo(() => appearanceOf(effectivePrefs(raw, modules)), [raw, modules]);
  const photo =
    look.bg.mode === 'photo' && me.assets.background ? assetUrl('background', me.assets.background) : null;

  const can = useCallback(
    (area: Area, write = false) => (write ? WRITE : READ)[me.role].includes(area),
    [me.role],
  );
  const visible = (s: Section) => READY.includes(s) && can(SEC_AREA[s]);
  const asked = (sp.get('s') ?? 'overview') as Section;
  const sec: Section = SEC_AREA[asked] && visible(asked) ? asked : 'overview';

  const [drawerNode, setDrawerNode] = useState<React.ReactNode | null>(null);
  const go = useCallback(
    (s: Section, extra: Record<string, string> = {}) => {
      setDrawerNode(null);
      const next = new URLSearchParams({ s, ...extra });
      router.push(`${path}?${next}`, { scroll: false });
    },
    [path, router],
  );

  const [locked, setLocked] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(LOCK_KEY) === '1') setLocked(true);
    } catch {
      // ignore
    }
  }, []);
  const setLock = (on: boolean) => {
    setLocked(on);
    try {
      if (on) sessionStorage.setItem(LOCK_KEY, '1');
      else sessionStorage.removeItem(LOCK_KEY);
    } catch {
      // ignore
    }
  };

  // resizable nav and drawer (prototype kv.admin.navW / drW)
  const [navW, setNavW] = useState(NAV_W);
  const [drW, setDrW] = useState(DRAWER_W);
  const [dragging, setDragging] = useState<'nav' | 'dr' | null>(null);
  useEffect(() => {
    try {
      const n = Number(localStorage.getItem('kh.admin.navW'));
      const d = Number(localStorage.getItem('kh.admin.drW'));
      if (n >= 190 && n <= 380) setNavW(n);
      if (d >= 340 && d <= 820) setDrW(d);
    } catch {
      // ignore
    }
  }, []);
  const drag = useRef<{ x: number; w: number; which: 'nav' | 'dr' } | null>(null);
  const startDrag = (which: 'nav' | 'dr') => (e: React.PointerEvent) => {
    e.preventDefault();
    drag.current = { x: e.clientX, w: which === 'nav' ? navW : drW, which };
    setDragging(which);
    const clamp = (v: number) =>
      which === 'nav' ? Math.max(190, Math.min(380, v)) : Math.max(340, Math.min(820, v));
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const v = clamp(Math.round(d.w + (d.which === 'nav' ? 1 : -1) * (ev.clientX - d.x)));
      if (d.which === 'nav') setNavW(v);
      else setDrW(v);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDragging(null);
      drag.current = null;
      try {
        localStorage.setItem('kh.admin.navW', String(navWRef.current));
        localStorage.setItem('kh.admin.drW', String(drWRef.current));
      } catch {
        // ignore
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const navWRef = useRef(navW);
  const drWRef = useRef(drW);
  navWRef.current = navW;
  drWRef.current = drW;

  const api = useMemo<ConsoleApi>(
    () => ({
      me,
      can,
      has: (s: Section) => READY.includes(s) && can(SEC_AREA[s]),
      go,
      drawer: setDrawerNode,
    }),
    [me, can, go],
  );
  const open = drawerNode !== null;
  const cols = open
    ? `min(${navW}px, 22%) minmax(280px,1fr) min(${drW}px, 40%)`
    : `min(${navW}px, 30%) minmax(320px,1fr)`;
  const role = ROLES[me.role];

  return (
    <Ctx.Provider value={api}>
      <style>{appearanceCss(look)}</style>
      <AmbientBackground
        ambient={look.bg.mode === 'photo' ? 'Areia' : look.bg.mode}
        photoUrl={photo}
        blur={look.bg.blur}
        dim={look.bg.dim}
      />
      <div className="kh-ad kh-above" aria-hidden={locked || undefined} inert={locked || undefined}>
        {!me.totp ? (
          <div className="kh-ad-gate">
            <div className="kh-ad-card">
              <Logo size={40} />
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>
                {A('Ative a autenticação de dois fatores')}
              </h1>
              <p className="kh-ad-note" style={{ margin: 0, fontSize: 13.5 }}>
                {A(
                  'A consola de administração exige 2FA. Na app, abra Conta › Segurança, ative a autenticação de dois fatores e volte aqui.',
                )}
              </p>
              <Link className="kh-ad-btn" data-kind="p" href="/app">
                {A('← Voltar à app')}
              </Link>
            </div>
          </div>
        ) : (
          <div className="kh-ad__grid" style={{ gridTemplateColumns: cols }}>
            <aside className="kh-ad-glass kh-ad-nav" aria-label={A('Consola de Administração')}>
              <div className="kh-ad-brand">
                <Logo size={36} showWordmark={false} />
                <div>
                  <div className="kh-ad-brand__name">
                    Knowledge<b>Hub</b>
                  </div>
                  <div className="kh-ad-brand__sub">Administration Console</div>
                </div>
              </div>
              {NAV.map(([group, items]) => {
                const shown = items.filter(visible);
                if (!shown.length) return null;
                return (
                  <div key={group ?? 'top'} style={{ display: 'contents' }}>
                    {group && <div className="kh-ad-group">{A(group)}</div>}
                    {shown.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="kh-ad-item"
                        aria-current={sec === s ? 'page' : undefined}
                        onClick={() => go(s)}
                      >
                        <Svg d={ICONS[s]} />
                        <span>{A(SEC_TITLE[s][0])}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
              <Link className="kh-ad-me" href="/app" title={A('Abrir app')}>
                <span style={{ position: 'relative' }}>
                  <AvatarFace name={me.name} photoV={me.assets.avatar} size={42} fontSize={14} />
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      right: 0,
                      bottom: 0,
                      width: 11,
                      height: 11,
                      borderRadius: '50%',
                      background: 'oklch(0.78 0.15 150)',
                      border: '2px solid rgba(40,30,25,.9)',
                    }}
                  />
                </span>
                <span className="kh-ad-me__txt">
                  <span className="kh-ad-me__name">{me.name}</span>
                  <span className="kh-ad-role" style={{ background: role[2] }}>
                    {A(role[0])}
                  </span>
                </span>
                <span className="kh-ad-me__go" aria-hidden="true">
                  <Svg d='<path d="M7 17L17 7"/><path d="M8 7h9v9"/>' s={15} sw={2} />
                </span>
              </Link>
            </aside>
            <div
              className="kh-ad-handle"
              style={{ position: 'absolute', left: `calc(14px + min(${navW}px, ${open ? 22 : 30}%) + 7px)` }}
              title={A('Arraste para ajustar · duplo clique repõe')}
              data-drag={dragging === 'nav' || undefined}
              onPointerDown={startDrag('nav')}
              onDoubleClick={() => setNavW(NAV_W)}
              role="separator"
              aria-orientation="vertical"
            >
              <span />
            </div>
            <main className="kh-ad-glass kh-ad-main">
              <div className="kh-ad-top">
                <Link className="kh-ad-pill" href="/app">
                  {A('Voltar à App')}
                </Link>
                <button
                  type="button"
                  className="kh-ad-lock"
                  title={A('Bloquear')}
                  aria-label={A('Bloquear')}
                  onClick={() => setLock(true)}
                >
                  <Svg
                    d='<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
                    s={17}
                  />
                </button>
              </div>
              {sec === 'overview' && <Overview />}
              {sec === 'codes' && <Codes />}
              {sec === 'audit' && <Audit />}
            </main>
            {open && (
              <>
                <div
                  className="kh-ad-handle"
                  style={{ position: 'absolute', right: `calc(14px + min(${drW}px, 40%) + 1px)` }}
                  title={A('Arraste para ajustar · duplo clique repõe')}
                  data-drag={dragging === 'dr' || undefined}
                  onPointerDown={startDrag('dr')}
                  onDoubleClick={() => setDrW(DRAWER_W)}
                  role="separator"
                  aria-orientation="vertical"
                >
                  <span />
                </div>
                <aside className="kh-ad-glass kh-ad-drawer" aria-label={t('ui_close')}>
                  {drawerNode}
                </aside>
              </>
            )}
          </div>
        )}
      </div>
      {locked && (
        <LockScreen
          name={me.name}
          email={me.email}
          photoV={me.assets.avatar}
          onUnlock={() => setLock(false)}
        />
      )}
    </Ctx.Provider>
  );
}

export function AdminShell({ me, prefs }: { me: AdminMe; prefs: Prefs }) {
  return (
    <PrefsProvider initial={prefs}>
      <Console me={me} />
    </PrefsProvider>
  );
}
