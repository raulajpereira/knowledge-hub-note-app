'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { api, type ApiFailure } from '@/lib/client/api';
import { useConfirm, useToast } from '@/components/ui';
import { shareChanged, shAv, shIni, type Member, type SharedFolder } from './useSharedFolders';

const FOLDER_ICON = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

const KIND_LABEL = { notes: 'sh_notes', tasks: 'sh_tasks', artifacts: 'sh_arts' } as const;
const EMAIL = /^\S+@\S+\.\S+$/;

export function membersLabel(t: (k: string) => string, n: number, none = 'sh_members0') {
  return n ? `${n}${t(n === 1 ? 'sh_members1' : 'sh_membersN')}` : t(none);
}

/**
 * One shared folder of the prototype Sharing (dialog "folder" and Definições ›
 * Partilhas): pause/delete the folder, members with permission, pause and
 * remove, and the email field with suggestions and the invite prompt.
 */
export function FolderCard({ f, onDeleted }: { f: SharedFolder; onDeleted?: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [ask, setAsk] = useState<string | null>(null);
  const [sugg, setSugg] = useState<Array<{ name: string; email: string }>>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fail = (e?: unknown) => {
    const code = (e as ApiFailure | undefined)?.code;
    toast({
      message:
        code === 'share_self'
          ? t('sh_errSelf')
          : code === 'too_many_requests'
            ? t('sh_errRate')
            : t('ne_saveFail'),
      tone: 'error',
    });
  };
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      shareChanged();
    } catch (e) {
      fail(e);
    }
  };

  const term = q.trim().toLowerCase();
  useEffect(() => {
    clearTimeout(timer.current);
    if (term.length < 2) {
      setSugg([]);
      return;
    }
    timer.current = setTimeout(() => {
      api<{ people: Array<{ name: string; email: string }> }>(`/share/suggest?q=${encodeURIComponent(term)}`)
        .then((r) => setSugg(r.people.filter((p) => !f.members.some((m) => m.email === p.email)).slice(0, 4)))
        .catch(() => setSugg([]));
    }, 220);
    return () => clearTimeout(timer.current);
  }, [term, f.members]);

  const add = async (email: string, invite = false) => {
    if (!EMAIL.test(email) || busy) return;
    setBusy(true);
    try {
      const r = await api<{ status: string }>(`/share/folders/${f.id}/members`, { email, invite });
      if (r.status === 'needs_invite') setAsk(email);
      else {
        setQ('');
        setAsk(null);
        setSugg([]);
        shareChanged();
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    const ok = await confirm({
      title: t('sh_delete'),
      body: t('sh_deleteBody').replace('{name}', f.name),
      confirmLabel: t('sh_delete'),
      cancelLabel: t('sh_cancel'),
      danger: true,
    });
    if (!ok) return;
    await run(() => api(`/share/folders/${f.id}`, undefined, 'DELETE'));
    onDeleted?.();
  };

  return (
    <div className="kh-sh-fc" data-folder={f.id}>
      <div className="kh-sh-fc__head">
        <span className="kh-sh-fc__ic">{FOLDER_ICON}</span>
        <span className="kh-sh-fc__txt">
          <span className="kh-sh-fc__name">{f.name}</span>
          <span className="kh-sh-fc__sub">
            {t(KIND_LABEL[f.kind])} · {membersLabel(t, f.members.length)}
          </span>
        </span>
        <button
          type="button"
          className="kh-sh-chip"
          data-paused={f.paused || undefined}
          onClick={() => void run(() => api(`/share/folders/${f.id}`, { paused: !f.paused }, 'PATCH'))}
        >
          {f.paused ? t('sh_resume') : t('sh_pause')}
        </button>
        <button
          type="button"
          className="kh-sh-fc__del"
          title={t('sh_delete')}
          aria-label={t('sh_delete')}
          onClick={() => void del()}
        >
          ×
        </button>
      </div>
      {f.members.map((m) => (
        <MemberRow key={m.id} m={m} folderPaused={f.paused} run={run} />
      ))}
      <div className="kh-sh-fc__add">
        <div className="kh-sh-fc__row">
          <input
            type="email"
            value={q}
            placeholder={t('sh_emailPh')}
            aria-label={t('sh_emailPh')}
            maxLength={254}
            onChange={(e) => {
              setQ(e.target.value);
              setAsk(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add(term);
            }}
          />
          <button type="button" className="kh-sh-solid" disabled={busy} onClick={() => void add(term)}>
            {t('sh_share')}
          </button>
        </div>
        {sugg.map((u) => (
          <button key={u.email} type="button" className="kh-sh-sugg" onClick={() => void add(u.email)}>
            <span className="kh-sh-sugg__n">{u.name}</span>
            <span className="kh-sh-sugg__e">{u.email}</span>
          </button>
        ))}
        {ask && (
          <div className="kh-sh-ask" role="alert">
            <span>
              {ask}
              {t('sh_noUser')}
            </span>
            <button type="button" className="kh-sh-solid kh-sh-solid--sm" onClick={() => void add(ask, true)}>
              {t('sh_sendInvite')}
            </button>
            <button type="button" className="kh-sh-ghost kh-sh-ghost--sm" onClick={() => setAsk(null)}>
              {t('sh_cancel')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MemberRow({
  m,
  folderPaused,
  run,
}: {
  m: Member;
  folderPaused: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const { t } = useI18n();
  const ps = m.paused || m.personPaused || folderPaused;
  const st = m.status === 'invited' ? 'invited' : ps ? 'paused' : 'active';
  return (
    <div className="kh-sh-mem" style={{ opacity: ps ? 0.55 : 1 }}>
      <span className="kh-sh-av" style={{ background: shAv(m.email) }} aria-hidden="true">
        {shIni(m.name)}
      </span>
      <span className="kh-sh-mem__txt">
        <span className="kh-sh-mem__n">{m.name}</span>
        <span className="kh-sh-mem__e">
          {m.email} · <span data-st={st}>{t(`sh_${st}`)}</span>
        </span>
      </span>
      <select
        className="kh-sh-sel"
        value={m.perm}
        aria-label={`${m.name} · ${t('sh_read')}/${t('sh_edit')}`}
        onChange={(e) => void run(() => api(`/share/members/${m.id}`, { perm: e.target.value }, 'PATCH'))}
      >
        <option value="read">{t('sh_read')}</option>
        <option value="edit">{t('sh_edit')}</option>
      </select>
      <button
        type="button"
        className="kh-sh-ghost kh-sh-ghost--sm"
        onClick={() => void run(() => api(`/share/members/${m.id}`, { paused: !m.paused }, 'PATCH'))}
      >
        {m.paused ? t('sh_resume') : t('sh_pause')}
      </button>
      <button
        type="button"
        className="kh-sh-mem__del"
        title={t('sh_remove')}
        aria-label={`${t('sh_remove')} ${m.email}`}
        onClick={() => void run(() => api(`/share/members/${m.id}`, undefined, 'DELETE'))}
      >
        ×
      </button>
    </div>
  );
}
