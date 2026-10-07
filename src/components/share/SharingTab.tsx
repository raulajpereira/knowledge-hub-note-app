'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { useShell } from '@/components/shell/ShellContext';
import { useConfirm, useToast } from '@/components/ui';
import { FolderCard } from './FolderCard';
import type { PublicLink } from './ShareLinkDialog';
import { SHARE_EVENT, shareChanged, shAv, shIni, useSharedFolders, type ShareKind } from './useSharedFolders';
import './share.css';

type Person = { email: string; name: string; folders: number; paused: boolean };

/** Definições › Partilhas (prototype Sharing, mode "settings"): folders, people, public links. */
export function SharingTab() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const { modules } = useShell();
  const { folders } = useSharedFolders();
  const own = folders.filter((f) => f.mine);
  const kinds = (['notes', 'tasks', 'artifacts'] as const).filter((k) => modules.has(k));
  const [nKind, setNKind] = useState<ShareKind>(kinds[0] ?? 'notes');
  const [nName, setNName] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [links, setLinks] = useState<PublicLink[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const fail = () => toast({ message: t('ne_saveFail'), tone: 'error' });

  const load = useCallback(() => {
    api<{ people: Person[] }>('/share/people')
      .then((r) => setPeople(r.people))
      .catch(() => {});
    api<{ links: PublicLink[] }>('/share/links')
      .then((r) => setLinks(r.links))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(SHARE_EVENT, load);
    return () => window.removeEventListener(SHARE_EVENT, load);
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      shareChanged();
    } catch {
      fail();
    }
  };
  const onNew = () => {
    const n = nName.trim();
    if (!n) return;
    void run(() => api('/share/folders', { kind: nKind, name: n.slice(0, 80) })).then(() => setNName(''));
  };
  const fmt = (d: string) => new Date(d).toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-PT');

  return (
    <div className="kh-sh-set">
      <div className="kh-sh-card">
        <div className="kh-sh-card__h">
          <div className="kh-sh-card__t">{t('sh_folders')}</div>
          <div className="kh-sh-card__s">{t('sh_foldersDesc')}</div>
        </div>
        <div className="kh-sh-new">
          <select
            className="kh-sh-input"
            value={nKind}
            aria-label={t('sh_folders')}
            onChange={(e) => setNKind(e.target.value as ShareKind)}
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {t(k === 'artifacts' ? 'sh_arts' : `sh_${k}`)}
              </option>
            ))}
          </select>
          <input
            className="kh-sh-input"
            value={nName}
            maxLength={80}
            placeholder={t('sh_folderName')}
            aria-label={t('sh_folderName')}
            onChange={(e) => setNName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onNew();
            }}
          />
          <button type="button" className="kh-sh-solid" onClick={onNew}>
            + {t('sh_create')}
          </button>
        </div>
        {own.map((f) => (
          <FolderCard key={f.id} f={f} />
        ))}
        {!own.length && <div className="kh-sh-empty">{t('sh_noFolders')}</div>}
      </div>

      <div className="kh-sh-card">
        <div className="kh-sh-card__h">
          <div className="kh-sh-card__t">{t('sh_people')}</div>
          <div className="kh-sh-card__s">{t('sh_peopleDesc')}</div>
        </div>
        {people.map((p) => (
          <div key={p.email} className="kh-sh-mem kh-sh-mem--person" style={{ opacity: p.paused ? 0.55 : 1 }}>
            <span className="kh-sh-av kh-sh-av--lg" style={{ background: shAv(p.email) }} aria-hidden="true">
              {shIni(p.name)}
            </span>
            <span className="kh-sh-mem__txt">
              <span className="kh-sh-mem__n">{p.name}</span>
              <span className="kh-sh-mem__e">
                {p.email} · {p.folders}
                {t(p.folders === 1 ? 'sh_folders1' : 'sh_foldersN')}
              </span>
            </span>
            <button
              type="button"
              className="kh-sh-chip"
              data-paused={p.paused || undefined}
              onClick={() =>
                void run(() => api('/share/people', { email: p.email, paused: !p.paused }, 'PATCH'))
              }
            >
              {p.paused ? t('sh_resume') : t('sh_pause')}
            </button>
            <button
              type="button"
              className="kh-sh-danger kh-sh-danger--sm"
              onClick={async () => {
                const ok = await confirm({
                  title: t('sh_removeAll'),
                  body: t('sh_removeAllBody').replace('{name}', p.name),
                  confirmLabel: t('sh_removeAll'),
                  cancelLabel: t('sh_cancel'),
                  danger: true,
                });
                if (ok)
                  void run(() =>
                    api(`/share/people?email=${encodeURIComponent(p.email)}`, undefined, 'DELETE'),
                  );
              }}
            >
              {t('sh_removeAll')}
            </button>
          </div>
        ))}
        {!people.length && <div className="kh-sh-empty">{t('sh_noPeople')}</div>}
      </div>

      <div className="kh-sh-card">
        <div className="kh-sh-card__t">{t('sh_links')}</div>
        {links.map((l) => (
          <div key={l.id} className="kh-sh-link">
            <span className="kh-sh-link__k">{t(l.itemType === 'note' ? 'sh_note' : 'sh_art')}</span>
            <span className="kh-sh-mem__txt">
              <span className="kh-sh-mem__n">{l.title}</span>
              <span className="kh-sh-mem__e">
                {t('sh_created')} {fmt(l.createdAt)}
                {l.expiresOn ? ` · ${t('sh_exp')} ${fmt(l.expiresOn)}` : ''} · {l.views} {t('sh_views')}
                {l.hasPassword ? ` · ${t('sh_pwd').split(' (')[0]}` : ''}
              </span>
            </span>
            <button
              type="button"
              className="kh-sh-chip"
              onClick={() => {
                void navigator.clipboard?.writeText(l.url).catch(() => {});
                setCopied(l.id);
                setTimeout(() => setCopied(null), 1400);
              }}
            >
              {copied === l.id ? t('sh_copied') : t('sh_copy')}
            </button>
            <button
              type="button"
              className="kh-sh-danger kh-sh-danger--sm"
              onClick={() => void run(() => api(`/share/links/${l.id}`, undefined, 'DELETE'))}
            >
              {t('sh_revoke')}
            </button>
          </div>
        ))}
        {!links.length && <div className="kh-sh-empty">{t('sh_noLinks')}</div>}
      </div>
    </div>
  );
}
