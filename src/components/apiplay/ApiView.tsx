'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { COL_DEFAULTS, COL_LIMITS } from '@/lib/prefs';
import { useConfirm, usePersistentState, useToast } from '@/components/ui';
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
type Env = { id: string; name: string; vars: Kv[] };
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
};

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
  const [envName, setEnvName] = usePersistentState<string>('api.env', 'DEV');
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
  const env = envs.find((e) => e.name === envName) ?? envs[0];
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
  const act = all.find((x) => x.id === activeId) ?? null;
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
    } catch {
      fail();
    }
  };
  const removeFolder = async (f: Folder) => {
    await api(`/api-requests/folders/${f.id}`, undefined, 'DELETE').catch(() => {});
    setFolders((cur) => cur.filter((x) => x.id !== f.id));
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
        body: act.method !== 'GET' && act.bodyType !== 'none' ? resolve(act.body) : undefined,
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
    if (act.method !== 'GET' && act.bodyType !== 'none' && act.body)
      parts.push(`--data '${resolve(act.body)}'`);
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
                role="button"
                tabIndex={0}
                onClick={() => setFolder(f.id)}
                onKeyDown={(e) => e.key === 'Enter' && setFolder(f.id)}
              >
                <Svg d={I.folder} s={17} />
                <span>{f.name}</span>
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
          <div className="kh-ap-main">
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
              <label className="kh-ap-env">
                {t('p_env')}
                <select value={env?.name ?? ''} onChange={(e) => setEnvName(e.target.value)}>
                  {envs.map((e) => (
                    <option key={e.id} value={e.name}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
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
              <div className="kh-ap-kv">
                {kvList.map((p, i) => (
                  <div key={i} className="kh-ap-kvrow" style={{ opacity: p.on ? 1 : 0.45 }}>
                    <button
                      type="button"
                      className="kh-ap-ck"
                      data-on={p.on || undefined}
                      aria-pressed={p.on}
                      aria-label={p.k || t('p_key')}
                      onClick={() => setKv(kvList.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                    >
                      {p.on && <Svg d={I.ok} s={12} />}
                    </button>
                    <input
                      value={p.k}
                      placeholder={t('p_key')}
                      spellCheck={false}
                      aria-label={t('p_key')}
                      onChange={(e) =>
                        setKv(kvList.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))
                      }
                    />
                    <input
                      value={p.v}
                      placeholder={t('p_value')}
                      spellCheck={false}
                      aria-label={`${t('p_value')} ${p.k}`}
                      onChange={(e) =>
                        setKv(kvList.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))
                      }
                    />
                    <button
                      type="button"
                      className="kh-ap-rm"
                      title={t('del')}
                      aria-label={`${t('del')} ${p.k || t('p_key')}`}
                      onClick={() => setKv(kvList.filter((_, j) => j !== i))}
                    >
                      <Svg d={I.x} s={13} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="kh-ap-add"
                  onClick={() => setKv([...kvList, { k: '', v: '', on: true }])}
                >
                  + {t('p_add')}
                </button>
                {kvKey === 'env' && <div className="kh-ap-hint">{t('p_envHint')}</div>}
              </div>
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
                      upd(act.id, { bodyType: v, headers }, 0);
                    }}
                  >
                    <option value="none">{t('p_noBody')}</option>
                    <option value="json">JSON</option>
                    <option value="form">x-www-form-urlencoded</option>
                    <option value="xml">XML</option>
                    <option value="text">{t('ap_text')}</option>
                  </select>
                  <div style={{ flex: 1 }} />
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
                </div>
                <textarea
                  className="kh-ap-code"
                  value={act.body}
                  spellCheck={false}
                  placeholder={t('p_bodyPh')}
                  aria-label={t('p_body')}
                  onChange={(e) => upd(act.id, { body: e.target.value })}
                />
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
                    <textarea
                      className="kh-ap-code"
                      readOnly
                      value={rs.body}
                      spellCheck={false}
                      aria-label={t('p_response')}
                    />
                  )}
                  {rs.ok && rs.headers.length > 0 && (
                    <div className="kh-ap-rh">
                      <div>Headers</div>
                      {rs.headers.map(([k, v], i) => (
                        <div key={i}>
                          <span>{k}</span>
                          <span>{v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            <div className="kh-ap-hint kh-ap-proxy">{t('ap_proxyHint')}</div>
          </div>
        ) : (
          <div className="kh-em-none">{t('p_noActive')}</div>
        )}
      </section>
    </div>
  );
}
