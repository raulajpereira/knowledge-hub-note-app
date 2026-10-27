'use client';

import { useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { Icon } from '@/components/shell/icons';
import { ShellContext } from '@/components/shell/ShellContext';
import { extOf, fmtBytes, tintOf } from '@/lib/drive';
import { useWhen } from './useWhen';
import './content.css';

// "Ligações" (prototype cx_*): links between notes, tasks… shared by the
// notes inspector and the task detail. Dots/kinds per type as in the prototype.
// With `transports`, a second card "Ordens de Transporte" (cr_*) links SAP
// transport requests, with their stage as a badge. With `files`, a card
// "Ficheiros" links files of Ficheiros (type badge, name, size); on a file
// itself the card reads "Ligado a" (its notes, tasks and meetings).

export type ItemType =
  | 'note'
  | 'task'
  | 'voice'
  | 'issue'
  | 'meeting'
  | 'file'
  | 'artifact'
  | 'code'
  | 'transport'
  | 'sapnote'
  | 'ticket';
type Stage = 'mod' | 'rel' | 'qas' | 'prd' | 'junk';
type Link = { type: ItemType; id: string; title: string; sub?: string; stage?: Stage; size?: number };
/** cx: "Ligações" · tr: "Ordens de Transporte" · file: "Ficheiros" */
type Group = 'cx' | 'tr' | 'file';
type Candidate = Link & { sub: string; at: string };

export const ITEM_DOT: Record<ItemType, string> = {
  note: 'oklch(0.86 0.1 85)',
  task: 'oklch(0.8 0.13 30)',
  voice: 'oklch(0.76 0.12 300)',
  issue: 'oklch(0.78 0.11 240)',
  meeting: 'oklch(0.82 0.1 120)',
  file: 'oklch(0.8 0.09 60)',
  artifact: 'oklch(0.8 0.1 160)',
  code: 'oklch(0.84 0.1 245)',
  transport: 'oklch(0.82 0.11 210)',
  sapnote: 'oklch(0.8 0.13 20)',
  ticket: 'oklch(0.78 0.12 262)',
};
const ITEM_KIND: Record<ItemType, string> = {
  note: 'k_note',
  task: 'k_task',
  voice: 'k_voice',
  issue: 'k_issue',
  meeting: 'k_meeting',
  file: 'k_file',
  artifact: 'k_art',
  code: 'k_code',
  transport: 'k_tr',
  sapnote: 'k_sapnote',
  ticket: 'k_ticket',
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
    meeting: `/app/meetings?m=${id}`,
    file: `/app/files?f=${id}`,
    artifact: `/app/artifacts?a=${id}`,
    code: `/app/codelib?o=${id}`,
    transport: `/app/transports?o=${id}`,
    sapnote: `/app/sapnotes?n=${id}`,
    note: `/app/notes?n=${id}`,
    ticket: `/app/tickets?k=${id}`,
  })[type];

export function Connections({
  type,
  id,
  variant = 'card',
  placeholder,
  transports = false,
  files = false,
}: {
  type: ItemType;
  id: string;
  /** card: own glass card (notes inspector) · section: divider above (task detail) · box: card inside a panel */
  variant?: 'card' | 'section' | 'box';
  placeholder?: string;
  /** Also show "Ordens de Transporte" (when the plan has the transports module). */
  transports?: boolean;
  /** Also show "Ficheiros" (when the plan has the files module). */
  files?: boolean;
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
    setLinks((l) => [
      ...l,
      { type: c.type, id: c.id, title: c.title, sub: c.sub, stage: c.stage, size: c.size },
    ]);
  };
  const remove = async (l: Link) => {
    await api('/links', { a: self, b: { type: l.type, id: l.id } }, 'DELETE').catch(() => {});
    setLinks((x) => x.filter((y) => !(y.type === l.type && y.id === l.id)));
  };
  const showTr = transports && !!shell?.modules.has('transports');
  const showFiles = files && type !== 'file' && !!shell?.modules.has('files');
  // a file linked from the file's side shows up with the other links where there's no "Ficheiros" card
  const groupOf = (l: Link): Group =>
    l.type === 'transport' ? 'tr' : l.type === 'file' && showFiles ? 'file' : 'cx';
  const box = (g: Group) => (
    <LinkBox
      key={g}
      group={g}
      self={self}
      variant={variant}
      placeholder={g === 'cx' ? placeholder : undefined}
      links={links.filter((l) => groupOf(l) === g)}
      onAdd={add}
      onRemove={remove}
    />
  );
  return (
    <>
      {box('cx')}
      {showFiles && box('file')}
      {showTr && box('tr')}
    </>
  );
}

function LinkBox({
  group,
  self,
  variant,
  placeholder,
  links,
  onAdd,
  onRemove,
}: {
  group: Group;
  self: { type: ItemType; id: string };
  variant: 'card' | 'section' | 'box';
  placeholder?: string;
  links: Link[];
  onAdd: (c: Candidate) => Promise<void>;
  onRemove: (l: Link) => Promise<void>;
}) {
  const { t, lang } = useI18n();
  const when = useWhen();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const [results, setResults] = useState<Candidate[]>([]);
  const { type, id } = self;
  const tr = group === 'tr';
  const fl = group === 'file';
  /** on a file, the main card lists what the file is linked to */
  const onFile = type === 'file' && group === 'cx';

  useEffect(() => {
    if (!focus) return;
    let live = true;
    const h = setTimeout(() => {
      api<{ items: Candidate[] }>(
        `/links/candidates?type=${type}&id=${id}&q=${encodeURIComponent(q.trim())}${tr ? '&kind=tr' : fl ? '&kind=file' : ''}`,
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
  }, [focus, q, type, id, links, tr, fl]);

  const open = (l: Link) => router.push(itemHref(l.type, l.id));
  const stage = (s: Stage) => {
    const [k, bg] = STAGE[s];
    return { label: k.startsWith('cr_') ? t(k) : k, bg };
  };
  const mono = (l: Link) => (l.type === 'transport' ? 'kh-cx--mono' : '');
  const label = tr ? t('cr_title') : fl ? t('cf_title') : onFile ? t('fl_linkedTo') : t('cx_title');
  const ph = placeholder ?? (tr ? t('cr_ph') : fl ? t('cf_ph') : onFile ? t('fl_linkPh') : t('cx_ph'));
  const empty = tr ? t('cr_empty') : fl ? t('cf_empty') : onFile ? t('fl_linkedEmpty') : t('cx_empty');
  // a file: its type badge (colour of Ficheiros) instead of the dot and kind
  const ext = (l: Link) => (
    <span className="kh-cx__ext" style={{ background: tintOf(l.title) }} aria-hidden="true">
      {extOf(l.title).slice(0, 4) || '·'}
    </span>
  );

  return (
    <div className={`kh-cx kh-cx--${variant}`} role="group" aria-label={label}>
      <div className="kh-cx__cap">
        {fl ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M7 3h7l5 5v13H7z" />
            <path d="M14 3v5h5" />
          </svg>
        ) : tr ? (
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
      {links.length === 0 && <div className="kh-cx__empty">{empty}</div>}
      {links.length > 0 && (
        <div className="kh-cx__links">
          {links.map((l) => (
            <div key={`${l.type}:${l.id}`} className="kh-cx__link">
              {fl ? (
                ext(l)
              ) : (
                <>
                  <span
                    className="kh-cx__dot"
                    style={{ background: ITEM_DOT[l.type], boxShadow: `0 0 8px ${ITEM_DOT[l.type]}` }}
                  />
                  <span className="kh-cx__k">{t(ITEM_KIND[l.type])}</span>
                </>
              )}
              <span
                className={`kh-cx__t ${mono(l)}`}
                role="link"
                tabIndex={0}
                title={fl ? [l.title, l.sub].filter(Boolean).join(' · ') : l.sub || l.title}
                onClick={() => open(l)}
                onKeyDown={(e) => e.key === 'Enter' && open(l)}
              >
                {l.title || t('ne_untitled')}
              </span>
              {fl && l.size != null && <span className="kh-cx__k">{fmtBytes(l.size, lang)}</span>}
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
              {fl ? (
                ext(r)
              ) : (
                <>
                  <span className="kh-cx__dot" style={{ background: ITEM_DOT[r.type] }} />
                  <span className="kh-cx__rk">{t(ITEM_KIND[r.type])}</span>
                </>
              )}
              <span className={`kh-cx__rt ${mono(r)}`}>{r.title || t('ne_untitled')}</span>
              <span className="kh-cx__rs">
                {r.type === 'transport'
                  ? `${stage(r.stage ?? 'mod').label} · ${r.sub}`.slice(0, 48)
                  : r.type === 'code'
                    ? r.sub
                    : r.type === 'file'
                      ? [fmtBytes(r.size ?? 0, lang), r.sub].filter(Boolean).join(' · ').slice(0, 48)
                      : when(r.at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
