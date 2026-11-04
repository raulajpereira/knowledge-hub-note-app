'use client';

import { useRef, useState } from 'react';
import { Button, Modal, Select } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { Folder } from './notesApi';
import {
  IMPORT_ACCEPT,
  importNotes,
  MAX_IMPORT_FILES,
  readImportFiles,
  type ImportItem,
  type ImportResult,
} from './importNotes';

// "Importar notas": drop or choose files from other apps, pick the notebook,
// then one note per page is created (progress per page, failures listed).

const FORMATS: Array<[string, string]> = [
  ['Markdown', '.md · .txt'],
  ['Word', '.docx'],
  ['OneNote', 'imp_onenote'],
  ['Notion', 'imp_notion'],
  ['Evernote', '.enex'],
  ['HTML', '.html'],
];

export function ImportDialog({
  open,
  onClose,
  folders,
  folderId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  folders: Folder[];
  /** the notebook open in the list (default target) */
  folderId: string | null;
  onDone: (folderId: string | null, imported: number, firstId?: string) => void;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [target, setTarget] = useState<string>(folderId ?? '');
  const [reading, setReading] = useState(false);
  const [over, setOver] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [running, setRunning] = useState(false);

  const reset = () => {
    setItems([]);
    setSkipped([]);
    setResults(null);
    setTarget(folderId ?? '');
  };
  const close = () => {
    if (running) return;
    const done = results?.filter((r) => r.ok) ?? [];
    if (done.length) onDone(target || null, done.length, done[0]!.noteId);
    reset();
    onClose();
  };

  const add = async (list: FileList | File[]) => {
    const files = [...list];
    if (!files.length) return;
    setReading(true);
    setResults(null);
    try {
      const r = await readImportFiles(files);
      setItems((x) => [...x, ...r.items].slice(0, MAX_IMPORT_FILES));
      setSkipped((x) => [...x, ...r.skipped]);
    } finally {
      setReading(false);
    }
  };

  const run = async () => {
    setRunning(true);
    setResults([]);
    try {
      await importNotes(items, target || null, (r) => setResults((x) => [...(x ?? []), r]));
    } finally {
      setRunning(false);
    }
  };

  const ok = results?.filter((r) => r.ok).length ?? 0;
  const bad = results?.filter((r) => !r.ok) ?? [];
  const lostImgs = results?.reduce((n, r) => n + (r.failedImages ?? 0), 0) ?? 0;
  const finished = !!results && !running && results.length === items.length;

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('imp_title')}
      subtitle={t('imp_sub')}
      closeLabel={t('i_close')}
      dismissible={!running}
      footer={
        finished ? (
          <Button variant="primary" onClick={close}>
            {t('imp_done')}
          </Button>
        ) : (
          <>
            <Button variant="glass" onClick={close} disabled={running}>
              {t('tr_cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => void run()}
              disabled={!items.length || running || reading}
            >
              {running
                ? `${t('imp_running')} ${results?.length ?? 0}/${items.length}`
                : t('imp_go').replace('{n}', String(items.length))}
            </Button>
          </>
        )
      }
    >
      <div className="kh-imp">
        <div className="kh-imp__formats">
          {FORMATS.map(([name, sub]) => (
            <span key={name} className="kh-imp__fmt">
              <b>{name}</b>
              <small>{sub.startsWith('imp_') ? t(sub) : sub}</small>
            </span>
          ))}
        </div>
        {!results && (
          <button
            type="button"
            className="kh-imp__drop"
            data-over={over || undefined}
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              void add(e.dataTransfer.files);
            }}
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 16V4" />
              <path d="M7 9l5-5 5 5" />
              <path d="M5 20h14" />
            </svg>
            <span className="kh-imp__dropT">{reading ? t('imp_reading') : t('imp_drop')}</span>
            <span className="kh-imp__dropS">{t('imp_dropSub')}</span>
          </button>
        )}
        <input
          ref={input}
          type="file"
          multiple
          accept={IMPORT_ACCEPT}
          hidden
          onChange={(e) => {
            if (e.target.files) void add(e.target.files);
            e.target.value = '';
          }}
        />
        {items.length > 0 && !results && (
          <>
            <div className="kh-imp__row">
              <span className="kh-imp__lbl">{t('imp_to')}</span>
              <Select
                value={target}
                options={[
                  { value: '', label: t('ne_noFolder') },
                  ...folders.map((f) => ({ value: f.id, label: f.name })),
                ]}
                onChange={setTarget}
                searchPlaceholder={t('search')}
                aria-label={t('imp_to')}
              />
            </div>
            <div className="kh-imp__list" aria-label={t('imp_pages')}>
              {items.map((it, i) => (
                <div key={`${it.source}-${i}`} className="kh-imp__item">
                  <span className="kh-imp__t">{it.title || '—'}</span>
                  <span className="kh-imp__s">{it.source}</span>
                  <button
                    type="button"
                    className="kh-imp__x"
                    aria-label={t('imp_remove')}
                    title={t('imp_remove')}
                    onClick={() => setItems((x) => x.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
        {skipped.length > 0 && !results && (
          <p className="kh-imp__warn">
            {t('imp_skipped')} {skipped.join(', ')}
          </p>
        )}
        {results && (
          <div className="kh-imp__res" role="status">
            <div className="kh-imp__bar">
              <span style={{ width: `${(results.length / Math.max(1, items.length)) * 100}%` }} />
            </div>
            <p>
              <b>{t('imp_okN').replace('{n}', String(ok))}</b>
              {lostImgs > 0 && ` · ${t('imp_imgLost').replace('{n}', String(lostImgs))}`}
            </p>
            {bad.length > 0 && (
              <p className="kh-imp__warn">
                {bad.some((r) => r.limit) ? t('ne_limit') : t('imp_failed')}{' '}
                {bad.map((r) => r.source).join(', ')}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
