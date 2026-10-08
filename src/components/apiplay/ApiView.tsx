'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { COL_DEFAULTS, COL_LIMITS } from '@/lib/prefs';
import { Modal, useConfirm, usePersistentState, useToast } from '@/components/ui';
import { encodeFormBody, parseFormBody, storeFormBody } from '@/lib/apiForm';
import { codeHtml, guessLang } from '@/lib/codeHighlight';
import { usePref } from '@/components/shell/PrefsProvider';
import { useShell } from '@/components/shell/ShellContext';
import { refreshCounts } from '@/components/shell/counts';
import { ColHandle } from '@/components/content/ColHandle';
import { useWhen } from '@/components/content/useWhen';
import '../emails/emails.css';
import './apiplay.css';

// API Playground — ZNotes.dc.html `isApi`: saved requests in folders,
// environments with {{variables}}, params / headers / body / auth, and the
// response. The browser resolves variables and auth; the call itself is made
// by the server proxy (no CORS, SSRF-guarded). Left column = Emails styles.

type Kv = { k: string; v: string; on: boolean };
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Req = {
  id: string;
  folderId: string | null;
  title: string;
  method: Method;
  url: string;
  params: Kv[];
  headers: Kv[];
  bodyType: 'none' | 'json' | 'form' | 'xml' | 'text';
  body: string;
  authType: 'none' | 'basic' | 'bearer';
  auth: { token: string; user: string; pass: string };
  createdAt: string;
};
/** folderId null: the global environments (requests without a folder) */
type Env = { id: string; folderId: string | null; name: string; vars: Kv[] };
type Folder = { id: string; name: string };
type Resp =
  | {
      ok: true;
      status: number;
      statusText: string;
      ms: number;
      at: string;
      headers: Array<[string, string]>;
      body: string;
      truncated: boolean;
    }
  | { ok: false; error: string; ms: number; at: string };
type Tab = 'params' | 'headers' | 'body' | 'auth' | 'env' | 'response';
type Cols = { list?: number };

const METHOD_C: Record<Method, string> = {
  GET: 'oklch(0.82 0.14 150)',
  POST: 'oklch(0.8 0.11 240)',
  PUT: 'oklch(0.85 0.12 75)',
  PATCH: 'oklch(0.78 0.12 300)',
  DELETE: 'oklch(0.74 0.17 25)',
};
const CT: Record<string, string> = {
  json: 'application/json',
  form: 'application/x-www-form-urlencoded',
  xml: 'application/xml',
  text: 'text/plain',
};

/** Prototype qsOf / fullUrl: {{vars}} stay readable in the query string. */
const qsOf = (params: Kv[]) =>
  params
    .filter((p) => p.on && p.k)
    .map((p) => `${encodeURIComponent(p.k)}=${encodeURIComponent(p.v)}`)
    .join('&')
    .replace(/%7B%7B/g, '{{')
    .replace(/%7D%7D/g, '}}')
    .replace(/%2C/g, ',')
    .replace(/%24/g, '$');
const fullUrl = (q: Req) => {
  const s = qsOf(q.params);
  return q.url + (s ? `?${s}` : '');
};
const stColor = (s: number) =>
  s === 0
    ? 'oklch(0.74 0.17 25)'
    : s < 300
      ? 'oklch(0.8 0.14 150)'
      : s < 400
        ? 'oklch(0.85 0.12 75)'
        : 'oklch(0.74 0.17 25)';
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

const Svg = ({ d, s = 15 }: { d: string; s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: d }}
  />
);
const I = {
  search: '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
  x: '<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>',
  dup: '<rect x="9" y="9" width="11" height="11" rx="2.5"></rect><path d="M5 15V6a2 2 0 0 1 2-2h9"></path>',
  trash: '<path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path>',
  send: '<path d="M4 12l16-8-6 16-3-7z"></path>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"></path>',
  sliders:
    '<line x1="4" y1="7" x2="20" y2="7"></line><line x1="4" y1="17" x2="20" y2="17"></line><circle cx="9" cy="7" r="2.2"></circle><circle cx="15" cy="17" r="2.2"></circle>',
};

/** The response body's language: from its Content-Type, else a guess. */
function respLang(headers: Array<[string, string]>, body: string): string | null {
  const ct = (headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? '').toLowerCase();
  if (ct.includes('json')) return 'json';
  if (ct.includes('html')) return 'html';
  if (ct.includes('xml')) return 'xml';
  if (ct.includes('javascript')) return 'javascript';
  return guessLang(body);
}
// past this size the body is shown without colours (highlighting would stall the page)
const HL_MAX = 400_000;

/** Body over headers, the line between them dragged to share the height. */
function RespSplit({
  split,
  onSplit,
  top,
  bottom,
}: {
  split: number;
  onSplit: (v: number) => void;
  top: React.ReactNode;
  bottom: React.ReactNode;
}) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<number | null>(null);
  const v = live ?? split;
  const clamp = (x: number) => Math.min(0.88, Math.max(0.15, x));
  return (
    <div className="kh-ap-split" ref={box} style={{ gridTemplateRows: `${v}fr 12px ${1 - v}fr` }}>
      {top}
      <div
        className="kh-ap-splitter"
        role="separator"
        aria-orientation="horizontal"
        aria-label={t('p_respResize')}
        aria-valuemin={15}
        aria-valuemax={88}
        aria-valuenow={Math.round(v * 100)}
        tabIndex={0}
        onPointerDown={(e) => {
          const r = box.current?.getBoundingClientRect();
          if (!r) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const move = (ev: PointerEvent) => setLive(clamp((ev.clientY - r.top) / r.height));
          const up = (ev: PointerEvent) => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            setLive(null);
            onSplit(clamp((ev.clientY - r.top) / r.height));
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
        onDoubleClick={() => onSplit(0.7)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') onSplit(clamp(v - 0.05));
          else if (e.key === 'ArrowDown') onSplit(clamp(v + 0.05));
          else return;
          e.preventDefault();
        }}
      >
        <span />
      </div>
      {bottom}
    </div>
  );
}

/** Key / value rows with a switch each — Params, Headers, Variables and the form body. */
function KvEditor({ list, onChange, hint }: { list: Kv[]; onChange: (L: Kv[]) => void; hint?: string }) {
  const { t } = useI18n();
  return (
    <div className="kh-ap-kv">
      {list.map((p, i) => (
        <div key={i} className="kh-ap-kvrow" style={{ opacity: p.on ? 1 : 0.45 }}>
          <button
            type="button"
            className="kh-ap-ck"
            data-on={p.on || undefined}
            aria-pressed={p.on}
            aria-label={p.k || t('p_key')}
            onClick={() => onChange(list.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
          >
            {p.on && <Svg d={I.ok} s={12} />}
          </button>
          <input
            value={p.k}
            placeholder={t('p_key')}
            spellCheck={false}
            aria-label={t('p_key')}
            onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))}
          />
          <input
            value={p.v}
            placeholder={t('p_value')}
            spellCheck={false}
            aria-label={`${t('p_value')} ${p.k}`}
            onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))}
          />
          <button
            type="button"
            className="kh-ap-rm"
            title={t('del')}
            aria-label={`${t('del')} ${p.k || t('p_key')}`}
            onClick={() => onChange(list.filter((_, j) => j !== i))}
          >
            <Svg d={I.x} s={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="kh-ap-add"
        onClick={() => onChange([...list, { k: '', v: '', on: true }])}
      >
        + {t('p_add')}
      </button>
      {hint && <div className="kh-ap-hint">{hint}</div>}
    </div>
  );
}

/** A folder's environments (or the global ones): add, rename, remove. */
function EnvManager({
  scope,
  envs,
  onClose,
  onCreate,
  onRename,
  onRemove,
}: {
  scope: string;
  envs: Env[];
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (e: Env, name: string) => Promise<void>;
  onRemove: (e: Env) => Promise<void>;
}) {
  const { t } = useI18n();
  const [names, setNames] = useState<Record<string, string>>({});
  const [nu, setNu] = useState('');
  const rename = (e: Env) => {
    const n = (names[e.id] ?? e.name).trim().slice(0, 40);
    setNames(({ [e.id]: _, ...rest }) => rest);
    if (n && n !== e.name) void onRename(e, n);
  };
  const add = () => {
    const n = nu.trim().slice(0, 40);
    if (!n) return;
    setNu('');
    void onCreate(n);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('p_envsTitle')}
      subtitle={scope}
      size="sm"
      closeLabel={t('ui_close')}
    >
      <div className="kh-ap-envs">
        {envs.map((e) => (
          <div key={e.id} className="kh-ap-envrow">
            <input
              value={names[e.id] ?? e.name}
              maxLength={40}
              aria-label={`${t('p_envName')} ${e.name}`}
              onChange={(ev) => setNames((m) => ({ ...m, [e.id]: ev.target.value }))}
              onBlur={() => rename(e)}
              onKeyDown={(ev) => ev.key === 'Enter' && rename(e)}
            />
            <span>{t('p_envVars').replace('{n}', String(e.vars.length))}</span>
            <button
              type="button"
              className="kh-ap-rm"
              title={t('del')}
              aria-label={`${t('del')} ${e.name}`}
              disabled={envs.length <= 1}
              onClick={() => void onRemove(e)}
            >
              <Svg d={I.trash} s={14} />
            </button>
          </div>
        ))}
        <div className="kh-ap-envrow kh-ap-envnew">
          <input
            value={nu}
            maxLength={40}
            placeholder={t('p_envNew')}
            aria-label={t('p_envNew')}
            onChange={(e) => setNu(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button type="button" className="kh-ap-add" onClick={add}>
            + {t('p_add')}
          </button>
        </div>
        <div className="kh-ap-hint">{t('p_envsHint')}</div>
      </div>
    </Modal>
  );
}

export function ApiView() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const { focus } = useShell();
  const when = useWhen();
  const [cols, setCols] = usePref<Cols>('cols', {});
  const [liveList, setLiveList] = useState<number | null>(null);
  const [folder, setFolder] = usePersistentState<string>('api.folder', 'all');
  // the chosen environment of each folder ('global': requests without a folder)
  const [envSel, setEnvSel] = usePersistentState<Record<string, string>>('api.envSel', {});
  const [envMgr, setEnvMgr] = useState(false);
  // share of the response height given to the body (the rest: headers)
  const [respSplit, setRespSplit] = usePersistentState<number>('api.respSplit', 0.7);
  const [tab, setTab] = useState<Tab>('params');
  const [items, setItems] = useState<Req[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [envs, setEnvs] = useState<Env[]>([]);
  const [resps, setResps] = useState<Record<string, Resp>>({});
  const [sending, setSending] = useState(false);
  const [q, setQ] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [copied, setCopied] = useState('');
  const timers = useRef(new Map<string, { patch: Partial<Req>; tm: ReturnType<typeof setTimeout> }>());
  const envTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeId = sp.get('r');

  const open = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(sp.toString());
      if (id) next.set('r', id);
      else next.delete('r');
      router.replace(`${path}${next.size ? `?${next}` : ''}`, { scroll: false });
    },
    [path, router, sp],
  );

  useEffect(() => {
    api<{ requests: Req[]; folders: Folder[]; envs: Env[] }>('/api-requests')
      .then((r) => {
        setItems(r.requests);
        setFolders(r.folders);
        setEnvs(r.envs);
      })
      .catch(() => setItems([]));
  }, []);

  const fail = () => toast({ message: t('ne_saveFail'), tone: 'error' });
  const flush = useCallback(
    (id: string) => {
      const p = timers.current.get(id);
      if (!p) return;
      clearTimeout(p.tm);
      timers.current.delete(id);
      void api(`/api-requests/${id}`, p.patch, 'PATCH').catch(fail);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fail only shows a toast
    [],
  );
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const id of [...map.keys()]) flush(id);
    };
  }, [flush]);
  const upd = (id: string, p: Partial<Req>, delay = 500) => {
    setItems((cur) => cur && cur.map((x) => (x.id === id ? { ...x, ...p } : x)));
    const prev = timers.current.get(id);
    if (prev) clearTimeout(prev.tm);
    timers.current.set(id, {
      patch: { ...(prev?.patch ?? {}), ...p },
      tm: setTimeout(() => flush(id), delay),
    });
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const all = useMemo(() => items ?? [], [items]);
  const act = all.find((x) => x.id === activeId) ?? null;
  const scopeKey = act?.folderId ?? 'global';
  const scopeEnvs = envs.filter((e) => (e.folderId ?? 'global') === scopeKey);
  const env = scopeEnvs.find((e) => e.id === envSel[scopeKey]) ?? scopeEnvs[0];
  const scopeName = act?.folderId
    ? (folders.find((f) => f.id === act.folderId)?.name ?? '')
    : `${t('p_noFolder')} · ${t('p_envGlobal')}`;
  const resolve = useCallback(
    (s: string) =>
      String(s ?? '').replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, k: string) => {
        const v = env?.vars.find((x) => x.on && x.k === k);
        return v ? v.v : m;
      }),
    [env],
  );
  const query = q.trim().toLowerCase();
  const list = all.filter(
    (x) =>
      (folder === 'all' || (folder === 'none' ? !x.folderId : x.folderId === folder)) &&
      (!query || `${x.title} ${x.url}`.toLowerCase().includes(query)),
  );
  const rs = act ? resps[act.id] : undefined;

  const create = async () => {
    try {
      const { request } = await api<{ request: Req }>('/api-requests', {
        title: t('p_newTitle'),
        folderId:
          folder !== 'all' && folder !== 'none' && folders.some((f) => f.id === folder) ? folder : null,
      });
      setItems((cur) => [request, ...(cur ?? [])]);
      setTab('params');
      open(request.id);
      refreshCounts();
    } catch {
      fail();
    }
  };
  const duplicate = async () => {
    if (!act) return;
    flush(act.id);
    try {
      const { request } = await api<{ request: Req }>(`/api-requests/${act.id}/duplicate`, {
        suffix: ' (2)',
      });
      setItems((cur) => [request, ...(cur ?? [])]);
      open(request.id);
      refreshCounts();
    } catch {
      fail();
    }
  };
  const remove = async () => {
    if (!act) return;
    const ok = await confirm({
      title: t('tr_askTitle'),
      body: t('tr_askBody').replace('{x}', act.title),
      confirmLabel: t('tr_move'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    const tm = timers.current.get(act.id);
    if (tm) clearTimeout(tm.tm);
    timers.current.delete(act.id);
    await api(`/api-requests/${act.id}`, undefined, 'DELETE').catch(() => {});
    const idx = list.findIndex((x) => x.id === act.id);
    const rest = list.filter((x) => x.id !== act.id);
    setItems((cur) => cur && cur.filter((x) => x.id !== act.id));
    open(rest[Math.min(idx, rest.length - 1)]?.id ?? null);
    refreshCounts();
  };
  const addFolder = async () => {
    const n = newFolder.trim();
    if (!n) return;
    try {
      const { folder: f } = await api<{ folder: Folder }>('/api-requests/folders', { name: n.slice(0, 80) });
      setFolders((cur) => [...cur, f]);
      setNewFolder('');
      setFolder(f.id);
      // the folder's own environments (copies of the global ones)
      void api<{ envs: Env[] }>('/api-envs').then((r) => setEnvs(r.envs), fail);
    } catch {
      fail();
    }
  };
  const removeFolder = async (f: Folder) => {
    await api(`/api-requests/folders/${f.id}`, undefined, 'DELETE').catch(() => {});
    setFolders((cur) => cur.filter((x) => x.id !== f.id));
    setEnvs((cur) => cur.filter((e) => e.folderId !== f.id));
    setItems((cur) => cur && cur.map((x) => (x.folderId === f.id ? { ...x, folderId: null } : x)));
    if (folder === f.id) setFolder('all');
  };
  const setEnvVars = (vars: Kv[]) => {
    if (!env) return;
    setEnvs((cur) => cur.map((e) => (e.id === env.id ? { ...e, vars } : e)));
    if (envTimer.current) clearTimeout(envTimer.current);
    const id = env.id;
    envTimer.current = setTimeout(() => void api(`/api-envs/${id}`, { vars }, 'PUT').catch(fail), 500);
  };

  const createEnv = async (name: string) => {
    try {
      const { env: e } = await api<{ env: Env }>('/api-envs', { name, folderId: act?.folderId ?? null });
      setEnvs((cur) => [...cur, e]);
      setEnvSel({ ...envSel, [scopeKey]: e.id });
    } catch (e) {
      toast({
        message: (e as { code?: string }).code === 'env_exists' ? t('p_envExists') : t('ne_saveFail'),
        tone: 'error',
      });
    }
  };
  const renameEnv = async (e: Env, name: string) => {
    try {
      await api(`/api-envs/${e.id}`, { name }, 'PUT');
      setEnvs((cur) => cur.map((x) => (x.id === e.id ? { ...x, name } : x)));
    } catch (er) {
      toast({
        message: (er as { code?: string }).code === 'env_exists' ? t('p_envExists') : t('ne_saveFail'),
        tone: 'error',
      });
    }
  };
  const removeEnv = async (e: Env) => {
    const ok = await confirm({
      title: t('p_envDelTitle'),
      body: t('p_envDelBody').replace('{x}', e.name),
      confirmLabel: t('del'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api-envs/${e.id}`, undefined, 'DELETE');
      setEnvs((cur) => cur.filter((x) => x.id !== e.id));
    } catch {
      fail();
    }
  };
  const formRows = act?.bodyType === 'form' ? parseFormBody(act.body) : [];
  const bodyOut = (x: Req) =>
    x.bodyType === 'form' ? encodeFormBody(parseFormBody(x.body), resolve) : resolve(x.body);

  const onUrl = (v: string) => {
    if (!act) return;
    const i = v.indexOf('?');
    const dec = (z: string) => {
      try {
        return decodeURIComponent(z);
      } catch {
        return z;
      }
    };
    const off = act.params.filter((p) => !p.on);
    const params =
      i < 0
        ? off
        : v
            .slice(i + 1)
            .split('&')
            .filter(Boolean)
            .map((s) => {
              const j = s.indexOf('=');
              return { k: dec(j < 0 ? s : s.slice(0, j)), v: dec(j < 0 ? '' : s.slice(j + 1)), on: true };
            })
            .concat(off);
    upd(act.id, { url: i < 0 ? v : v.slice(0, i), params });
  };
  const authHeader = (x: Req): [string, string] | null =>
    x.authType === 'bearer' && x.auth.token
      ? ['Authorization', `Bearer ${resolve(x.auth.token)}`]
      : x.authType === 'basic'
        ? ['Authorization', `Basic ${b64(`${resolve(x.auth.user)}:${resolve(x.auth.pass)}`)}`]
        : null;
  const send = async () => {
    if (!act || sending) return;
    const headers: Array<[string, string]> = act.headers
      .filter((h) => h.on && h.k)
      .map((h) => [resolve(h.k), resolve(h.v)]);
    const ah = authHeader(act);
    if (ah) headers.push(ah);
    const at = new Date().toISOString();
    setSending(true);
    const t0 = performance.now();
    try {
      const r = await api<
        | {
            ok: true;
            response: {
              status: number;
              statusText: string;
              headers: Array<[string, string]>;
              body: string;
              truncated: boolean;
              ms: number;
            };
          }
        | { ok: false; reason: string; message?: string }
      >('/api-requests/send', {
        method: act.method,
        url: resolve(fullUrl(act)),
        headers,
        body: act.method !== 'GET' && act.bodyType !== 'none' ? bodyOut(act) : undefined,
      });
      if (r.ok) {
        let body = r.response.body;
        try {
          body = JSON.stringify(JSON.parse(body), null, 2);
        } catch {
          // not JSON: shown as received
        }
        setResps((m) => ({ ...m, [act.id]: { ok: true, ...r.response, body, at } }));
      } else {
        const why =
          r.reason === 'blocked_address'
            ? t('ap_blocked')
            : r.reason === 'bad_url'
              ? t('ap_badUrl')
              : r.reason === 'bad_port'
                ? t('ap_badPort')
                : r.reason === 'timeout'
                  ? t('ap_timeout')
                  : t('ap_netError') + (r.message ?? r.reason);
        setResps((m) => ({
          ...m,
          [act.id]: { ok: false, error: why, ms: Math.round(performance.now() - t0), at },
        }));
      }
    } catch {
      setResps((m) => ({
        ...m,
        [act.id]: {
          ok: false,
          error: t('ap_netError') + 'KnowledgeHub',
          ms: Math.round(performance.now() - t0),
          at,
        },
      }));
    } finally {
      setSending(false);
      setTab('response');
    }
  };
  const curl = () => {
    if (!act) return '';
    const parts = [`curl -X ${act.method} '${resolve(fullUrl(act))}'`];
    act.headers
      .filter((x) => x.on && x.k)
      .forEach((x) => parts.push(`-H '${resolve(x.k)}: ${resolve(x.v)}'`));
    if (act.authType === 'bearer') parts.push(`-H 'Authorization: Bearer ${resolve(act.auth.token)}'`);
    if (act.authType === 'basic') parts.push(`-u '${resolve(act.auth.user)}:****'`);
    if (act.method !== 'GET' && act.bodyType !== 'none' && act.body) parts.push(`--data '${bodyOut(act)}'`);
    return parts.join(' \\\n  ');
  };
  const flash = (k: string) => {
    setCopied(k);
    setTimeout(() => setCopied((c) => (c === k ? '' : c)), 1500);
  };

  const kvKey = tab === 'params' ? 'params' : tab === 'headers' ? 'headers' : tab === 'env' ? 'env' : null;
  const kvList: Kv[] = !act || !kvKey ? [] : kvKey === 'env' ? (env?.vars ?? []) : act[kvKey];
  const setKv = (L: Kv[]) => {
    if (!act || !kvKey) return;
    if (kvKey === 'env') setEnvVars(L);
    else upd(act.id, { [kvKey]: L });
  };
  const bytes = rs && rs.ok ? new Blob([rs.body]).size : 0;
  const fmtStamp = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'en' ? 'en-GB' : 'pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  const listW = liveList ?? cols.list ?? COL_DEFAULTS.list;
  const tabs: Array<[Tab, string, number | string]> = act
    ? [
        ['params', t('p_params'), act.params.filter((p) => p.on).length],
        ['headers', t('p_headers'), act.headers.filter((p) => p.on).length],
        ['body', t('p_body'), 0],
        ['auth', t('p_auth'), 0],
        ['env', `${t('p_vars')} · ${env?.name ?? ''}`, 0],
        ['response', t('p_response'), rs ? (rs.ok ? rs.status : 'ERR') : 0],
      ]
    : [];

  return (
    <div
      className="kh-em"
      style={{ gridTemplateColumns: focus ? 'minmax(0,1fr)' : `${listW}px minmax(0,1fr)` }}
    >
      {!focus && (
        <ColHandle
          style={{ left: listW }}
          value={listW}
          limits={COL_LIMITS.list}
          dir={1}
          onLive={setLiveList}
          onDone={(w) => setCols({ ...cols, list: w })}
          onReset={() => setCols({ ...cols, list: COL_DEFAULTS.list })}
        />
      )}
      {!focus && (
        <div className="kh-em-side">
          <div className="kh-em-top">
            <label className="kh-em-search">
              <Svg d={I.search} s={16} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('ap_search')}
                aria-label={t('ap_search')}
              />
            </label>
            <button
              type="button"
              className="kh-ap-new"
              title={t('ap_new')}
              aria-label={t('ap_new')}
              onClick={() => void create()}
            >
              <Svg d={I.plus} s={16} />
            </button>
          </div>
          <div className="kh-em-folders kh-ap-folders">
            {[
              { id: 'all', name: t('p_all'), top: true, n: all.length },
              { id: 'none', name: t('p_noFolder'), top: true, n: all.filter((x) => !x.folderId).length },
              ...folders.map((f) => ({ ...f, top: false, n: all.filter((x) => x.folderId === f.id).length })),
            ].map((f) => (
              <div
                key={f.id}
                className="kh-em-folder"
                data-on={folder === f.id || undefined}
                data-top={f.top || undefined}
                onClick={() => setFolder(f.id)}
              >
                <Svg d={I.folder} s={17} />
                <button
                  type="button"
                  className="kh-rowbtn kh-em-folder__name"
                  aria-current={folder === f.id || undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFolder(f.id);
                  }}
                >
                  {f.name}
                </button>
                {!f.top && (
                  <button
                    type="button"
                    title={t('del')}
                    aria-label={`${t('del')} ${f.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeFolder(f);
                    }}
                  >
                    <Svg d={I.trash} s={14} />
                  </button>
                )}
                <span className="kh-em-count">{f.n}</span>
              </div>
            ))}
            <div className="kh-em-newfolder">
              <input
                value={newFolder}
                maxLength={80}
                placeholder={t('a_folderPh')}
                aria-label={t('a_folderPh')}
                onChange={(e) => setNewFolder(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void addFolder()}
              />
              <button type="button" onClick={() => void addFolder()}>
                + {t('newFolder')}
              </button>
            </div>
          </div>
          <section className="kh-em-list kh-ap-list" aria-label={t('nav_api')}>
            {list.map((x) => {
              const r = resps[x.id];
              return (
                <div
                  key={x.id}
                  className="kh-ap-item"
                  data-on={x.id === activeId || undefined}
                  role="button"
                  tabIndex={0}
                  onClick={() => open(x.id)}
                  onKeyDown={(e) => e.key === 'Enter' && open(x.id)}
                >
                  <span className="kh-ap-m" style={{ color: METHOD_C[x.method] }}>
                    {x.method}
                  </span>
                  <div>
                    <span>{x.title}</span>
                    <span>{x.url.replace(/^\{\{host\}\}/, '')}</span>
                  </div>
                  {r && <span className="kh-ap-dot" style={{ background: stColor(r.ok ? r.status : 0) }} />}
                </div>
              );
            })}
            {items && !list.length && <div className="kh-em-empty">{t('ap_empty')}</div>}
          </section>
        </div>
      )}

      <section className="kh-em-read kh-ap-read">
        {act ? (
          <div className="kh-ap-main" data-fill={(tab === 'response' && rs?.ok) || undefined}>
            <div className="kh-ap-head">
              <div className="kh-ap-titles">
                <input
                  className="kh-ap-title"
                  value={act.title}
                  maxLength={300}
                  aria-label={t('c_title')}
                  onChange={(e) => {
                    const v = e.target.value;
                    setItems((cur) => cur && cur.map((x) => (x.id === act.id ? { ...x, title: v } : x)));
                    if (v.trim()) upd(act.id, { title: v });
                  }}
                />
                <span>
                  {t('createdAt')} {fmtStamp(act.createdAt)}
                </span>
              </div>
              <div className="kh-ap-env">
                <label className="kh-ap-envlbl">
                  {t('p_env')}
                  <select
                    value={env?.id ?? ''}
                    title={scopeName}
                    onChange={(e) => setEnvSel({ ...envSel, [scopeKey]: e.target.value })}
                  >
                    {scopeEnvs.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="kh-ap-envbtn"
                  title={t('p_envsTitle')}
                  aria-label={t('p_envsTitle')}
                  onClick={() => setEnvMgr(true)}
                >
                  <Svg d={I.sliders} s={14} />
                </button>
              </div>
              <select
                className="kh-em-select kh-ap-folder"
                value={act.folderId ?? ''}
                title={t('p_folder')}
                aria-label={t('p_folder')}
                onChange={(e) => upd(act.id, { folderId: e.target.value || null }, 0)}
              >
                <option value="">{t('p_noFolder')}</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="kh-em-act kh-ap-curl"
                title={t('p_curl')}
                aria-label={t('p_curl')}
                onClick={() => {
                  void navigator.clipboard?.writeText(curl()).catch(() => {});
                  flash('curl');
                }}
              >
                {copied === 'curl' ? '✓' : 'cURL'}
              </button>
              <button
                type="button"
                className="kh-em-act"
                title={t('duplicate')}
                aria-label={t('duplicate')}
                onClick={() => void duplicate()}
              >
                <Svg d={I.dup} />
              </button>
              <button
                type="button"
                className="kh-em-act kh-em-act--del"
                title={t('del')}
                aria-label={t('del')}
                onClick={() => void remove()}
              >
                <Svg d={I.trash} />
              </button>
            </div>

            <div className="kh-ap-bar">
              <select
                className="kh-ap-method"
                value={act.method}
                aria-label={t('ap_method')}
                style={{ color: METHOD_C[act.method] }}
                onChange={(e) => upd(act.id, { method: e.target.value as Method }, 0)}
              >
                {(Object.keys(METHOD_C) as Method[]).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                className="kh-ap-url"
                value={fullUrl(act)}
                spellCheck={false}
                aria-label={t('p_url')}
                onChange={(e) => onUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void send()}
              />
              <button type="button" className="kh-ap-send" disabled={sending} onClick={() => void send()}>
                <Svg d={I.send} />
                {sending ? t('p_sending') : t('p_send')}
              </button>
            </div>
            <div className="kh-ap-resolved">→ {resolve(fullUrl(act))}</div>

            <div className="kh-ap-tabs" role="tablist">
              {tabs.map(([id, label, badge]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  data-on={tab === id || undefined}
                  onClick={() => setTab(id)}
                >
                  {label}
                  {badge ? <span>{badge}</span> : null}
                </button>
              ))}
            </div>

            {kvKey && (
              <KvEditor
                list={kvList}
                onChange={setKv}
                hint={
                  kvKey === 'env' && env
                    ? `${t('p_envScope').replace('{env}', env.name).replace('{scope}', scopeName)} ${t('p_envHint')}`
                    : undefined
                }
              />
            )}

            {tab === 'body' && (
              <div className="kh-ap-body">
                <div className="kh-ap-row">
                  <select
                    className="kh-em-select kh-ap-btype"
                    value={act.bodyType}
                    aria-label={t('p_body')}
                    onChange={(e) => {
                      const v = e.target.value as Req['bodyType'];
                      const ct = CT[v];
                      let headers = act.headers;
                      if (ct) {
                        const h = headers.find((p) => p.k.toLowerCase() === 'content-type');
                        headers = h
                          ? headers.map((p) => (p === h ? { ...p, v: ct } : p))
                          : [...headers, { k: 'Content-Type', v: ct, on: true }];
                      }
                      // the form body is kept as rows; leaving it gives the encoded text
                      const body =
                        v === 'form' && act.bodyType !== 'form'
                          ? storeFormBody(act.body.trim().startsWith('{') ? [] : parseFormBody(act.body))
                          : v !== 'form' && act.bodyType === 'form'
                            ? encodeFormBody(parseFormBody(act.body))
                            : act.body;
                      upd(act.id, { bodyType: v, headers, body }, 0);
                    }}
                  >
                    <option value="none">{t('p_noBody')}</option>
                    <option value="json">JSON</option>
                    <option value="form">x-www-form-urlencoded</option>
                    <option value="xml">XML</option>
                    <option value="text">{t('ap_text')}</option>
                  </select>
                  <div style={{ flex: 1 }} />
                  {act.bodyType !== 'form' && (
                    <button
                      type="button"
                      className="kh-ap-fmt"
                      onClick={() => {
                        try {
                          upd(act.id, { body: JSON.stringify(JSON.parse(act.body), null, 2) }, 0);
                        } catch {
                          // not JSON: left as is
                        }
                      }}
                    >
                      {t('p_format')}
                    </button>
                  )}
                </div>
                {act.bodyType === 'form' ? (
                  <KvEditor
                    list={formRows}
                    onChange={(L) => upd(act.id, { body: storeFormBody(L) })}
                    hint={t('p_formHint')}
                  />
                ) : (
                  <textarea
                    className="kh-ap-code"
                    value={act.body}
                    spellCheck={false}
                    placeholder={t('p_bodyPh')}
                    aria-label={t('p_body')}
                    onChange={(e) => upd(act.id, { body: e.target.value })}
                  />
                )}
              </div>
            )}

            {tab === 'auth' && (
              <div className="kh-ap-auth">
                <div className="kh-ap-row">
                  {(
                    [
                      ['none', t('p_none')],
                      ['basic', 'Basic'],
                      ['bearer', 'Bearer'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className="kh-ap-pill"
                      data-on={act.authType === id || undefined}
                      onClick={() => upd(act.id, { authType: id }, 0)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {act.authType === 'bearer' && (
                  <label className="kh-ap-field">
                    <span>Token</span>
                    <input
                      value={act.auth.token}
                      spellCheck={false}
                      onChange={(e) => upd(act.id, { auth: { ...act.auth, token: e.target.value } })}
                    />
                  </label>
                )}
                {act.authType === 'basic' && (
                  <div className="kh-ap-grid">
                    <label className="kh-ap-field">
                      <span>{t('p_user')}</span>
                      <input
                        value={act.auth.user}
                        spellCheck={false}
                        onChange={(e) => upd(act.id, { auth: { ...act.auth, user: e.target.value } })}
                      />
                    </label>
                    <label className="kh-ap-field">
                      <span>{t('p_pass')}</span>
                      <input
                        type="password"
                        value={act.auth.pass}
                        autoComplete="new-password"
                        onChange={(e) => upd(act.id, { auth: { ...act.auth, pass: e.target.value } })}
                      />
                    </label>
                  </div>
                )}
                <div className="kh-ap-hint">{t('p_authHint')}</div>
              </div>
            )}

            {tab === 'response' &&
              (!rs ? (
                <div className="kh-ap-noresp">{t('p_noResp')}</div>
              ) : (
                <div className="kh-ap-resp">
                  <div className="kh-ap-row kh-ap-meta">
                    <span
                      className="kh-ap-status"
                      style={{ background: stColor(rs.ok ? rs.status : 0).replace(')', ' / .22)') }}
                    >
                      <span style={{ background: stColor(rs.ok ? rs.status : 0) }} />
                      {rs.ok ? `${rs.status} ${rs.statusText}` : 'ERR'}
                    </span>
                    <span className="kh-ap-chip">{rs.ms} ms</span>
                    {rs.ok && (
                      <span className="kh-ap-chip">
                        {bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`}
                      </span>
                    )}
                    <span className="kh-ap-at">
                      {t('p_received')} {when(rs.at)}
                    </span>
                    <div style={{ flex: 1 }} />
                    {rs.ok && (
                      <button
                        type="button"
                        className="kh-ap-fmt"
                        onClick={() => {
                          void navigator.clipboard?.writeText(rs.body).catch(() => {});
                          flash('resp');
                        }}
                      >
                        {copied === 'resp' ? t('p_copied') : t('copy')}
                      </button>
                    )}
                  </div>
                  {!rs.ok && <div className="kh-ap-error">{rs.error}</div>}
                  {rs.ok && rs.truncated && <div className="kh-ap-hint">{t('ap_truncated')}</div>}
                  {rs.ok && (
                    <RespSplit
                      split={respSplit}
                      onSplit={setRespSplit}
                      top={
                        <pre className="kh-ap-code kh-ap-respbody" tabIndex={0} aria-label={t('p_response')}>
                          {rs.body.length > HL_MAX ? (
                            <code>{rs.body}</code>
                          ) : (
                            <code
                              dangerouslySetInnerHTML={{
                                __html: codeHtml(rs.body, respLang(rs.headers, rs.body)),
                              }}
                            />
                          )}
                        </pre>
                      }
                      bottom={
                        <div className="kh-ap-rh" tabIndex={0} aria-label="Headers">
                          <div>
                            Headers <span>{rs.headers.length}</span>
                          </div>
                          {rs.headers.map(([k, v], i) => (
                            <div key={i}>
                              <span>{k}</span>
                              <span>{v}</span>
                            </div>
                          ))}
                        </div>
                      }
                    />
                  )}
                </div>
              ))}
            <div className="kh-ap-hint kh-ap-proxy">{t('ap_proxyHint')}</div>
            {envMgr && (
              <EnvManager
                scope={scopeName}
                envs={scopeEnvs}
                onClose={() => setEnvMgr(false)}
                onCreate={createEnv}
                onRename={renameEnv}
                onRemove={removeEnv}
              />
            )}
          </div>
        ) : (
          <div className="kh-em-none">{t('p_noActive')}</div>
        )}
      </section>
    </div>
  );
}
