'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Popover } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { fmtDue } from '@/lib/tasks';
import { Icon } from './icons';
import './notify.css';

// The header bell: unread count, and a popover with the notifications
// (newest first). Polls every 60 s and when the window gets focus.

type Item = {
  id: string;
  kind: string;
  itemType: string;
  itemId: string | null;
  title: string;
  meta: Record<string, string>;
  createdAt: string;
  readAt: string | null;
};

const POLL_MS = 60_000;
const HREF: Record<string, string> = {
  task: '/app/tasks?t=',
  issue: '/app/issues?i=',
  meeting: '/app/meetings?m=',
  note: '/app/notes?n=',
};
const hrefOf = (n: Item) =>
  n.itemType === 'share'
    ? '/app/settings?tab=share'
    : HREF[n.itemType]
      ? `${HREF[n.itemType]}${n.itemId}`
      : null;

// small line icons per kind (stroke = currentColor)
const KIND_ICON: Record<string, string> = {
  task: '<rect x="4" y="4" width="16" height="16" rx="4"></rect><path d="M8.5 12.5l2.5 2.5 4.5-5"></path>',
  overdue:
    '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12"></path><path d="M12 15.8v.2"></path>',
  reminder:
    '<circle cx="12" cy="13" r="7"></circle><path d="M12 9.5V13l2.5 1.5"></path><path d="M5 4.5L3 6.5"></path><path d="M19 4.5l2 2"></path>',
  meeting:
    '<rect x="3.5" y="5" width="17" height="15" rx="3"></rect><path d="M3.5 10h17"></path><path d="M8 3v4"></path><path d="M16 3v4"></path>',
  share:
    '<circle cx="18" cy="5" r="2.5"></circle><circle cx="6" cy="12" r="2.5"></circle><circle cx="18" cy="19" r="2.5"></circle><path d="M8.2 10.8l7.6-4.4"></path><path d="M8.2 13.2l7.6 4.4"></path>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="M3.5 7l8.5 6 8.5-6"></path>',
};
const ICON_OF: Record<string, [string, string]> = {
  task_due: ['task', 'oklch(0.8 0.13 245)'],
  issue_due: ['task', 'oklch(0.78 0.14 305)'],
  task_overdue: ['overdue', 'oklch(0.75 0.17 30)'],
  issue_overdue: ['overdue', 'oklch(0.75 0.17 30)'],
  task_reminder: ['reminder', 'oklch(0.86 0.14 85)'],
  meeting: ['meeting', 'oklch(0.8 0.14 160)'],
  share_invite: ['share', 'oklch(0.8 0.12 200)'],
  share_accepted: ['share', 'oklch(0.8 0.14 150)'],
  inbound_note: ['mail', 'oklch(0.8 0.12 260)'],
  inbound_task: ['mail', 'oklch(0.8 0.12 260)'],
};

function useAgo() {
  const { t, lang } = useI18n();
  return useCallback(
    (iso: string) => {
      const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
      if (s < 60) return t('nt_now');
      const rtf = new Intl.RelativeTimeFormat(lang === 'en' ? 'en' : 'pt-PT', { numeric: 'auto' });
      if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute');
      if (s < 86_400) return rtf.format(-Math.floor(s / 3600), 'hour');
      if (s < 7 * 86_400) return rtf.format(-Math.floor(s / 86_400), 'day');
      return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-PT');
    },
    [t, lang],
  );
}

export function NotificationBell() {
  const { t } = useI18n();
  const router = useRouter();
  const ago = useAgo();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const paged = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ notifications: Item[]; unreadCount: number; hasMore: boolean }>('/notifications');
      setItems((cur) => {
        // keep the older pages already loaded
        if (!cur) return r.notifications;
        const ids = new Set(r.notifications.map((x) => x.id));
        const lastNew = r.notifications.at(-1)?.createdAt ?? '';
        return [...r.notifications, ...cur.filter((x) => !ids.has(x.id) && x.createdAt < lastNew)];
      });
      setUnread(r.unreadCount);
      // once older pages are loaded, "Ver mais" follows those pages instead
      if (!paged.current) setHasMore(r.hasMore);
    } catch {
      // offline or signed out: try again on the next tick
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    const focus = () => void load();
    window.addEventListener('focus', focus);
    // days and reminder times follow the browser's time zone
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    api<{ settings: { tz: string } }>('/notifications/settings')
      .then((r) => {
        if (tz && r.settings.tz !== tz) return api('/notifications/settings', { tz }, 'PUT');
      })
      .catch(() => {});
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', focus);
    };
  }, [load]);

  const more = async () => {
    const last = items?.at(-1);
    if (!last) return;
    const r = await api<{ notifications: Item[]; hasMore: boolean }>(
      `/notifications?before=${encodeURIComponent(last.createdAt)}`,
    ).catch(() => null);
    if (!r) return;
    paged.current = true;
    setItems((cur) => [...(cur ?? []), ...r.notifications.filter((x) => !cur?.some((c) => c.id === x.id))]);
    setHasMore(r.hasMore);
  };

  const markRead = async (body: { ids: string[] } | { all: true }) => {
    const now = new Date().toISOString();
    setItems(
      (cur) =>
        cur?.map((x) =>
          ('all' in body || body.ids.includes(x.id)) && !x.readAt ? { ...x, readAt: now } : x,
        ) ?? null,
    );
    const r = await api<{ unreadCount: number }>('/notifications/read', body).catch(() => null);
    if (r) setUnread(r.unreadCount);
  };

  const openItem = (n: Item) => {
    if (!n.readAt) void markRead({ ids: [n.id] });
    const href = hrefOf(n);
    setOpen(false);
    if (n.itemType === 'share') window.dispatchEvent(new CustomEvent('kh:settings-tab', { detail: 'share' }));
    if (href) router.push(href);
  };

  const label = (n: Item) => {
    const m = n.meta ?? {};
    switch (n.kind) {
      case 'task_due':
        return t('nt_taskDue');
      case 'task_overdue':
        return t('nt_taskOverdue').replace('{d}', fmtDue(m.due ?? ''));
      case 'issue_due':
        return t('nt_issueDue');
      case 'issue_overdue':
        return t('nt_issueOverdue').replace('{d}', fmtDue(m.due ?? ''));
      case 'task_reminder':
        return t('nt_reminder');
      case 'meeting':
        return m.start ? t('nt_meetingAt').replace('{s}', m.start) : t('nt_meetingToday');
      case 'share_invite':
        return t('nt_shareInvite').replace('{who}', m.who ?? '');
      case 'share_accepted':
        return t('nt_shareAccepted').replace('{who}', m.who ?? '');
      case 'inbound_note':
        return t('nt_inboundNote');
      case 'inbound_task':
        return t('nt_inboundTask');
      default:
        return '';
    }
  };

  const badge = unread > 9 ? '9+' : String(unread);
  return (
    <>
      <button
        ref={btn}
        type="button"
        title={t('shell_notifications')}
        aria-label={unread ? `${t('shell_notifications')} (${unread})` : t('shell_notifications')}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="kh-hdr__btn kh-hdr__glass"
        data-on={open}
        data-testid="notify-bell"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
      >
        <Icon name="bell" />
        {unread > 0 && (
          <span className="kh-hdr__badge" data-testid="notify-count">
            {badge}
          </span>
        )}
      </button>
      {open && (
        <Popover
          anchor={btn}
          onClose={() => setOpen(false)}
          width={380}
          maxHeight={560}
          className="kh-ntf"
          role="dialog"
          aria-label={t('shell_notifications')}
        >
          <div className="kh-ntf__head">
            <span className="kh-ntf__title">{t('shell_notifications')}</span>
            <button
              type="button"
              className="kh-ntf__link"
              disabled={!unread}
              onClick={() => void markRead({ all: true })}
            >
              {t('nt_markAll')}
            </button>
          </div>
          <div className="kh-ntf__list" role="list">
            {items === null ? (
              <div className="kh-ntf__empty">…</div>
            ) : items.length === 0 ? (
              <div className="kh-ntf__empty">
                <Icon name="bell" size={26} />
                <span>{t('nt_empty')}</span>
              </div>
            ) : (
              items.map((n) => {
                const [ic, color] = ICON_OF[n.kind] ?? ['task', 'rgb(var(--w) / .7)'];
                return (
                  <button
                    key={n.id}
                    type="button"
                    role="listitem"
                    className="kh-ntf__item"
                    data-unread={!n.readAt || undefined}
                    onClick={() => openItem(n)}
                  >
                    <span className="kh-ntf__ic" style={{ color }}>
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        dangerouslySetInnerHTML={{ __html: KIND_ICON[ic]! }}
                      />
                    </span>
                    <span className="kh-ntf__txt">
                      <span className="kh-ntf__kind">{label(n)}</span>
                      <span className="kh-ntf__name">{n.title}</span>
                      <span className="kh-ntf__when">{ago(n.createdAt)}</span>
                    </span>
                    {!n.readAt && <span className="kh-ntf__dot" aria-label={t('nt_unread')} />}
                  </button>
                );
              })
            )}
            {hasMore && items && items.length > 0 && (
              <button type="button" className="kh-ntf__more" onClick={() => void more()}>
                {t('nt_showMore')}
              </button>
            )}
          </div>
          <div className="kh-ntf__foot">
            <Link
              href="/app/settings?tab=notify"
              className="kh-ntf__link"
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new CustomEvent('kh:settings-tab', { detail: 'notify' }));
              }}
            >
              {t('nt_settings')}
            </Link>
          </div>
        </Popover>
      )}
    </>
  );
}
