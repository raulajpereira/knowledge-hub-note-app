'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { api, isApiFailure } from '@/lib/client/api';
import { fmtBytes } from '@/lib/drive';
import { useShell } from '@/components/shell/ShellContext';
import { refreshCounts } from '@/components/shell/counts';
import { NavIcon } from '@/components/shell/icons';
import { captureStamp, createCaptureNote } from '@/components/notes/captureNote';
import { driveUpload } from '@/components/files/driveUpload';
import './share-target.css';

// /app/share (D69): what was shared into the installed app from another one
// (Android's share sheet). The server keeps it for an hour; here the user
// picks a note, a task or Ficheiros, and the normal APIs make it.

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
type Shared = {
  title: string;
  text: string;
  url: string;
  files: Array<{ name: string; type: string; size: number }>;
};
type Kind = 'note' | 'task' | 'files';
const ERRORS: Record<string, string> = {
  too_big: 'shr_eTooBig',
  type: 'shr_eType',
  too_many: 'shr_eTooMany',
  too_many_files: 'shr_eFiles',
  invalid: 'shr_eInvalid',
  empty: 'shr_eEmpty',
};

/** a title from what came: the title, else the first line of the text, else the link's site */
function guessTitle(s: Shared): string {
  if (s.title) return s.title;
  const line =
    s.text
      .split('\n')
      .find((l) => l.trim())
      ?.trim() ?? '';
  if (line && !/^https?:\/\/\S+$/i.test(line)) return line.slice(0, 120);
  const u = s.url || (/https?:\/\/\S+/i.exec(s.text)?.[0] ?? '');
  try {
    return u ? new URL(u).hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
}

export function ShareTargetView() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const { modules } = useShell();
  const k = sp.get('k');
  const err = sp.get('e');
  const [share, setShare] = useState<Shared | null | undefined>(k ? undefined : null);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState<Kind | 'drop' | null>(null);

  useEffect(() => {
    if (!k) return;
    let live = true;
    (async () => {
      const { share: s } = await api<{ share: Shared }>(`/share-target/${encodeURIComponent(k)}`);
      // the files come back as blobs (images shown, then uploaded by the chosen action)
      const fs = await Promise.all(
        s.files.map(async (f, i) => {
          const res = await fetch(`${BASE}/api/v1/share-target/${encodeURIComponent(k)}/${i}`, {
            credentials: 'same-origin',
          });
          if (!res.ok) throw new Error('read');
          return new File([await res.blob()], f.name, { type: f.type });
        }),
      );
      if (!live) return;
      setShare(s);
      setFiles(fs);
      setTitle(guessTitle(s));
    })().catch(() => live && setShare(null));
    return () => {
      live = false;
    };
  }, [k]);

  const thumbs = useMemo(
    () => files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)),
    [files],
  );
  useEffect(() => () => thumbs.forEach((u) => u && URL.revokeObjectURL(u)), [thumbs]);

  const images = files.filter((f) => f.type.startsWith('image/'));
  const pdfs = files.length - images.length;
  const body = share
    ? [share.text, share.url && !share.text.includes(share.url) ? share.url : ''].filter(Boolean).join('\n')
    : '';
  const name = title.trim() || `${t('shr_default')} ${captureStamp()}`;

  const done = async (to: string) => {
    if (k) await api(`/share-target/${encodeURIComponent(k)}`, undefined, 'DELETE').catch(() => {});
    refreshCounts();
    router.replace(to);
  };
  const act = async (kind: Kind) => {
    if (busy) return;
    setBusy(kind);
    try {
      if (kind === 'note') {
        const r = await createCaptureNote({ title: name, text: body, images });
        if (r.failed) toast({ message: t('shr_imgFail'), tone: 'error' });
        await done(`/app/notes?n=${r.id}`);
      } else if (kind === 'task') {
        const { task } = await api<{ task: { id: string } }>('/tasks', { title: name.slice(0, 300) });
        const notes = body.trim() !== name ? body.slice(0, 20_000) : '';
        if (notes) await api(`/tasks/${task.id}`, { notes }, 'PATCH');
        await done(`/app/tasks?t=${task.id}`);
      } else {
        let last: { id: string } | null = null;
        for (const f of files) last = await driveUpload<{ id: string }>(f, { folderId: null });
        await done(last ? `/app/files?f=${last.id}` : '/app/files');
      }
    } catch (e) {
      const code = isApiFailure(e) ? e.code : ((e as { code?: string })?.code ?? '');
      toast({
        message: t(
          code === 'limit_reached'
            ? kind === 'task'
              ? 'tk_limit'
              : kind === 'files'
                ? 'fl_quotaFull'
                : 'ne_limit'
            : 'ne_saveFail',
        ),
        tone: 'error',
      });
      setBusy(null);
    }
  };

  const fail = (head: string, sub: string) => (
    <section className="kh-shr kh-page-card">
      <div className="kh-shr__in kh-shr__in--empty">
        <span className="kh-shr__badge" aria-hidden="true">
          <ShareIcon />
        </span>
        <h1 className="kh-shr__t">{head}</h1>
        <p className="kh-shr__s">{sub}</p>
        <Link href="/app" className="kh-shr__ghost">
          {t('shr_home')}
        </Link>
      </div>
    </section>
  );
  if (err) return fail(t('shr_title'), t(ERRORS[err] ?? 'shr_eInvalid'));
  if (share === null) return fail(t('shr_none'), t('shr_noneSub'));
  if (!share) return <section className="kh-shr kh-page-card" aria-busy="true" />;

  const opts: Array<{ id: Kind; icon: string; label: string; sub: string; off?: boolean }> = [];
  if (modules.has('notes'))
    opts.push({
      id: 'note',
      icon: 'notes',
      label: t('shr_note'),
      sub: pdfs && !images.length && !body ? t('shr_pdfHint') : t('shr_noteSub'),
      off: !images.length && !body && !title.trim(),
    });
  if (modules.has('tasks'))
    opts.push({ id: 'task', icon: 'tasks', label: t('shr_task'), sub: t('shr_taskSub') });
  if (modules.has('files') && files.length)
    opts.push({ id: 'files', icon: 'files', label: t('shr_files'), sub: t('shr_filesSub') });

  return (
    <section className="kh-shr kh-page-card" aria-busy={!!busy || undefined}>
      <div className="kh-shr__in">
        <header className="kh-shr__head">
          <span className="kh-shr__badge" aria-hidden="true">
            <ShareIcon />
          </span>
          <div>
            <h1 className="kh-shr__t">{t('shr_title')}</h1>
            <p className="kh-shr__s">{t('shr_sub')}</p>
          </div>
        </header>

        <div className="kh-shr__card">
          <label className="kh-shr__field">
            <span>{t('shr_name')}</span>
            <input
              value={title}
              maxLength={300}
              placeholder={`${t('shr_default')} ${captureStamp()}`}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          {share.text && <p className="kh-shr__text">{share.text}</p>}
          {share.url && !share.text.includes(share.url) && (
            <a className="kh-shr__url" href={share.url} target="_blank" rel="noopener noreferrer">
              {share.url}
            </a>
          )}
          {files.length > 0 && (
            <>
              <div className="kh-shr__count">
                {files.length === 1 ? t('shr_file1') : t('shr_nFiles').replace('{n}', String(files.length))}
              </div>
              <div className="kh-shr__files">
                {files.map((f, i) =>
                  thumbs[i] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a local blob of the shared image
                    <img key={i} className="kh-shr__thumb" src={thumbs[i]!} alt={f.name} />
                  ) : (
                    <span key={i} className="kh-shr__file" title={f.name}>
                      <b>PDF</b>
                      <span>{f.name}</span>
                      <span>{fmtBytes(f.size, lang)}</span>
                    </span>
                  ),
                )}
              </div>
            </>
          )}
        </div>

        <div className="kh-shr__opts">
          {opts.map((o) => (
            <button
              key={o.id}
              type="button"
              className="kh-shr__opt"
              disabled={!!busy || o.off}
              onClick={() => void act(o.id)}
            >
              <span className="kh-shr__optic">
                <NavIcon id={o.icon} size={22} />
              </span>
              <span className="kh-shr__optt">
                <b>{busy === o.id ? t('shr_saving') : o.label}</b>
                <span>{o.sub}</span>
              </span>
            </button>
          ))}
        </div>
        {pdfs > 0 && modules.has('notes') && (images.length > 0 || !!body) && (
          <p className="kh-shr__hint">{t('shr_pdfHint')}</p>
        )}
        <button
          type="button"
          className="kh-shr__ghost"
          disabled={!!busy}
          onClick={() => {
            setBusy('drop');
            void done('/app');
          }}
        >
          {t('shr_discard')}
        </button>
      </div>
    </section>
  );
}

const ShareIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3v12" />
    <path d="M7 8l5-5 5 5" />
    <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
  </svg>
);
