'use client';

import Link from 'next/link';
import { Fragment } from 'react';
import { useI18n } from '@/i18n/client';
import { NavIcon } from '@/components/shell/icons';
import { matchRanges } from '@/lib/search/fold';
import { searchHref, type SearchGroup, type SearchItem } from '@/lib/search/global';
import './search.css';

// Results of the global search, grouped by module (icon, name, count): the
// header dropdown and the results page draw the same rows. The words typed
// are highlighted in the title and the excerpt, accents or not.

/** `text` with the parts matching `terms` in <mark>. */
export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const t = text.normalize('NFC');
  const r = matchRanges(t, terms);
  if (!r.length) return <>{t}</>;
  const out: React.ReactNode[] = [];
  let at = 0;
  r.forEach(([a, b], i) => {
    if (a > at) out.push(<Fragment key={`t${i}`}>{t.slice(at, a)}</Fragment>);
    out.push(
      <mark key={`m${i}`} className="kh-gs__hl">
        {t.slice(a, b)}
      </mark>,
    );
    at = b;
  });
  if (at < t.length) out.push(<Fragment key="end">{t.slice(at)}</Fragment>);
  return <>{out}</>;
}

export function useGroupLabel() {
  const { t } = useI18n();
  return (g: Pick<SearchGroup, 'module' | 'type'>) => {
    const k = `nav_${g.module}`;
    const l = t(k);
    return l === k ? g.type : l;
  };
}

/** One result row (a link to the item). */
export function ResultRow({
  type,
  item,
  terms,
  id,
  active,
  onPick,
  onHover,
  date,
}: {
  type: string;
  item: SearchItem;
  terms: string[];
  id?: string;
  active?: boolean;
  onPick?: () => void;
  onHover?: () => void;
  date?: string;
}) {
  const href = searchHref(type, item.id);
  const body = (
    <>
      <span className="kh-gs__txt">
        <span className="kh-gs__title">
          <Highlight text={item.title} terms={terms} />
        </span>
        {item.snippet && (
          <span className="kh-gs__snip">
            <Highlight text={item.snippet} terms={terms} />
          </span>
        )}
      </span>
      {date && <span className="kh-gs__date">{date}</span>}
    </>
  );
  if (!href)
    return (
      <div
        id={id}
        role="option"
        aria-selected={!!active}
        className="kh-gs__row"
        data-active={active || undefined}
      >
        {body}
      </div>
    );
  return (
    <Link
      id={id}
      href={href}
      role="option"
      aria-selected={!!active}
      className="kh-gs__row"
      data-active={active || undefined}
      tabIndex={-1}
      scroll={false}
      onClick={onPick}
      onMouseMove={onHover}
    >
      {body}
    </Link>
  );
}

/** Group heading: module icon, name and how many items match. */
export function GroupHead({ group, action }: { group: SearchGroup; action?: React.ReactNode }) {
  const label = useGroupLabel();
  return (
    <div className="kh-gs__ghead">
      <span className="kh-gs__gic" aria-hidden="true">
        <NavIcon id={group.module} size={15} />
      </span>
      <span className="kh-gs__gname">{label(group)}</span>
      <span className="kh-gs__gcount">{group.count}</span>
      {action}
    </div>
  );
}
