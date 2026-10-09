'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { api, isApiFailure } from '@/lib/client/api';
import { useConfirm, usePersistentState, useToast } from '@/components/ui';
import { ColHandle } from '@/components/content/ColHandle';
import { refreshCounts } from '@/components/shell/counts';
import {
  KDF,
  decryptJson,
  deriveKek,
  encryptJson,
  fingerprint,
  newDek,
  newRecoveryKey,
  newSalt,
  parseRecoveryKey,
  recoveryKek,
  unwrapDek,
  wrapDek,
  type Dek,
  type KdfParams,
} from '@/lib/vaultCrypto';
import {
  GEN_DEFAULT,
  emptyEntry,
  pwGen,
  pwScore,
  totpCode,
  type GenOpts,
  type VaultEntry,
} from '@/lib/vault';
import { vaultSession } from './vaultSession';
import { VaultKeysModal, type KeysMode } from './VaultKeysModal';
import './vault.css';

// Palavras-passe — ZNotes.dc.html `vlLocked` (lock screen) + `isPw` (vault),
// VaultKeys.dc.html (recovery key). Zero-knowledge: everything is decrypted
// here with a DEK that only exists in memory (vaultSession).

type Keys = {
  kdfSalt: string;
  kdfParams: KdfParams;
  dekWrappedMp: string;
  dekWrappedRk: string | null;
  rkFingerprint: string | null;
  rkCreatedAt: string | null;
  metaCt: string | null;
};
type RawItem = { id: string; ciphertext: string; version: number };
type Item = { id: string; version: number; e: VaultEntry };
type Meta = { folders: string[]; rk?: string };

const DAY = 86_400_000;
const ST = [
  'oklch(0.68 0.19 25)',
  'oklch(0.74 0.16 45)',
  'oklch(0.84 0.13 85)',
  'oklch(0.8 0.13 150)',
  'oklch(0.82 0.13 165)',
];
const PANEL = { def: 460, lim: [320, 1300] as const };
const avc = (s: string) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `oklch(0.58 0.11 ${h})`;
};
const folderOf = (e: VaultEntry) => (e.folder || '').split('/')[0]!.trim();
const hostOf = (u: string) => {
  try {
    return u ? new URL(u).hostname : '';
  } catch {
    return u;
  }
};

// Unlock throttling survives page changes (module scope), like the DEK.
let fails = 0;
let until = 0;

const Svg = ({ d, s = 14, w = 1.9, fill = 'none' }: { d: string; s?: number; w?: number; fill?: string }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth={w}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: d }}
  />
);
const I = {
  copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"></rect><path d="M5 15V6a2 2 0 0 1 2-2h9"></path>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"></path>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>',
  eyeX: '<path d="M3 3l18 18"></path><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.1 3.9"></path><path d="M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"></path><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"></path>',
  shieldOk:
    '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"></path><path d="M8.5 12l2.5 2.5 4.5-5"></path>',
  search: '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"></path>',
  x: '<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>',
  open: '<path d="M14 4h6v6"></path><path d="M20 4l-9 9"></path><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"></path>',
  regen: '<path d="M20 11a8 8 0 1 0-2.3 5.7"></path><path d="M20 4v7h-7"></path>',
  wand: '<path d="M15 4V2"></path><path d="M15 16v-2"></path><path d="M8 9h2"></path><path d="M20 9h2"></path><path d="M17.8 11.8L19 13"></path><path d="M15 9h.01"></path><path d="M17.8 6.2L19 5"></path><path d="M3 21l9-9"></path><path d="M12.2 6.2L11 5"></path>',
};

const Bars = ({ sc }: { sc: number }) => {
  const n = sc < 0 ? 0 : [1, 1, 2, 3, 4][sc]!;
  return (
    <span className="kh-pw-bars">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} style={{ background: i < n ? ST[sc] : undefined }} />
      ))}
    </span>
  );
};

// ── Lock screen ────────────────────────────────────────────────────────────
function LockScreen({
  setup,
  lockMinutes,
  onSubmit,
  onForgot,
}: {
  setup: boolean;
  lockMinutes: number;
  onSubmit: (pass: string) => Promise<string | null>;
  onForgot: () => void;
}) {
  const { t } = useI18n();
  const [pass, setPass] = useState('');
  const [conf, setConf] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const fail = (m: string) => {
    setErr(m);
    [1, 2, 3, 4, 0].forEach((v, i) => setTimeout(() => setShake(v), 70 * i));
  };
  const submit = async () => {
    if (busy) return;
    if (setup) {
      if (pass.length < 8) return fail(t('vl_short'));
      if (pass !== conf) return fail(t('vk_mismatch'));
    } else {
      if (!pass) return fail(t('vl_empty'));
      if (until > Date.now())
        return fail(t('vt_wait').replace('{n}', String(Math.ceil((until - Date.now()) / 1000))));
    }
    setBusy(true);
    const e = await onSubmit(pass).finally(() => setBusy(false));
    if (e) {
      setPass('');
      fail(e);
    }
  };
  const sc = pwScore(pass);
  const field = (v: string, set: (s: string) => void, ph: string, auto?: boolean) => (
    <div className="kh-pw-lock__in" data-err={!!err || undefined}>
      <input
        type={show ? 'text' : 'password'}
        value={v}
        placeholder={ph}
        aria-label={ph}
        autoComplete="off"
        autoFocus={auto}
        onChange={(e) => {
          set(e.target.value);
          setErr('');
        }}
        onKeyDown={(e) => e.key === 'Enter' && void submit()}
      />
      <button type="button" title={t('p_reveal')} aria-label={t('p_reveal')} onClick={() => setShow(!show)}>
        <Svg d={show ? I.eyeX : I.eye} s={17} />
      </button>
    </div>
  );
  return (
    <section className="kh-pw-lock">
      <div
        className="kh-pw-lock__card"
        style={{ transform: `translateX(${['0px', '-10px', '10px', '-6px', '6px'][shake]})` }}
      >
        <span className="kh-pw-lock__ic">
          <Svg d={I.lock} s={24} />
        </span>
        <div className="kh-pw-lock__t">{setup ? t('vl_setTitle') : t('vl_title')}</div>
        <div className="kh-pw-lock__s">{setup ? t('vl_setSub') : t('vl_sub')}</div>
        <div className="kh-pw-lock__form">
          {field(pass, setPass, t('vl_ph'), true)}
          {setup && (
            <>
              <div className="kh-pw-st">
                <Bars sc={sc} />
                <span style={{ color: sc < 0 ? undefined : ST[sc] }}>{sc < 0 ? '' : t(`p_st${sc}`)}</span>
              </div>
              {field(conf, setConf, t('vl_conf'))}
            </>
          )}
          {err && <span className="kh-pw-lock__err">{err}</span>}
          <button type="button" className="kh-pw-lock__btn" disabled={busy} onClick={() => void submit()}>
            {busy ? t('vt_opening') : setup ? t('vl_create') : t('vl_unlock')}
          </button>
        </div>
        {!setup && (
          <button type="button" className="kh-pw-lock__forgot" onClick={onForgot}>
            {t('vl_forgot')}
          </button>
        )}
        <div className="kh-pw-lock__auto">{t('vl_autoTxt').replace('{n}', String(lockMinutes))}</div>
      </div>
    </section>
  );
}

// ── Field (view mode) ──────────────────────────────────────────────────────
function Field({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="kh-pw-field">
      <div>
        <span className="kh-pw-lbl">{label}</span>
        <span className="kh-pw-val" data-mono={mono || undefined}>
          {value}
        </span>
      </div>
      {children}
    </div>
  );
}

export function VaultView() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [lockMinutes, setLockMinutes] = usePersistentState<number>('vault.lock', 1);
  const [panel, setPanel] = usePersistentState<number>('vault.panel', PANEL.def);
  const [livePanel, setLivePanel] = useState<number | null>(null);

  const [keys, setKeys] = useState<Keys | null | undefined>(undefined);
  const [raw, setRaw] = useState<RawItem[]>([]);
  const [dek, setDek] = useState<Dek | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [meta, setMeta] = useState<Meta>({ folders: [] });
  const [keysModal, setKeysModal] = useState<{ mode: KeysMode; setup?: boolean; rk?: string } | null>(null);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [active, setActive] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState('');
  const [gen, setGen] = useState<(GenOpts & { value: string }) | null>(null);
  const [folderEdit, setFolderEdit] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [drag, setDrag] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [totp, setTotp] = useState<Record<string, string>>({});

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // ── Load / unlock ─────────────────────────────────────────────────────────
  const openWith = useCallback(
    async (d: Dek, k: Keys, list: RawItem[]): Promise<string | null> => {
      try {
        const m = k.metaCt ? await decryptJson<Meta>(d, k.metaCt) : { folders: [] };
        const out: Item[] = [];
        for (const r of list)
          out.push({
            id: r.id,
            version: r.version,
            e: { ...emptyEntry(), ...(await decryptJson<VaultEntry>(d, r.ciphertext)) },
          });
        setMeta({ folders: m.folders ?? [], rk: m.rk });
        setItems(out);
        vaultSession.set(d);
        setDek(d);
        return null;
      } catch {
        return t('vt_bad');
      }
    },
    [t],
  );

  const load = useCallback(async () => {
    const r = await api<{ keys: Keys | null; items: RawItem[] }>('/vault');
    setKeys(r.keys);
    setRaw(r.items);
    return r;
  }, []);

  useEffect(() => {
    void load().then(async (r) => {
      const d = vaultSession.get(lockMinutes);
      if (d && r.keys) await openWith(d, r.keys, r.items);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitLock = async (pass: string): Promise<string | null> => {
    if (!keys) {
      // first-time setup
      try {
        const salt = newSalt();
        const [kek, d] = await Promise.all([deriveKek(pass, salt), newDek()]);
        const rk = newRecoveryKey();
        const [mp, rkw, fp] = await Promise.all([
          wrapDek(d, kek),
          recoveryKek(rk).then((k) => wrapDek(d, k)),
          fingerprint(rk),
        ]);
        await api('/vault/setup', {
          kdfSalt: salt,
          kdfParams: KDF,
          dekWrappedMp: mp,
          dekWrappedRk: rkw,
          rkFingerprint: fp,
        });
        const m: Meta = { folders: [], rk };
        await api('/vault/meta', { metaCt: await encryptJson(d, m) }, 'PUT');
        const r = await load();
        await openWith(d, r.keys!, r.items);
        setKeysModal({ mode: 'show', setup: true, rk });
        return null;
      } catch {
        return t('auth_generic');
      }
    }
    try {
      const kek = await deriveKek(pass, keys.kdfSalt, keys.kdfParams);
      const d = await unwrapDek(keys.dekWrappedMp, kek);
      fails = 0;
      return openWith(d, keys, raw);
    } catch {
      fails += 1;
      if (fails >= 5) {
        fails = 0;
        until = Date.now() + 30_000;
      }
      return t('vl_wrong');
    }
  };

  const checkPass = async (pass: string) => {
    if (!keys) return null;
    try {
      return await unwrapDek(keys.dekWrappedMp, await deriveKek(pass, keys.kdfSalt, keys.kdfParams));
    } catch {
      return null;
    }
  };
  const rewrapMaster = async (d: Dek, pass: string) => {
    const salt = newSalt();
    return { kdfSalt: salt, kdfParams: KDF, dekWrappedMp: await wrapDek(d, await deriveKek(pass, salt)) };
  };
  const saveMeta = useCallback(
    async (m: Meta) => {
      setMeta(m);
      if (dek)
        await api('/vault/meta', { metaCt: await encryptJson(dek, m) }, 'PUT').catch(() =>
          toast({ message: t('auth_generic'), tone: 'error' }),
        );
    },
    [dek, toast, t],
  );

  // ── Recovery-key actions (VaultKeys) ──────────────────────────────────────
  const onRecover = async (text: string, pass: string): Promise<string | null> => {
    const rk = parseRecoveryKey(text);
    if (!rk) return t('vk_badFmt');
    if (!keys?.dekWrappedRk) return t('vk_badKey');
    let d: Dek;
    try {
      d = await unwrapDek(keys.dekWrappedRk, await recoveryKek(rk));
    } catch {
      return t('vk_badKey');
    }
    try {
      await api('/vault/keys', { reason: 'recovered', ...(await rewrapMaster(d, pass)) }, 'PUT');
      const r = await load();
      const e = await openWith(d, r.keys!, r.items);
      if (e) return e;
      setKeysModal(null);
      toast({ message: t('vk_recovered'), tone: 'success' });
      return null;
    } catch {
      return t('auth_generic');
    }
  };
  const onChange = async (cur: string, next: string): Promise<string | null> => {
    const d = await checkPass(cur);
    if (!d) return t('vk_badCur');
    try {
      await api('/vault/keys', { reason: 'master', ...(await rewrapMaster(d, next)) }, 'PUT');
      await load();
      return null;
    } catch {
      return t('auth_generic');
    }
  };
  const onDownloadAuth = async (pass: string): Promise<string | null> => {
    if (!(await checkPass(pass))) return t('vk_badCur');
    if (!meta.rk) return t('vt_bad');
    setKeysModal({ mode: 'show', rk: meta.rk });
    return null;
  };
  const onRegenerate = async () => {
    if (!dek) return;
    try {
      const rk = newRecoveryKey();
      const [w, fp] = await Promise.all([recoveryKek(rk).then((k) => wrapDek(dek, k)), fingerprint(rk)]);
      await api('/vault/keys', { reason: 'new_key', dekWrappedRk: w, rkFingerprint: fp }, 'PUT');
      await saveMeta({ ...meta, rk });
      await load();
      setKeysModal({ mode: 'show', rk });
    } catch {
      toast({ message: t('auth_generic'), tone: 'error' });
    }
  };
  const onWipe = async () => {
    await api('/vault', undefined, 'DELETE');
    vaultSession.lock();
    setDek(null);
    setItems([]);
    setKeysModal(null);
    await load();
    refreshCounts();
  };

  // ── Item persistence ──────────────────────────────────────────────────────
  const dekRef = useRef(dek);
  dekRef.current = dek;
  const saveItem = useCallback(
    async (id: string, d: Dek) => {
      const it = itemsRef.current.find((x) => x.id === id);
      if (!it) return;
      try {
        const { item } = await api<{ item: RawItem }>(
          `/vault/items/${id}`,
          { ciphertext: await encryptJson(d, it.e), version: it.version },
          'PUT',
        );
        setItems((L) => L.map((x) => (x.id === id ? { ...x, version: item.version } : x)));
      } catch (e) {
        if (isApiFailure(e) && e.status === 409) {
          const fresh = await load();
          const cur = fresh.items.find((x) => x.id === id);
          if (cur) {
            const ce = await decryptJson<VaultEntry>(d, cur.ciphertext);
            setItems((L) =>
              L.map((x) => (x.id === id ? { id, version: cur.version, e: { ...emptyEntry(), ...ce } } : x)),
            );
          }
          toast({ message: t('vt_conflict'), tone: 'error' });
        } else toast({ message: t('auth_generic'), tone: 'error' });
      }
    },
    [load, toast, t],
  );
  const persist = useCallback(
    (id: string) => {
      const tm = timers.current.get(id);
      if (tm) clearTimeout(tm);
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id);
          if (dekRef.current) void saveItem(id, dekRef.current);
        }, 600),
      );
    },
    [saveItem],
  );
  /** Saves pending edits now (before locking or leaving the page). */
  const flush = useCallback(() => {
    const d = dekRef.current;
    const ids = [...timers.current.keys()];
    for (const [, tm] of timers.current) clearTimeout(tm);
    timers.current.clear();
    return d ? Promise.all(ids.map((id) => saveItem(id, d))) : Promise.resolve([]);
  }, [saveItem]);
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => void flushRef.current(), []);

  const lock = useCallback(async () => {
    await flush();
    vaultSession.lock();
    setDek(null);
    setItems([]);
    setMeta({ folders: [] });
    setActive(null);
    setEditing(false);
    setTotp({});
    void load();
  }, [flush, load]);

  // Auto-lock on inactivity; any input in the page counts as activity.
  useEffect(() => {
    if (!dek) return;
    const touch = () => vaultSession.touch();
    const evs = ['pointerdown', 'keydown', 'wheel'] as const;
    evs.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const iv = setInterval(() => {
      setNow(Date.now());
      if (!vaultSession.get(lockMinutes)) void lock();
    }, 1000);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, touch));
      clearInterval(iv);
    };
  }, [dek, lockMinutes, lock]);

  const patch = (id: string, p: Partial<VaultEntry>) => {
    setItems((L) => L.map((x) => (x.id === id ? { ...x, e: { ...x.e, ...p } } : x)));
    persist(id);
  };

  const create = async () => {
    if (!dek) return;
    const e: VaultEntry = {
      ...emptyEntry(),
      pass: pwGen(GEN_DEFAULT),
      folder: filter.startsWith('f:') ? filter.slice(2) : '',
    };
    try {
      const { item } = await api<{ item: RawItem }>('/vault/items', {
        ciphertext: await encryptJson(dek, e),
      });
      setItems((L) => [{ id: item.id, version: item.version, e }, ...L]);
      setActive(item.id);
      refreshCounts();
      setEditing(true);
      setReveal(true);
      setQuery('');
    } catch {
      toast({ message: t('auth_generic'), tone: 'error' });
    }
  };
  const remove = async (it: Item) => {
    const ok = await confirm({
      title: t('vt_delT'),
      body: t('vt_delB').replace('{x}', it.e.name || t('p_newName')),
      confirmLabel: t('p_delete'),
      cancelLabel: t('vk_cancel'),
      danger: true,
    });
    if (!ok) return;
    const tm = timers.current.get(it.id);
    if (tm) clearTimeout(tm);
    try {
      await api(`/vault/items/${it.id}`, undefined, 'DELETE');
    } catch {
      toast({ message: t('ui_delFail'), tone: 'error' });
      return;
    }
    setItems((L) => L.filter((x) => x.id !== it.id));
    setActive(null);
    refreshCounts();
  };

  const copy = (key: string, value: string, id?: string) => {
    if (!value) return;
    void navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? '' : c)), 1600);
        toast({ message: t('vt_copiedClear'), tone: 'success' });
        // Clear the clipboard after 30 s (only works while the tab has focus).
        setTimeout(() => void navigator.clipboard?.writeText('').catch(() => {}), 30_000);
        if (id) patch(id, { usedTs: Date.now() });
      },
      () => {},
    );
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const q = query.trim().toLowerCase();
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const x of items) if (x.e.pass) c[x.e.pass] = (c[x.e.pass] ?? 0) + 1;
    return c;
  }, [items]);
  const info = (e: VaultEntry) => {
    const sc = pwScore(e.pass);
    const days = Math.floor((now - (e.changedTs || now)) / DAY);
    return { sc, days, weak: sc >= 0 && sc <= 1, reused: (counts[e.pass] ?? 0) > 1, old: days > 90 };
  };
  const folders = useMemo(
    () =>
      [...new Set([...meta.folders, ...items.map((x) => folderOf(x.e))])]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [meta.folders, items],
  );
  const rows = items
    .filter((x) => {
      const n = info(x.e);
      const F = filter;
      const okF =
        F === 'all' ||
        (F === 'fav' && x.e.fav) ||
        (F === 'weak' && n.weak) ||
        (F === 'reused' && n.reused) ||
        (F === 'old' && n.old) ||
        (F.startsWith('f:') && folderOf(x.e) === F.slice(2));
      return (
        okF &&
        (!q || [x.e.name, x.e.user, x.e.url, x.e.folder, x.e.notes].join(' ').toLowerCase().includes(q))
      );
    })
    .sort((a, b) => Number(b.e.fav) - Number(a.e.fav) || a.e.name.localeCompare(b.e.name));
  const a = items.find((x) => x.id === active) ?? null;
  const A = a ? info(a.e) : null;
  const ageTxt = (d: number) => (d <= 0 ? t('p_today') : t('p_daysAgo').replace('{n}', String(d)));
  const fmtD = (ts: number | null) =>
    ts ? new Date(ts).toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-PT') : t('p_never');

  // TOTP for the open item (computed locally every 30 s step)
  const step = Math.floor(now / 30_000);
  const left = 30 - (Math.floor(now / 1000) % 30);
  const totpKey = a?.e.totp ? `${a.id}:${a.e.totp}:${step}` : '';
  useEffect(() => {
    if (!totpKey || totp[totpKey] || !a) return;
    void totpCode(a.e.totp, step)
      .then((c) => setTotp((m) => ({ ...m, [totpKey]: c })))
      .catch(() => {});
  }, [totpKey, totp, a, step]);
  const tc = totpKey ? (totp[totpKey] ?? '······') : '';

  // ── Folders ───────────────────────────────────────────────────────────────
  const commitFolder = () => {
    const v = folderName.trim().slice(0, 60);
    const old = folderEdit;
    setFolderEdit(null);
    setFolderName('');
    if (!v) return;
    if (old && old !== '*') {
      if (v === old) return;
      void saveMeta({ ...meta, folders: [...new Set(meta.folders.filter((f) => f !== old).concat(v))] });
      for (const x of items)
        if (folderOf(x.e) === old) patch(x.id, { folder: v + x.e.folder.slice(old.length) });
      if (filter === `f:${old}`) setFilter(`f:${v}`);
    } else {
      void saveMeta({ ...meta, folders: [...new Set([...meta.folders, v])] });
      setFilter(`f:${v}`);
    }
  };
  const delFolder = async (f: string) => {
    const n = items.filter((x) => folderOf(x.e) === f).length;
    const ok = await confirm({
      title: t('p_delFolderT'),
      body: t('p_delFolderB').replace('{x}', f).replace('{n}', String(n)),
      confirmLabel: t('p_delFolder'),
      cancelLabel: t('vk_cancel'),
      danger: true,
    });
    if (!ok) return;
    void saveMeta({ ...meta, folders: meta.folders.filter((x) => x !== f) });
    for (const x of items) if (folderOf(x.e) === f) patch(x.id, { folder: '' });
    setFilter('all');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const keysModalEl = keysModal && (
    <VaultKeysModal
      key={keysModal.mode + (keysModal.rk ?? '')}
      mode={keysModal.mode}
      setup={keysModal.setup}
      recoveryKey={keysModal.rk}
      fp={keys?.rkFingerprint ?? null}
      rkCreated={keys?.rkCreatedAt ?? null}
      lockMinutes={lockMinutes}
      onLockMinutes={setLockMinutes}
      onClose={() => setKeysModal(null)}
      onRecover={onRecover}
      onWipe={() => void onWipe()}
      onChange={onChange}
      onDownloadAuth={onDownloadAuth}
      onRegenerate={() => void onRegenerate()}
      onMode={(mode) => setKeysModal({ mode })}
    />
  );

  if (keys === undefined) return <section className="kh-pw-lock" aria-busy="true" />;
  if (!dek)
    return (
      <>
        <LockScreen
          key={keys ? 'unlock' : 'setup'}
          setup={!keys}
          lockMinutes={lockMinutes}
          onSubmit={submitLock}
          onForgot={() => setKeysModal({ mode: 'recover' })}
        />
        {keysModalEl}
      </>
    );

  const all = items.map((x) => info(x.e));
  const hc = (id: string, label: string, n: number, dot: string) => (
    <button
      key={id}
      type="button"
      className="kh-pw-hc"
      data-on={filter === id || undefined}
      onClick={() => setFilter(filter === id ? 'all' : id)}
    >
      <span>
        <span style={{ background: dot, boxShadow: `0 0 8px ${dot}` }} />
        <span>{label}</span>
      </span>
      <span>{n}</span>
    </button>
  );
  const fc = (
    id: string,
    label: React.ReactNode,
    n: number,
    extra?: Partial<React.ComponentProps<'button'>>,
  ) => (
    <button
      key={id}
      type="button"
      className="kh-pw-fc"
      data-on={filter === id || undefined}
      onClick={() => setFilter(id)}
      {...extra}
    >
      {label}
      <span>{n}</span>
    </button>
  );
  const panelW = livePanel ?? panel;

  return (
    <section className="kh-pw" style={{ position: 'relative' }}>
      <div className="kh-pw-main">
        <div className="kh-pw-head">
          <div className="kh-pw-title">
            <div>{t('nav_passwords')}</div>
            <div>
              <span style={{ color: 'oklch(0.82 0.12 150)', display: 'flex' }}>
                <Svg d={I.shieldOk} s={13} w={2} />
              </span>
              {t('vt_sub')}
            </div>
          </div>
          <label className="kh-pw-search">
            <Svg d={I.search} s={15} w={2} />
            <input value={query} placeholder={t('p_search')} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button
            type="button"
            className="kh-pw-sec"
            title={t('vt_btnT')}
            onClick={() => setKeysModal({ mode: 'menu' })}
          >
            <Svg d={keys?.rkFingerprint ? I.shieldOk : I.shield} s={16} />
            {t('vt_btn')}
          </button>
          <button
            type="button"
            className="kh-pw-round"
            title={t('vl_lockNow')}
            aria-label={t('vl_lockNow')}
            onClick={() => void lock()}
          >
            <Svg d={I.lock} s={16} />
          </button>
          <button type="button" className="kh-pw-new" onClick={() => void create()}>
            <Svg d={I.plus} s={14} />
            {t('p_new')}
          </button>
        </div>
        <div className="kh-pw-health">
          {hc('all', t('p_h_total'), items.length, 'oklch(0.82 0.12 150)')}
          {hc('weak', t('p_h_weak'), all.filter((x) => x.weak).length, 'oklch(0.72 0.17 30)')}
          {hc('reused', t('p_h_reused'), all.filter((x) => x.reused).length, 'oklch(0.84 0.13 85)')}
          {hc('old', t('p_h_old'), all.filter((x) => x.old).length, 'oklch(0.76 0.12 300)')}
        </div>
        <div className="kh-pw-folders">
          {fc('all', t('p_f_all'), items.length)}
          {fc('fav', `★ ${t('p_f_fav')}`, items.filter((x) => x.e.fav).length)}
          {folders.map((f) =>
            fc(
              `f:${f}`,
              <>
                <Svg d={I.folder} s={13} />
                {f}
              </>,
              items.filter((x) => folderOf(x.e) === f).length,
              {
                title: t('p_folderTip'),
                style: dropOn === f ? { outline: '2px solid #fbf8f5' } : undefined,
                onDoubleClick: (e) => {
                  e.preventDefault();
                  setFolderEdit(f);
                  setFolderName(f);
                },
                onDragOver: (e) => {
                  if (!drag) return;
                  e.preventDefault();
                  setDropOn(f);
                },
                onDragLeave: () => setDropOn(null),
                onDrop: (e) => {
                  e.preventDefault();
                  setDropOn(null);
                  if (drag) patch(drag, { folder: f });
                  setDrag(null);
                },
              },
            ),
          )}
          {filter.startsWith('f:') && (
            <button
              type="button"
              className="kh-pw-fdel"
              title={t('p_delFolder')}
              aria-label={t('p_delFolder')}
              onClick={() => void delFolder(filter.slice(2))}
            >
              <Svg d={I.x} s={11} w={2.6} />
            </button>
          )}
          {folderEdit !== null ? (
            <input
              className="kh-pw-fin"
              autoFocus
              value={folderName}
              maxLength={60}
              placeholder={t('p_folderPh')}
              onChange={(e) => setFolderName(e.target.value)}
              onBlur={commitFolder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitFolder();
                if (e.key === 'Escape') {
                  setFolderEdit(null);
                  setFolderName('');
                }
              }}
            />
          ) : (
            <button type="button" className="kh-pw-fnew" onClick={() => setFolderEdit('*')}>
              + {t('p_newFolder')}
            </button>
          )}
        </div>
        <div className="kh-pw-scroll">
          <div className="kh-pw-table">
            <div className="kh-pw-th">
              <span />
              <span>{t('p_name')}</span>
              <span>{t('p_user')}</span>
              <span>{t('p_url')}</span>
              <span>{t('p_strength')}</span>
              <span>{t('p_modified')}</span>
            </div>
            {rows.map((x) => {
              const n = info(x.e);
              return (
                <div
                  key={x.id}
                  className="kh-pw-tr"
                  data-on={x.id === active || undefined}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', x.id);
                    setDrag(x.id);
                  }}
                  onDragEnd={() => {
                    setDrag(null);
                    setDropOn(null);
                  }}
                  onClick={() => {
                    setActive(x.id);
                    setReveal(false);
                    setEditing(false);
                    setGen(null);
                  }}
                >
                  <span className="kh-pw-av" style={{ background: avc(x.e.name || '?') }}>
                    {(x.e.name || '?').trim()[0]!.toUpperCase()}
                  </span>
                  <div className="kh-pw-name">
                    <span>
                      <span>{x.e.name || t('p_newName')}</span>
                      {x.e.fav && <span className="kh-pw-star">★</span>}
                      {x.e.totp && <span className="kh-pw-2fa">2FA</span>}
                    </span>
                    <span>{x.e.folder}</span>
                  </div>
                  <span className="kh-pw-user">{x.e.user || '—'}</span>
                  <span className="kh-pw-host">{hostOf(x.e.url) || '—'}</span>
                  <span className="kh-pw-stcol">
                    <Bars sc={n.sc} />
                    <span style={{ color: n.sc < 0 ? undefined : ST[n.sc] }}>
                      {n.sc < 0 ? '—' : t(`p_st${n.sc}`)}
                    </span>
                  </span>
                  <span className="kh-pw-age" data-old={n.old || undefined}>
                    {ageTxt(n.days)}
                  </span>
                </div>
              );
            })}
            {rows.length === 0 && <div className="kh-pw-empty">{t('p_empty')}</div>}
          </div>
        </div>
      </div>

      {a && A && (
        <>
          <ColHandle
            style={{ right: panelW - 2 }}
            value={panelW}
            limits={PANEL.lim}
            dir={-1}
            onLive={setLivePanel}
            onDone={setPanel}
            onReset={() => setPanel(PANEL.def)}
          />
          <aside className="kh-pw-panel" style={{ width: panelW }}>
            <div className="kh-pw-ph">
              <span className="kh-pw-av kh-pw-av--lg" style={{ background: avc(a.e.name || '?') }}>
                {(a.e.name || '?').trim()[0]!.toUpperCase()}
              </span>
              <div className="kh-pw-ph__t">
                <span>{a.e.name || t('p_newName')}</span>
                <span>{a.e.folder}</span>
              </div>
              <button
                type="button"
                className="kh-pw-icon"
                title={t('x_fav')}
                aria-label={t('x_fav')}
                aria-pressed={a.e.fav}
                style={{ color: a.e.fav ? 'oklch(0.86 0.13 85)' : undefined }}
                onClick={() => patch(a.id, { fav: !a.e.fav })}
              >
                <Svg d={I.star} s={16} w={1.8} fill={a.e.fav ? 'currentColor' : 'none'} />
              </button>
              <button
                type="button"
                className="kh-pw-edit"
                data-on={editing || undefined}
                onClick={() => {
                  setEditing(!editing);
                  setGen(null);
                }}
              >
                {editing ? t('p_done') : t('p_edit')}
              </button>
              <button
                type="button"
                className="kh-pw-icon kh-pw-icon--dim"
                title={t('ui_close')}
                aria-label={t('ui_close')}
                onClick={() => setActive(null)}
              >
                <Svg d={I.x} s={12} w={2.6} />
              </button>
            </div>
            <div className="kh-pw-pb">
              {!editing ? (
                <>
                  <Field label={t('p_user')} value={a.e.user || '—'} mono>
                    <button
                      type="button"
                      className="kh-pw-icon"
                      title={t('x_copy')}
                      aria-label={`${t('x_copy')} ${t('p_user')}`}
                      onClick={() => copy(`${a.id}:user`, a.e.user)}
                    >
                      <Svg d={copied === `${a.id}:user` ? I.ok : I.copy} />
                    </button>
                  </Field>
                  <Field
                    label={t('p_pass')}
                    value={reveal ? a.e.pass : '•'.repeat(Math.min(14, a.e.pass.length || 8))}
                    mono
                  >
                    <button
                      type="button"
                      className="kh-pw-icon"
                      title={t('p_reveal')}
                      aria-label={t('p_reveal')}
                      onClick={() => setReveal(!reveal)}
                    >
                      <Svg d={reveal ? I.eyeX : I.eye} s={15} />
                    </button>
                    <button
                      type="button"
                      className="kh-pw-icon"
                      title={t('x_copy')}
                      aria-label={`${t('x_copy')} ${t('p_pass')}`}
                      onClick={() => copy(`${a.id}:pass`, a.e.pass, a.id)}
                    >
                      <Svg d={copied === `${a.id}:pass` ? I.ok : I.copy} />
                    </button>
                  </Field>
                  <div className="kh-pw-st">
                    <Bars sc={A.sc} />
                    <span style={{ color: A.sc < 0 ? undefined : ST[A.sc] }}>
                      {A.sc < 0 ? '—' : t(`p_st${A.sc}`)}
                    </span>
                  </div>
                  {(A.weak || A.reused || A.old) && (
                    <div className="kh-pw-warn">
                      {A.weak && <span>⚠ {t('p_w_weak')}</span>}
                      {A.reused && <span>⚠ {t('p_w_reused')}</span>}
                      {A.old && <span>⚠ {t('p_w_old')}</span>}
                    </div>
                  )}
                  {a.e.totp && (
                    <div className="kh-pw-totp">
                      <div
                        className="kh-pw-totp__ring"
                        style={{
                          background: `conic-gradient(oklch(0.85 0.12 160) ${Math.round((left / 30) * 100)}%, rgba(255,255,255,.14) 0)`,
                        }}
                      >
                        <div>{left}</div>
                      </div>
                      <div className="kh-pw-totp__c">
                        <span className="kh-pw-lbl">{t('p_totp')}</span>
                        <span>{tc.replace(/(\d{3})(\d{3})/, '$1 $2')}</span>
                      </div>
                      <button
                        type="button"
                        className="kh-pw-icon"
                        title={t('x_copy')}
                        aria-label={`${t('x_copy')} ${t('p_totp')}`}
                        onClick={() => copy(`${a.id}:totp`, /^\d{6}$/.test(tc) ? tc : '')}
                      >
                        <Svg d={copied === `${a.id}:totp` ? I.ok : I.copy} />
                      </button>
                    </div>
                  )}
                  <Field label={t('p_url')} value={a.e.url || '—'}>
                    {/^https?:\/\//i.test(a.e.url) && (
                      <a
                        className="kh-pw-icon"
                        href={a.e.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={t('p_open')}
                        aria-label={t('p_open')}
                      >
                        <Svg d={I.open} />
                      </a>
                    )}
                  </Field>
                  {a.e.notes && (
                    <div className="kh-pw-notes">
                      <span className="kh-pw-lbl">{t('x_notes')}</span>
                      <span>{a.e.notes}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <label className="kh-pw-in">
                    <span className="kh-pw-lbl">{t('p_name')}</span>
                    <input
                      autoFocus
                      value={a.e.name}
                      maxLength={200}
                      onChange={(e) => patch(a.id, { name: e.target.value })}
                    />
                  </label>
                  <label className="kh-pw-in">
                    <span className="kh-pw-lbl">{t('p_folder')}</span>
                    <input
                      value={a.e.folder}
                      maxLength={120}
                      list="kh-pw-folders"
                      onChange={(e) => patch(a.id, { folder: e.target.value })}
                    />
                    <datalist id="kh-pw-folders">
                      {folders.map((f) => (
                        <option key={f} value={f} />
                      ))}
                    </datalist>
                  </label>
                  <label className="kh-pw-in">
                    <span className="kh-pw-lbl">{t('p_user')}</span>
                    <input
                      value={a.e.user}
                      maxLength={300}
                      autoComplete="off"
                      data-mono
                      onChange={(e) => patch(a.id, { user: e.target.value })}
                    />
                  </label>
                  <div className="kh-pw-in">
                    <span className="kh-pw-lbl">{t('p_pass')}</span>
                    <div className="kh-pw-in__row">
                      <input
                        type={reveal ? 'text' : 'password'}
                        value={a.e.pass}
                        maxLength={500}
                        autoComplete="new-password"
                        aria-label={t('p_pass')}
                        data-mono
                        onChange={(e) => patch(a.id, { pass: e.target.value, changedTs: Date.now() })}
                      />
                      <button
                        type="button"
                        className="kh-pw-icon"
                        title={t('p_reveal')}
                        aria-label={t('p_reveal')}
                        onClick={() => setReveal(!reveal)}
                      >
                        <Svg d={reveal ? I.eyeX : I.eye} s={15} />
                      </button>
                      <button
                        type="button"
                        className="kh-pw-icon"
                        title={t('p_generate')}
                        aria-label={t('p_generate')}
                        data-on={!!gen || undefined}
                        onClick={() => setGen(gen ? null : { ...GEN_DEFAULT, value: pwGen(GEN_DEFAULT) })}
                      >
                        <Svg d={I.wand} s={15} />
                      </button>
                    </div>
                    <div className="kh-pw-st">
                      <Bars sc={A.sc} />
                      <span style={{ color: A.sc < 0 ? undefined : ST[A.sc] }}>
                        {A.sc < 0 ? '—' : t(`p_st${A.sc}`)}
                      </span>
                    </div>
                  </div>
                  {gen && (
                    <div className="kh-pw-gen">
                      <div className="kh-pw-gen__v">
                        <span>{gen.value}</span>
                        <button
                          type="button"
                          className="kh-pw-icon kh-pw-icon--lg"
                          title={t('p_regen')}
                          aria-label={t('p_regen')}
                          onClick={() => setGen({ ...gen, value: pwGen(gen) })}
                        >
                          <Svg d={I.regen} s={15} />
                        </button>
                      </div>
                      <label className="kh-pw-gen__len">
                        <span>
                          {t('p_len')} <b>{gen.len}</b>
                        </span>
                        <input
                          type="range"
                          min={8}
                          max={64}
                          value={gen.len}
                          onChange={(e) => {
                            const n = { ...gen, len: Number(e.target.value) };
                            setGen({ ...n, value: pwGen(n) });
                          }}
                        />
                      </label>
                      <div className="kh-pw-gen__opts">
                        {(['upper', 'lower', 'digits', 'symbols', 'amb'] as const).map((k) => (
                          <button
                            key={k}
                            type="button"
                            data-on={gen[k] || undefined}
                            aria-pressed={gen[k]}
                            onClick={() => {
                              const n = { ...gen, [k]: !gen[k] };
                              setGen({ ...n, value: pwGen(n) });
                            }}
                          >
                            {t(`p_o_${k}`)}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="kh-pw-gen__use"
                        onClick={() => {
                          patch(a.id, { pass: gen.value, changedTs: Date.now() });
                          setGen(null);
                          setReveal(true);
                        }}
                      >
                        {t('p_use')}
                      </button>
                    </div>
                  )}
                  <label className="kh-pw-in">
                    <span className="kh-pw-lbl">{t('p_url')}</span>
                    <input
                      value={a.e.url}
                      maxLength={2000}
                      placeholder="https://…"
                      onChange={(e) => patch(a.id, { url: e.target.value })}
                    />
                  </label>
                  <label className="kh-pw-in">
                    <span className="kh-pw-lbl">{t('p_totpKey')}</span>
                    <input
                      value={a.e.totp}
                      maxLength={200}
                      placeholder="JBSWY3DPEHPK3PXP"
                      data-mono
                      style={{ textTransform: 'uppercase' }}
                      onChange={(e) => patch(a.id, { totp: e.target.value.toUpperCase().replace(/\s/g, '') })}
                    />
                  </label>
                  <label className="kh-pw-in">
                    <span className="kh-pw-lbl">{t('x_notes')}</span>
                    <textarea
                      value={a.e.notes}
                      maxLength={20000}
                      onChange={(e) => patch(a.id, { notes: e.target.value })}
                    />
                  </label>
                </>
              )}
              <div className="kh-pw-details">
                <span>
                  <span>{t('dCreated')}</span>
                  <span>{fmtD(a.e.createdTs)}</span>
                </span>
                <span>
                  <span>{t('p_changed')}</span>
                  <span>
                    {fmtD(a.e.changedTs)} · {ageTxt(A.days)}
                  </span>
                </span>
                <span>
                  <span>{t('p_lastUsed')}</span>
                  <span>{fmtD(a.e.usedTs)}</span>
                </span>
              </div>
              <button type="button" className="kh-pw-del" onClick={() => void remove(a)}>
                {t('p_delete')}
              </button>
            </div>
          </aside>
        </>
      )}
      {keysModalEl}
    </section>
  );
}
