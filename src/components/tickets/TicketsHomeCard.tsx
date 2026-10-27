'use client';

import Link from 'next/link';
import { useI18n } from '@/i18n/client';
import { fmtDue, localDay } from '@/lib/tasks';
import { PRIORITY_COLOR, PRIORITY_RANK, type TicketPriority, type TicketStatus } from '@/lib/tickets';
import { PRIORITIES, prioLabel, statusLabel } from './ticketUi';
import './tickets.css';

export type HomeTicket = {
  id: string;
  number: string;
  summary: string;
  priority: TicketPriority;
  status: TicketStatus;
  dueOn: string | null;
  clientName: string;
};

/**
 * Início › "Tickets abertos": the open tickets (not Resolvido / Fechado /
 * Cancelado) counted by priority, and the first few by priority and due date.
 */
export function TicketsHomeCard({ items, max = 5 }: { items: HomeTicket[]; max?: number }) {
  const { t } = useI18n();
  if (!items.length) return <div className="kh-card__empty">{t('home_noItems')}</div>;
  const today = localDay(new Date());
  const top = items
    .slice()
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999'),
    )
    .slice(0, max);
  return (
    <>
      <div className="kh-tkt-hprio" role="list" aria-label={t('tk_byPrio')}>
        {PRIORITIES.map((p) => {
          const n = items.filter((x) => x.priority === p).length;
          return (
            <div
              key={p}
              role="listitem"
              className="kh-tkt-hprio__t"
              data-zero={!n || undefined}
              style={{ borderColor: n ? PRIORITY_COLOR[p].replace(')', ' / .5)') : undefined }}
              title={prioLabel(t, p)}
            >
              <span className="kh-tkt-hprio__n">{n}</span>
              <span className="kh-tkt-hprio__l">
                <span style={{ background: PRIORITY_COLOR[p] }} />
                {prioLabel(t, p)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="kh-hlist">
        {top.map((x) => {
          const late = !!x.dueOn && x.dueOn < today;
          return (
            <Link key={x.id} href={`/app/tickets?k=${x.id}`} className="kh-hrow" scroll={false}>
              <span
                className="kh-hdot"
                style={{
                  background: PRIORITY_COLOR[x.priority],
                  boxShadow: `0 0 8px ${PRIORITY_COLOR[x.priority]}`,
                }}
              />
              <span className="kh-tkt-no kh-tkt-hno">{x.number}</span>
              <span className="kh-hrow__t" style={{ flex: 1 }}>
                {x.summary}
              </span>
              {x.dueOn ? (
                <span className="kh-tkt-due" data-late={late || undefined}>
                  {fmtDue(x.dueOn)}
                </span>
              ) : (
                <span className="kh-hrow__s">{statusLabel(t, x.status)}</span>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}
