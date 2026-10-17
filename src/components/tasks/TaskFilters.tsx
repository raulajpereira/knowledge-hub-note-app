'use client';

import { useRef, useState } from 'react';
import { Popover } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { projectLabel, useMgOptions } from '@/components/mg/useMgOptions';
import { TASK_DUES, type TaskViewFilter } from '@/lib/views';
import '@/components/views/views.css';

// Tasks filters beyond status / type / shared folder: priority, project and
// due range, kept in the URL; "Guardar vista" saves the whole filter as a
// view in the sidebar.

export type TaskExtra = Pick<TaskViewFilter, 'priority' | 'project' | 'due'>;
export const hasTaskExtra = (x: TaskExtra) => x.priority.length > 0 || !!x.project || x.due !== 'any';

const PRIO = [
  ['high', 't_high'],
  ['medium', 't_med'],
  ['low', 't_low'],
] as const;
const DUE_KEY: Record<string, string> = {
  any: 'vw_dueAny',
  overdue: 'vw_dueOver',
  today: 'vw_dueToday',
  week: 'vw_dueWeek',
  month: 'vw_dueMonth',
  none: 'vw_dueNone',
};

export function TaskFiltersButton({
  value,
  onChange,
  onSave,
}: {
  value: TaskExtra;
  onChange: (p: Partial<TaskExtra>) => void;
  onSave: () => void;
}) {
  const { t } = useI18n();
  const { projects } = useMgOptions();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="kh-vf-toggle"
        style={{ width: 40, height: 40, flex: 'none' }}
        data-active={hasTaskExtra(value) || undefined}
        aria-expanded={open}
        title={t('vw_filters')}
        aria-label={t('vw_filters')}
        onClick={() => setOpen((o) => !o)}
      >
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
      </button>
      {open && (
        <Popover
          anchor={ref}
          align="left"
          onClose={() => setOpen(false)}
          width={320}
          aria-label={t('vw_filters')}
        >
          <div className="kh-vf">
            <div className="kh-vf__h">{t('vw_priority')}</div>
            <div className="kh-vf__chips">
              {PRIO.map(([id, k]) => (
                <button
                  key={id}
                  type="button"
                  className="kh-vf__chip"
                  aria-pressed={value.priority.includes(id)}
                  onClick={() =>
                    onChange({
                      priority: value.priority.includes(id)
                        ? value.priority.filter((x) => x !== id)
                        : [...value.priority, id],
                    })
                  }
                >
                  {t(k)}
                </button>
              ))}
            </div>
            <div className="kh-vf__h">{t('vw_project')}</div>
            <select
              className="kh-vf__sel"
              value={value.project ?? ''}
              aria-label={t('vw_project')}
              onChange={(e) => onChange({ project: e.target.value || null })}
            >
              <option value="">{t('vw_anyProject')}</option>
              <option value="none">{t('vw_noProject')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {projectLabel(p)}
                </option>
              ))}
            </select>
            <div className="kh-vf__h">{t('vw_due')}</div>
            <div className="kh-vf__chips">
              {TASK_DUES.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="kh-vf__chip"
                  aria-pressed={value.due === d}
                  onClick={() => onChange({ due: d })}
                >
                  {t(DUE_KEY[d]!)}
                </button>
              ))}
            </div>
            <div className="kh-vf__foot">
              <button
                type="button"
                className="kh-vf__link"
                onClick={() => onChange({ priority: [], project: null, due: 'any' })}
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

export function TaskFiltersActive({
  value,
  onChange,
}: {
  value: TaskExtra;
  onChange: (p: Partial<TaskExtra>) => void;
}) {
  const { t } = useI18n();
  const { projects } = useMgOptions();
  if (!hasTaskExtra(value)) return null;
  const chip = (key: string, label: string, clear: () => void) => (
    <span key={key} className="kh-vf-active__chip">
      {label}
      <button type="button" aria-label={`${t('vw_remove')} ${label}`} onClick={clear}>
        ×
      </button>
    </span>
  );
  const pj = projects.find((p) => p.id === value.project);
  return (
    <div className="kh-vf-active" style={{ padding: '0 0 8px' }}>
      {value.priority.map((p) =>
        chip(`p:${p}`, t(PRIO.find((x) => x[0] === p)![1]), () =>
          onChange({ priority: value.priority.filter((x) => x !== p) }),
        ),
      )}
      {value.project &&
        chip(
          'pj',
          value.project === 'none' ? t('vw_noProject') : pj ? projectLabel(pj) : t('vw_project'),
          () => onChange({ project: null }),
        )}
      {value.due !== 'any' && chip('d', t(DUE_KEY[value.due]!), () => onChange({ due: 'any' }))}
    </div>
  );
}
