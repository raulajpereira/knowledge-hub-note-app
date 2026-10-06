'use client';

import { useMemo, useState } from 'react';
import { usePref } from '@/components/shell/PrefsProvider';
import { useShell } from '@/components/shell/ShellContext';
import { NavIcon } from '@/components/shell/icons';
import { moduleOf, normalizeNav } from '@/components/shell/nav';
import type { NavEntry } from '@/lib/prefs';
import { useI18n } from '@/i18n/client';
import { Card } from './LookTab';

const ic = (d: string, size = 16) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: d }}
  />
);
const GRIP =
  '<circle cx="9" cy="6" r="1"></circle><circle cx="15" cy="6" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="9" cy="18" r="1"></circle><circle cx="15" cy="18" r="1"></circle>';
const EYE =
  '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>';
const EYE_OFF =
  '<path d="M3 3l18 18"></path><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1"></path><path d="M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"></path>';
const UP = '<path d="M6 15l6-6 6 6"></path>';
const DOWN = '<path d="M6 9l6 6 6-6"></path>';
const X = '<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>';

/** Barra Lateral editor (prototype navEdit): rename, group, hide, reorder by drag or arrows. */
export function NavTab() {
  const { t } = useI18n();
  const { modules } = useShell();
  const [saved, setNav] = usePref<NavEntry[] | undefined>('nav', undefined);
  const L = useMemo(() => normalizeNav(saved), [saved]);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const edit = (fn: (a: NavEntry[]) => NavEntry[]) => setNav(fn(L.map((x) => ({ ...x }))));
  const swap = (i: number, j: number) =>
    edit((a) => {
      if (j < 0 || j >= a.length) return a;
      [a[i], a[j]] = [a[j]!, a[i]!];
      return a;
    });

  // Group membership as in the prototype: a group runs until the next spacer.
  let grp: number | null = null;
  const meta = L.map((e, i) => {
    if (e.type === 'spacer') grp = null;
    const inGrp = e.type === 'item' && Boolean(e.nested) && grp !== null;
    const canNest = e.type === 'item' && grp !== null;
    if (e.type === 'group') grp = i;
    return { e, i, inGrp, canNest };
  });
  const visible = (e: NavEntry) => {
    if (e.type !== 'item') return true;
    const m = moduleOf(e.id);
    return m === null || modules.has(m);
  };

  return (
    <Card
      title={t('navTitle')}
      desc={t('navDesc')}
      action={
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            className="kh-set__solid"
            style={{ height: 38, padding: '0 16px', fontSize: 13 }}
            onClick={() => edit((a) => [...a, { type: 'group', name: t('newGroup'), open: true }])}
          >
            + {t('addGroup')}
          </button>
          <button
            type="button"
            className="kh-set__soft"
            style={{ height: 38, padding: '0 16px', fontSize: 13 }}
            onClick={() => edit((a) => [...a, { type: 'spacer' }])}
          >
            + {t('addSpacer')}
          </button>
          <button
            type="button"
            className="kh-set__soft"
            style={{ height: 38, padding: '0 16px', fontSize: 13, background: 'transparent' }}
            onClick={() => setNav(null)}
          >
            {t('resetNav')}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {meta.map(({ e, i, inGrp, canNest }) =>
          !visible(e) ? null : (
            <div
              key={i}
              data-navrow=""
              className={`kh-navrow${e.type === 'group' ? ' kh-navrow--group' : ''}`}
              style={{
                paddingLeft: inGrp ? 34 : 6,
                opacity: e.type === 'item' && e.hidden ? 0.45 : 1,
                boxShadow:
                  drag !== null && over === i && drag !== i
                    ? drag < i
                      ? 'inset 0 -3px 0 #fbf8f5'
                      : 'inset 0 3px 0 #fbf8f5'
                    : 'none',
              }}
              onDragOver={(ev) => {
                ev.preventDefault();
                if (over !== i) setOver(i);
              }}
              onDrop={(ev) => {
                ev.preventDefault();
                const from = drag;
                setDrag(null);
                setOver(null);
                if (from === null || from === i) return;
                edit((a) => {
                  const [x] = a.splice(from, 1);
                  a.splice(i, 0, x!);
                  return a;
                });
              }}
            >
              <span
                className="kh-navrow__grip"
                draggable
                title={t('dragT')}
                onDragStart={(ev) => {
                  ev.dataTransfer.effectAllowed = 'move';
                  ev.dataTransfer.setData('text/plain', String(i));
                  const row = (ev.currentTarget as HTMLElement).closest('[data-navrow]');
                  if (row) ev.dataTransfer.setDragImage(row, 20, 22);
                  setDrag(i);
                }}
                onDragEnd={() => {
                  setDrag(null);
                  setOver(null);
                }}
              >
                {ic(GRIP)}
              </span>
              {e.type === 'item' && (
                <>
                  <NavIcon id={e.id} />
                  <input
                    className="kh-navrow__in"
                    value={e.label ?? ''}
                    placeholder={t(`nav_${e.id}`)}
                    title={t('renameT')}
                    maxLength={60}
                    aria-label={t(`nav_${e.id}`)}
                    onChange={(ev) => {
                      const v = ev.target.value;
                      edit((a) => {
                        const x = a[i] as Extract<NavEntry, { type: 'item' }>;
                        if (v.trim()) x.label = v;
                        else delete x.label;
                        return a;
                      });
                    }}
                  />
                  <button
                    type="button"
                    className="kh-navrow__nest"
                    disabled={!canNest}
                    title={canNest ? (inGrp ? t('nestOut') : t('nestIn')) : t('nestNone')}
                    onClick={() =>
                      edit((a) => {
                        (a[i] as Extract<NavEntry, { type: 'item' }>).nested = !inGrp;
                        return a;
                      })
                    }
                  >
                    {inGrp ? t('nestOut') : t('nestIn')}
                  </button>
                  <button
                    type="button"
                    className="kh-navrow__icon"
                    title={e.hidden ? t('showT') : t('hideT')}
                    aria-label={`${e.hidden ? t('showT') : t('hideT')} ${t(`nav_${e.id}`)}`}
                    onClick={() =>
                      edit((a) => {
                        const x = a[i] as Extract<NavEntry, { type: 'item' }>;
                        if (x.hidden) delete x.hidden;
                        else x.hidden = true;
                        return a;
                      })
                    }
                  >
                    {ic(e.hidden ? EYE_OFF : EYE)}
                  </button>
                </>
              )}
              {e.type === 'group' && (
                <>
                  <span className="kh-navrow__tag">{t('groupTag')}</span>
                  <input
                    className="kh-navrow__in"
                    style={{
                      fontWeight: 600,
                      background: 'rgba(18,12,9,.25)',
                      borderColor: 'rgba(255,255,255,.16)',
                    }}
                    value={e.name}
                    maxLength={60}
                    aria-label={t('groupTag')}
                    onChange={(ev) => {
                      const v = ev.target.value;
                      edit((a) => {
                        (a[i] as Extract<NavEntry, { type: 'group' }>).name = v;
                        return a;
                      });
                    }}
                  />
                </>
              )}
              {e.type === 'spacer' && (
                <>
                  <span style={{ flex: 'none', fontSize: 12, color: 'rgba(255,248,240,.6)' }}>
                    {t('spacerTag')}
                  </span>
                  <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.22)' }} />
                </>
              )}
              <button
                type="button"
                className="kh-navrow__icon"
                title={t('upT')}
                aria-label={t('upT')}
                onClick={() => swap(i, i - 1)}
              >
                {ic(UP)}
              </button>
              <button
                type="button"
                className="kh-navrow__icon"
                title={t('downT')}
                aria-label={t('downT')}
                onClick={() => swap(i, i + 1)}
              >
                {ic(DOWN)}
              </button>
              {e.type !== 'item' && (
                <button
                  type="button"
                  className="kh-navrow__icon"
                  title={t('removeT')}
                  aria-label={t('removeT')}
                  onClick={() =>
                    edit((a) => {
                      a.splice(i, 1);
                      // items that followed a removed group/spacer leave the group
                      for (let j = i; j < a.length && a[j]!.type === 'item'; j++)
                        (a[j] as Extract<NavEntry, { type: 'item' }>).nested = false;
                      return a;
                    })
                  }
                >
                  {ic(X)}
                </button>
              )}
            </div>
          ),
        )}
      </div>
    </Card>
  );
}
