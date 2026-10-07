'use client';

import { useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { Icon } from '@/components/shell/icons';
import { ShellContext } from '@/components/shell/ShellContext';
import { useWhen } from './useWhen';
import './content.css';

// "Ligações" (prototype cx_*): links between notes, tasks… shared by the
// notes inspector and the task detail. Dots/kinds per type as in the prototype.
// With `transports`, a second card "Ordens de Transporte" (cr_*) links SAP
// transport requests, with their stage as a badge.

export type ItemType = 'note' | 'task' | 'voice' | 'issue' | 'artifact' | 'code' | 'transport';
type Stage = 'mod' | 'rel' | 'qas' | 'prd' | 'junk';
type Link = { type: ItemType; id: string; title: string; sub?: string; stage?: Stage };
type Candidate = Link & { sub: string; at: string };

export const ITEM_DOT: Record<ItemType, string> = {
  note: 'oklch(0.86 0.1 85)',
  task: 'oklch(0.8 0.13 30)',
  voice: 'oklch(0.76 0.12 300)',
  issue: 'oklch(0.78 0.11 240)',
  artifact: 'oklch(0.8 0.1 160)',
  code: 'oklch(0.84 0.1 245)',
  transport: 'oklch(0.82 0.11 210)',
};
const ITEM_KIND: Record<ItemType, string> = {
  note: 'k_note',
  task: 'k_task',
  voice: 'k_voice',
  issue: 'k_issue',
  artifact: 'k_art',
  code: 'k_code',
  transport: 'k_tr',
};
/** Prototype trStage: badge text and colour. */
const STAGE: Record<Stage, [string, string]> = {
  mod: ['cr_mod', 'oklch(0.58 0.1 210 / .7)'],
  rel: ['cr_rel', 'oklch(0.58 0.12 300 / .7)'],
  qas: ['QAS', 'oklch(0.68 0.12 75 / .7)'],
  prd: ['PRD', 'oklch(0.62 0.13 150 / .7)'],
  junk: ['cr_junk', 'oklch(0.55 0.15 28 / .7)'],
};
export const itemHref = (type: ItemType, id: string) =>
  ({
    task: `/app/tasks?t=${id}`,
    voice: `/app/voice?v=${id}`,
    issue: `/app/issues?i=${id}`,
    artifact: `/app/artifacts?a=${id}`,
    code: `/app/codelib?o=${id}`,
    transport: `/app/transports?o=${id}`,
    note: `/app/notes?n=${id}`,
  })[type];

export function Connections({
  type,
  id,
  variant = 'card',
  placeholder,
  transports = false,
}: {
  type: ItemType;
  id: string;
  /** card: own glass card (notes inspector) · section: divider above (task detail) · box: card inside a panel */
  variant?: 'card' | 'section' | 'box';
  placeholder?: string;
  /** Also show "Ordens de Transporte" (when the plan has the transports module). */
  transports?: boolean;
}) {
  const shell = useContext(ShellContext);
  const [links, setLinks] = useState<Link[]>([]);
  const self = { type, id };

  useEffect(() => {
    let live = true;
    api<{ links: Link[] }>(`/links?type=${type}&id=${id}`)
      .then((r) => live && setLinks(r.links))
      .catch(() => live && setLinks([]));
    return () => {
      live = false;
    };
  }, [type, id]);

  const add = async (c: Candidate) => {
    await api('/links', { a: self, b: { type: c.type, id: c.id } }).catch(() => {});
    setLinks((l) => [...l, { type: c.type, id: c.id, title: c.title, sub: c.sub, stage: c.stage }]);
  };
  const remove = async (l: Link) => {
    await api('/links', { a: self, b: { type: l.type, id: l.id } }, 'DELETE').catch(() => {});
    setLinks((x) => x.filter((y) => !(y.type === l.type && y.id === l.id)));
  };
  const showTr = transports && !!shell?.modules.has('transports');
  const box = (tr: boolean) => (
    <LinkBox
      key={tr ? 'cr' : 'cx'}
      tr={tr}
      self={self}
      variant={variant}
      placeholder={tr ? undefined : placeholder}
      links={links.filter((l) => (l.type === 'transport') === tr)}
      onAdd={add}
      onRemove={remove}
    />
  );
  return showTr ? (
    <>
      {box(false)}
      {box(true)}
    </>
  ) : (
    box(false)
  );
}

function LinkBox({
  tr,
  self,
  variant,
  placeholder,
  links,
  onAdd,
  onRemove,
}: {
  tr: boolean;
  self: { type: ItemType; id: string };
  variant: 'card' | 'section' | 'box';
  placeholder?: string;
  links: Link[];
  onAdd: (c: Candidate) => Promise<void>;
  onRemove: (l: Link) => Promise<void>;
}) {
  const { t } = useI18n();
  const when = useWhen();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const [results, setResults] = useState<Candidate[]>([]);
  const { type, id } = self;

  useEffect(() => {
    if (!focus) return;
    let live = true;
    const h = setTimeout(() => {
      api<{ items: Candidate[] }>(
        `/links/candidates?type=${type}&id=${id}&q=${encodeURIComponent(q.trim())}${tr ? '&kind=tr' : ''}`,
      )
        .then(
          (r) =>
            live && setResults(r.items.filter((c) => !links.some((l) => l.type === c.type && l.id === c.id))),
        )
        .catch(() => live && setResults([]));
    }, 180);
    return () => {
      live = false;
      clearTimeout(h);
    };
  }, [focus, q, type, id, links, tr]);

  const open = (l: Link) => router.push(itemHref(l.type, l.id));
  const stage = (s: Stage) => {
    const [k, bg] = STAGE[s];
    return { label: k.startsWith('cr_') ? t(k) : k, bg };
  };
  const mono = (l: Link) => (l.type === 'transport' ? 'kh-cx--mono' : '');
  const label = tr ? t('cr_title') : t('cx_title');
  const ph = placeholder ?? (tr ? t('cr_ph') : t('cx_ph'));

  return (
    <div className={`kh-cx kh-cx--${variant}`} role="group" aria-label={label}>
      <div className="kh-cx__cap">
        {tr ? (
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
            <path d="M3 7h13l-3-3" />
            <path d="M21 17H8l3 3" />
          </svg>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
            <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
          </svg>
        )}
        {label}
        <span className="kh-cx__n">{links.length || ''}</span>
      </div>
      {links.length === 0 && <div className="kh-cx__empty">{tr ? t('cr_empty') : t('cx_empty')}</div>}
      {links.length > 0 && (
        <div className="kh-cx__links">
          {links.map((l) => (
            <div key={`${l.type}:${l.id}`} className="kh-cx__link">
              <span
                className="kh-cx__dot"
                style={{ background: ITEM_DOT[l.type], boxShadow: `0 0 8px ${ITEM_DOT[l.type]}` }}
              />
              <span className="kh-cx__k">{t(ITEM_KIND[l.type])}</span>
              <span
                className={`kh-cx__t ${mono(l)}`}
                role="link"
                tabIndex={0}
                title={l.sub || l.title}
                onClick={() => open(l)}
                onKeyDown={(e) => e.key === 'Enter' && open(l)}
              >
                {l.title || t('ne_untitled')}
              </span>
              {l.stage && (
                <span className="kh-cx__badge" style={{ background: stage(l.stage).bg }}>
                  {stage(l.stage).label}
                </span>
              )}
              <button
                type="button"
                title={t('cx_unlink')}
                aria-label={t('cx_unlink')}
                onClick={() => void onRemove(l)}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
      <label className="kh-cx__search">
        <Icon name="search" size={15} sw={2} />
        <input
          value={q}
          placeholder={ph}
          aria-label={ph}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 150)}
        />
      </label>
      {focus && results.length > 0 && (
        <div className="kh-cx__results" role="listbox" aria-label={label}>
          {results.map((r) => (
            <div
              key={`${r.type}:${r.id}`}
              role="option"
              aria-selected={false}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                void onAdd(r);
                setQ('');
              }}
            >
              <span className="kh-cx__dot" style={{ background: ITEM_DOT[r.type] }} />
              <span className="kh-cx__rk">{t(ITEM_KIND[r.type])}</span>
              <span className={`kh-cx__rt ${mono(r)}`}>{r.title || t('ne_untitled')}</span>
              <span className="kh-cx__rs">
                {r.type === 'transport'
                  ? `${stage(r.stage ?? 'mod').label} · ${r.sub}`.slice(0, 48)
                  : r.type === 'code'
                    ? r.sub
                    : when(r.at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
