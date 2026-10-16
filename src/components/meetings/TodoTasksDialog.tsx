'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n/client';
import { Button, Checkbox, Modal, Segmented } from '@/components/ui';

// Leaving a meeting record whose "Coisas a fazer" have no task yet: which ones
// become tasks linked to the meeting, and of which type.

export type TaskType = 'tech' | 'mgmt';
export type TodoAsk = { i: number; t: string };

export function TodoTasksDialog({
  title,
  items,
  onCreate,
  onSkip,
  onStay,
}: {
  /** the meeting record's subject */
  title: string;
  items: TodoAsk[];
  /** creates the chosen items; resolves to the ones that failed (the dialog stays with them) */
  onCreate: (chosen: TodoAsk[], type: TaskType) => Promise<TodoAsk[]>;
  /** "Agora não": leave without creating */
  onSkip: () => void;
  /** closed (×, Escape): stay on the record */
  onStay: () => void;
}) {
  const { t } = useI18n();
  const [list, setList] = useState(items);
  const [off, setOff] = useState<Set<number>>(new Set());
  // tasks are "Funcional / Técnica" unless chosen otherwise (the Tasks page's default)
  const [type, setType] = useState<TaskType>('tech');
  const [busy, setBusy] = useState(false);
  const chosen = list.filter((x) => !off.has(x.i));

  const create = async () => {
    setBusy(true);
    try {
      const failed = await onCreate(chosen, type);
      if (failed.length) setList(failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !busy && onStay()}
      dismissible={!busy}
      title={t('mt_leaveT')}
      subtitle={t('mt_leaveB').replace('{x}', title)}
      size="sm"
      closeLabel={t('mt_leaveStay')}
      className="kh-mt-ask"
      footer={
        <>
          <Button variant="glass" disabled={busy} onClick={onSkip}>
            {t('mt_leaveSkip')}
          </Button>
          <Button
            variant="primary"
            disabled={busy || !chosen.length}
            data-autofocus=""
            onClick={() => void create()}
          >
            {t('mt_leaveCreate')}
            {chosen.length > 0 && ` (${chosen.length})`}
          </Button>
        </>
      }
    >
      <div className="kh-mt-ask__items" role="group" aria-label={t('mt_leaveItems')}>
        {list.map((x) => (
          <Checkbox
            key={x.i}
            checked={!off.has(x.i)}
            disabled={busy}
            onChange={(on) =>
              setOff((s) => {
                const n = new Set(s);
                if (on) n.delete(x.i);
                else n.add(x.i);
                return n;
              })
            }
          >
            {x.t}
          </Checkbox>
        ))}
      </div>
      <div className="kh-mt-ask__type">
        <span>{t('mt_leaveType')}</span>
        <Segmented<TaskType>
          label={t('mt_leaveType')}
          value={type}
          onChange={setType}
          options={[
            { value: 'tech', label: t('tk_tech') },
            { value: 'mgmt', label: t('tk_mgmt') },
          ]}
        />
      </div>
    </Modal>
  );
}
