'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { useToast } from '@/components/ui';
import { ShareDialog, ShareHead } from './ShareDialog';

export type PublicLink = {
  id: string;
  itemType: 'note' | 'artifact';
  itemId: string;
  title: string;
  url: string;
  hasPassword: boolean;
  expiresOn: string | null;
  views: number;
  createdAt: string;
};

/**
 * "Partilhar" (prototype Sharing, mode link): the public read-only link of a
 * note or artifact — on/off switch, copy, expiry date, password, views, remove.
 */
export function ShareLinkDialog({
  itemType,
  itemId,
  title,
  onClose,
  onChange,
}: {
  itemType: 'note' | 'artifact';
  itemId: string;
  title: string;
  onClose: () => void;
  onChange?: (shared: boolean) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [link, setLink] = useState<PublicLink | null | undefined>(undefined);
  const [pwd, setPwd] = useState('');
  const [copied, setCopied] = useState(false);
  const pwdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fail = () => toast({ message: t('ne_saveFail'), tone: 'error' });

  useEffect(() => {
    api<{ link: PublicLink | null }>(`/share/links?type=${itemType}&id=${itemId}`)
      .then((r) => setLink(r.link))
      .catch(() => setLink(null));
  }, [itemType, itemId]);

  const set = (l: PublicLink | null) => {
    setLink(l);
    onChange?.(!!l);
  };
  const toggle = async () => {
    try {
      if (link) {
        await api(`/share/links/${link.id}`, undefined, 'DELETE');
        set(null);
      } else {
        set((await api<{ link: PublicLink }>('/share/links', { itemType, itemId })).link);
        setPwd('');
      }
    } catch {
      fail();
    }
  };
  const patch = async (p: { expiresOn?: string | null; password?: string | null }) => {
    if (!link) return;
    try {
      set((await api<{ link: PublicLink }>(`/share/links/${link.id}`, p, 'PATCH')).link);
    } catch {
      fail();
    }
  };

  const on = !!link;
  return (
    <ShareDialog label={t('sh_shareTitle')} onClose={onClose}>
      <ShareHead title={t('sh_shareTitle')} sub={title} onClose={onClose} closeLabel={t('ui_close')} />
      <div className="kh-sh-row">
        <span className="kh-sh-row__txt">
          <span className="kh-sh-row__t">{t('sh_pubLink')}</span>
          <span className="kh-sh-row__s">{t('sh_pubDesc')}</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t('sh_pubLink')}
          disabled={link === undefined}
          className="kh-sh-switch"
          data-on={on || undefined}
          onClick={() => void toggle()}
        >
          <span />
        </button>
      </div>
      {link && (
        <div className="kh-sh-col">
          <div className="kh-sh-copy">
            <input
              readOnly
              value={link.url}
              aria-label={t('sh_pubLink')}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              data-done={copied || undefined}
              onClick={() => {
                void navigator.clipboard?.writeText(link.url).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1400);
              }}
            >
              {copied ? t('sh_copied') : t('sh_copy')}
            </button>
          </div>
          <div className="kh-sh-grid2">
            <label>
              <span>{t('sh_expires')}</span>
              <input
                type="date"
                value={link.expiresOn ?? ''}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => void patch({ expiresOn: e.target.value || null })}
              />
            </label>
            <label>
              <span>{t('sh_pwd')}</span>
              <input
                type="text"
                autoComplete="off"
                value={pwd}
                maxLength={200}
                placeholder={link.hasPassword ? '••••••••' : t('sh_pwdPh')}
                onChange={(e) => {
                  const v = e.target.value;
                  setPwd(v);
                  clearTimeout(pwdTimer.current);
                  // the password is never sent back: typing sets a new one, emptying keeps the current one
                  if (v) pwdTimer.current = setTimeout(() => void patch({ password: v }), 600);
                }}
              />
            </label>
          </div>
          <div className="kh-sh-foot">
            <span className="kh-sh-views">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <b>{link.views}</b> {t('sh_views')}
            </span>
            <span className="kh-sh-ro">· {t('sh_readOnly')}</span>
            {link.hasPassword && (
              <button type="button" className="kh-sh-ghost" onClick={() => void patch({ password: null })}>
                {t('sh_pwd').split(' (')[0]} ×
              </button>
            )}
            <button type="button" className="kh-sh-danger" onClick={() => void toggle()}>
              {t('sh_revoke')}
            </button>
          </div>
        </div>
      )}
    </ShareDialog>
  );
}
