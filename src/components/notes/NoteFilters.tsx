'use client';

import { useEffect, useRef, useState } from 'react';
import { Popover, Segmented } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { tagStyle } from '@/lib/tags';
import { VIEW_DAYS } from '@/lib/views';
import '@/components/views/views.css';

// Notes list filters beyond the notebook: labels (any / all), "updated in the
// last N days" and a text, kept in the URL; "Guardar vista" saves them (with
// the notebook) as a view in the sidebar.

export type NoteExtra = { tags: string[]; tagMode: 'any' | 'all'; days: number | null; q: string };

const FunnelIc = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 5h16l-6 8v5l-4 2v-7z" />
  </svg>
);

export const hasExtra = (x: NoteExtra) => x.tags.length > 0 || !!x.days || !!x.q;

export function NoteFiltersButton({
  value,
  onChange,
  onSave,
}: {
  value: NoteExtra;
  onChange: (patch: Partial<NoteExtra>) => void;
  onSave: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<Array<{ name: string; count: number }> | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    api<{ tags: Array<{ name: string; count: number }> }>('/tags')
      .then((r) => setTags(r.tags))
      .catch(() => setTags([]));
  }, [open]);
  const toggleTag = (n: string) =>
    onChange({
      tags: value.tags.includes(n) ? value.tags.filter((x) => x !== n) : [...value.tags, n].slice(0, 10),
    });

  return (
    <>
      <button
        ref={ref}
        type="button"
        className="kh-vf-toggle"
        data-active={hasExtra(value) || undefined}
        aria-expanded={open}
        title={t('vw_filters')}
        aria-label={t('vw_filters')}
        onClick={() => setOpen((o) => !o)}
      >
        <FunnelIc />
      </button>
      {open && (
        <Popover
          anchor={ref}
          align="left"
          onClose={() => setOpen(false)}
          width={320}
          maxHeight={560}
          aria-label={t('vw_filters')}
        >
          <div className="kh-vf">
            <div className="kh-vf__h">{t('vw_tags')}</div>
            <div className="kh-vf__chips">
              {tags?.length === 0 && <span style={{ fontSize: 12.5, opacity: 0.7 }}>{t('vw_noTags')}</span>}
              {(tags ?? []).map((tg) => (
                <button
                  key={tg.name}
                  type="button"
                  className="kh-vf__chip kh-tagc"
                  style={value.tags.includes(tg.name) ? undefined : tagStyle(tg.name)}
                  aria-pressed={value.tags.includes(tg.name)}
                  onClick={() => toggleTag(tg.name)}
                >
                  {tg.name}
                </button>
              ))}
            </div>
            {value.tags.length > 1 && (
              <Segmented<'any' | 'all'>
                label={t('vw_tagMode')}
                value={value.tagMode}
                onChange={(v) => onChange({ tagMode: v })}
                options={[
                  { value: 'any', label: t('vw_tagAny') },
                  { value: 'all', label: t('vw_tagAll') },
                ]}
              />
            )}
            <div className="kh-vf__h">{t('vw_updated')}</div>
            <div className="kh-vf__chips">
              {[null, ...VIEW_DAYS].map((d) => (
                <button
                  key={d ?? 0}
                  type="button"
                  className="kh-vf__chip"
                  aria-pressed={value.days === d}
                  onClick={() => onChange({ days: d })}
                >
                  {d ? t('vw_lastDays').replace('{n}', String(d)) : t('vw_anyTime')}
                </button>
              ))}
            </div>
            <div className="kh-vf__h">{t('vw_text')}</div>
            <input
              className="kh-in"
              style={{ height: 36 }}
              value={value.q}
              maxLength={200}
              placeholder={t('vw_textPh')}
              aria-label={t('vw_text')}
              onChange={(e) => onChange({ q: e.target.value })}
            />
            <div className="kh-vf__foot">
              <button
                type="button"
                className="kh-vf__link"
                onClick={() => onChange({ tags: [], tagMode: 'any', days: null, q: '' })}
              >
                {t('vw_clear')}
              </button>
              <button
                type="button"
                className="kh-vf__btn"
                onClick={() => {
                  setOpen(false);
                  onSave();
                }}
              >
                ★ {t('vw_save')}
              </button>
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}

/** The active filters under the list title, each removable. */
export function NoteFiltersActive({
  value,
  onChange,
}: {
  value: NoteExtra;
  onChange: (p: Partial<NoteExtra>) => void;
}) {
  const { t } = useI18n();
  if (!hasExtra(value)) return null;
  const chip = (key: string, label: string, clear: () => void) => (
    <span key={key} className="kh-vf-active__chip">
      {label}
      <button type="button" aria-label={`${t('vw_remove')} ${label}`} onClick={clear}>
        ×
      </button>
    </span>
  );
  return (
    <div className="kh-vf-active">
      {value.tags.map((tg) =>
        chip(`t:${tg}`, `#${tg}`, () => onChange({ tags: value.tags.filter((x) => x !== tg) })),
      )}
      {value.tags.length > 1 && (
        <span style={{ fontSize: 11.5, opacity: 0.7 }}>
          {value.tagMode === 'all' ? t('vw_tagAll') : t('vw_tagAny')}
        </span>
      )}
      {value.days &&
        chip('d', t('vw_lastDays').replace('{n}', String(value.days)), () => onChange({ days: null }))}
      {value.q && chip('q', `“${value.q}”`, () => onChange({ q: '' }))}
    </div>
  );
}
