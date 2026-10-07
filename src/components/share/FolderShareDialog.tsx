'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { useToast } from '@/components/ui';
import { ShareDialog, ShareHead } from './ShareDialog';
import { FolderCard, membersLabel } from './FolderCard';
import { shareChanged, useSharedFolders, type ShareKind } from './useSharedFolders';

/**
 * Prototype Sharing, mode "folder": "Partilhar pasta" of one of the caller's
 * folders (`folderId`: shared at once, like the prototype's mount), of an
 * existing shared folder (`sharedId`), or "Nova pasta partilhada" (neither: a
 * name step first).
 */
export function FolderShareDialog({
  kind,
  folderId,
  sharedId,
  title,
  onClose,
  onCreated,
}: {
  kind: ShareKind;
  folderId?: string;
  sharedId?: string;
  title?: string;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const { folders } = useSharedFolders(kind);
  const [id, setId] = useState<string | null>(sharedId ?? null);
  const [name, setName] = useState('');
  const started = useRef(false);
  const fail = () => toast({ message: t('ne_saveFail'), tone: 'error' });

  const create = async (n: string, fid?: string) => {
    try {
      const r = await api<{ id: string }>('/share/folders', {
        kind,
        name: n.slice(0, 80),
        folderId: fid ?? null,
      });
      setId(r.id);
      shareChanged();
      onCreated?.(r.id);
    } catch {
      fail();
    }
  };
  useEffect(() => {
    if (folderId && !sharedId && !started.current) {
      started.current = true;
      void create(title || t('sh_folderName'), folderId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, sharedId]);

  const f = folders.find((x) => x.id === id && x.mine);
  const needName = !id && !folderId;
  const mk = () => {
    const n = name.trim() || title || '';
    if (n) void create(n);
  };
  return (
    <ShareDialog label={f ? t('sh_fpTitle') : t('sh_fpNew')} onClose={onClose} width={560}>
      <ShareHead
        title={id || folderId ? t('sh_fpTitle') : t('sh_fpNew')}
        sub={
          f
            ? `${f.name} · ${membersLabel(t, f.members.length, 'sh_fpNoMem')}`
            : needName
              ? t('sh_fpNewSub')
              : ''
        }
        onClose={onClose}
        closeLabel={t('ui_close')}
      />
      {needName && (
        <div className="kh-sh-fc__row">
          <input
            className="kh-sh-input"
            value={name}
            autoFocus
            maxLength={80}
            placeholder={t('sh_fpNamePh')}
            aria-label={t('sh_fpNamePh')}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') mk();
            }}
          />
          <button type="button" className="kh-sh-solid" onClick={mk}>
            {t('sh_fpCreate')}
          </button>
        </div>
      )}
      {f && <FolderCard f={f} onDeleted={onClose} />}
      <div className="kh-sh-end">
        <button type="button" className="kh-sh-solid" onClick={onClose}>
          {t('sh_fpDone')}
        </button>
      </div>
    </ShareDialog>
  );
}
