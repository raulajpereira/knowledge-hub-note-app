'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { useI18n } from '@/i18n/client';
import { api, isApiFailure } from '@/lib/client/api';
import { PRIORITY_COLOR, RESOLVED_STATUSES, STATUS_COLOR, type TicketStatus } from '@/lib/tickets';
import { useConfirm, useToast } from '@/components/ui';
import { useWhen } from '@/components/content/useWhen';
import { Connections } from '@/components/content/Connections';
import { TicketNotes } from './TicketNotes';
import {
  ChipSelect,
  fmtSize,
  fromLocalInput,
  I,
  Ico,
  overdue,
  PartyField,
  PRIORITIES,
  prioLabel,
  STATUSES,
  statusLabel,
  toLocalInput,
  type Ticket,
  type TicketEvent,
  type TicketFile,
  type TicketType,
} from './ticketUi';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

type Full = Ticket & {
  notesDoc: JSONContent | null;
  events: TicketEvent[];
  files: TicketFile[];
  perm: 'owner' | 'edit' | 'read';
  types: TicketType[];
};
export type TicketPatch = Partial<
  Pick<
    Ticket,
    | 'number'
    | 'summary'
    | 'parentNumber'
    | 'parentSummary'
    | 'clientId'
    | 'clientName'
    | 'priority'
    | 'typeId'
    | 'status'
    | 'responsibleId'
    | 'responsibleName'
    | 'openedAt'
    | 'dueOn'
    | 'resolvedAt'
    | 'folderId'
    | 'sharedFolderId'
  >
> & { notesDoc?: JSONContent };

/** Fields whose change is logged in the history: saved at once, the entries come back. */
const LOGGED = ['status', 'priority', 'responsibleId', 'responsibleName'] as const;

export function TicketDetail({
  item,
  clients,
  people,
  folders,
  ownShared,
  sharedBy,
  onLocal,
  onSaved,
  onRemove,
  onClose,
}: {
  item: Ticket;
  clients: Array<{ id: string; name: string }>;
  people: Array<{ id: string; name: string }>;
  folders: Array<{ id: string; name: string }>;
  /** the caller's own standalone shared ticket folders */
  ownShared: Array<{ id: string; name: string }>;
  /** owner's name of a ticket seen through someone else's shared folder */
  sharedBy: string | null;
  onLocal: (patch: Partial<Ticket>) => void;
  onSaved: (t: Ticket) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const when = useWhen();
  const [full, setFull] = useState<Full | null>(null);
  const [numErr, setNumErr] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const timer = useRef<{ tm: ReturnType<typeof setTimeout>; patch: TicketPatch } | null>(null);
  const id = item.id;

  useEffect(() => {
    let live = true;
    setFull(null);
    api<{ ticket: Full }>(`/tickets/${id}`)
      .then((r) => live && setFull(r.ticket))
      .catch(() => live && toast({ message: t('ne_saveFail'), tone: 'error' }));
    return () => {
      live = false;
    };
  }, [id, t, toast]);

  const fail = useCallback(() => toast({ message: t('ne_saveFail'), tone: 'error' }), [t, toast]);
  const send = useCallback(
    async (patch: TicketPatch) => {
      try {
        const r = await api<{ ticket: Ticket; events: TicketEvent[] }>(`/tickets/${id}`, patch, 'PATCH');
        if ('number' in patch) setNumErr(false);
        onSaved(r.ticket);
        setFull((f) => (f ? { ...f, ...r.ticket, events: [...f.events, ...r.events] } : f));
      } catch (e) {
        if (isApiFailure(e) && e.code === 'ticket_number_taken') setNumErr(true);
        else fail();
      }
    },
    [id, onSaved, fail],
  );
  const flush = useCallback(() => {
    const p = timer.current;
    if (!p) return;
    clearTimeout(p.tm);
    timer.current = null;
    void send(p.patch);
  }, [send]);
  // leaving the ticket (another one, another page, reload) sends what is waiting
  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);
  const upd = (patch: TicketPatch, delay = 600) => {
    const vis = { ...patch };
    delete vis.notesDoc;
    onLocal(vis);
    setFull((f) => (f ? { ...f, ...vis } : f));
    if (!delay || LOGGED.some((k) => k in patch)) {
      flush();
      return void send(patch);
    }
    const prev = timer.current;
    if (prev) clearTimeout(prev.tm);
    const merged = { ...prev?.patch, ...patch };
    timer.current = { patch: merged, tm: setTimeout(flush, delay) };
  };

  const x = full ? { ...full, ...item } : null;
  const perm = full?.perm ?? (item.mine ? 'owner' : 'read');
  const can = perm !== 'read';
  const owner = perm === 'owner';
  const types = full?.types ?? [];

  const setStatus = (s: TicketStatus) => {
    // the resolution date follows (the server stamps it)
    const resolved = RESOLVED_STATUSES.includes(s);
    upd({ status: s }, 0);
    if (!resolved) onLocal({ resolvedAt: null });
  };
  const addComment = async () => {
    const body = comment.trim();
    if (!body) return;
    try {
      const { event } = await api<{ event: TicketEvent }>(`/tickets/${id}/comments`, { body });
      setFull((f) => (f ? { ...f, events: [...f.events, event] } : f));
      setComment('');
    } catch {
      fail();
    }
  };
  const delComment = async (e: TicketEvent) => {
    try {
      await api(`/tickets/comments/${e.id}`, undefined, 'DELETE');
      setFull((f) => (f ? { ...f, events: f.events.filter((y) => y.id !== e.id) } : f));
    } catch {
      fail();
    }
  };

  // ── attachments: chunked upload (as in Ficheiros) ─────────────────────────
  const uploadOne = async (file: File) => {
    setBusy(file.name);
    let up: { uploadId: string; partSize: number; parts: number } | null = null;
    try {
      up = await api(`/tickets/${id}/uploads`, {
        name: file.name,
        size: file.size,
        mime: file.type || undefined,
      });
      for (let n = 1; n <= up!.parts; n++) {
        const chunk = file.slice((n - 1) * up!.partSize, n * up!.partSize);
        const res = await fetch(`${BASE}/api/v1/tickets/uploads/${up!.uploadId}/${n}`, {
          method: 'PUT',
          body: chunk,
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/octet-stream' },
        });
        if (!res.ok) throw { code: 'upload_failed', status: res.status };
      }
      const { file: f } = await api<{ file: TicketFile }>(`/tickets/uploads/${up!.uploadId}`, {});
      setFull((cur) => (cur ? { ...cur, files: [...cur.files, f] } : cur));
    } catch (e) {
      if (up) void api(`/tickets/uploads/${up.uploadId}`, undefined, 'DELETE').catch(() => {});
      const code = isApiFailure(e) ? e.code : '';
      toast({
        message: t(
          code === 'limit_reached'
            ? 'tk_fileQuota'
            : code === 'file_too_large'
              ? 'tk_fileBig'
              : 'ne_saveFail',
        ),
        tone: 'error',
      });
    } finally {
      setBusy(null);
    }
  };
  const uploadAll = async (files: FileList | File[]) => {
    for (const f of [...files]) await uploadOne(f);
  };
  const delFile = async (f: TicketFile) => {
    const ok = await confirm({
      title: t('tk_delFile'),
      body: t('tk_delFileAsk').replace('{x}', f.name),
      confirmLabel: t('tk_delFile'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/tickets/files/${f.id}`, undefined, 'DELETE');
      setFull((cur) => (cur ? { ...cur, files: cur.files.filter((y) => y.id !== f.id) } : cur));
    } catch {
      fail();
    }
  };

  const evText = (e: TicketEvent) => {
    const who = e.author || '—';
    return t(`tk_ev_${e.kind}`).replace('{who}', who);
  };
  const evDetail = (e: TicketEvent) => {
    if (e.kind === 'status' || e.kind === 'created') {
      const c = (s: string) => STATUS_COLOR[s as TicketStatus] ?? 'rgb(var(--w) / .5)';
      return (
        <span className="kh-tkt-ev__ft">
          {e.from && (
            <>
              <span style={{ color: c(e.from) }}>● </span>
              {statusLabel(t, e.from)}
              <span className="kh-tkt-ev__arrow">→</span>
            </>
          )}
          <span style={{ color: c(e.to) }}>● </span>
          {statusLabel(t, e.to)}
        </span>
      );
    }
    if (e.kind === 'priority')
      return (
        <span className="kh-tkt-ev__ft">
          {prioLabel(t, e.from)}
          <span className="kh-tkt-ev__arrow">→</span>
          {prioLabel(t, e.to)}
        </span>
      );
    if (e.kind === 'responsible')
      return (
        <span className="kh-tkt-ev__ft">
          {e.from || t('tk_noResp')}
          <span className="kh-tkt-ev__arrow">→</span>
          {e.to || t('tk_noResp')}
        </span>
      );
    return null;
  };
  const evColor = (e: TicketEvent) =>
    e.kind === 'status' || e.kind === 'created'
      ? (STATUS_COLOR[e.to as TicketStatus] ?? 'rgb(var(--w) / .5)')
      : e.kind === 'priority'
        ? (PRIORITY_COLOR[e.to as keyof typeof PRIORITY_COLOR] ?? 'rgb(var(--w) / .5)')
        : e.kind === 'comment'
          ? 'var(--accent)'
          : 'rgb(var(--w) / .55)';

  if (!x)
    return (
      <div className="kh-sap-pbody" aria-busy="true">
        <div className="kh-tkt-skel" />
      </div>
    );
  const late = overdue(x);
  const resolvedNow = RESOLVED_STATUSES.includes(x.status);
  const folderVal = x.sharedFolderId ? `sh:${x.sharedFolderId}` : (x.folderId ?? '');

  return (
    <>
      <div className="kh-sap-ptop">
        <span className="kh-tkt-ptop__when">
          <Ico d={I.clock} s={13} />
          {t('tk_openedAt').replace('{when}', when(x.openedAt))}
        </span>
        {sharedBy !== null && (
          <span className="kh-tkt-shmark" data-ro={!can || undefined}>
            <Ico d={I.share} s={12} />
            {(can ? t('tk_sharedEdit') : t('tk_readOnly')).replace('{who}', sharedBy)}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="kh-sap-ico"
          title={t('tk_copy')}
          aria-label={t('tk_copy')}
          onClick={() => {
            void navigator.clipboard?.writeText(`${x.number} ${x.summary}`).catch(() => {});
            toast({ message: t('copied') });
          }}
        >
          <Ico d={I.copy} s={15} />
        </button>
        {owner && (
          <button
            type="button"
            className="kh-sap-ico kh-sap-ico--del"
            title={t('del')}
            aria-label={t('del')}
            onClick={onRemove}
          >
            <Ico d={I.trash} s={16} />
          </button>
        )}
        <button
          type="button"
          className="kh-sap-ico kh-sap-ico--x"
          title={t('i_close')}
          aria-label={t('i_close')}
          onClick={onClose}
        >
          <Ico d={I.x} s={14} w={2} />
        </button>
      </div>
      <div
        className="kh-sap-pbody kh-tkt-pbody"
        data-drop={drag || undefined}
        onDragOver={(e) => {
          if (!can || !e.dataTransfer.types.includes('Files')) return;
          // images dropped on the notes go into the notes (the editor handles them)
          if ((e.target as Element).closest?.('.kh-tkt-doc')) return;
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false);
        }}
        onDrop={(e) => {
          if (!drag) return;
          e.preventDefault();
          setDrag(false);
          void uploadAll(e.dataTransfer.files);
        }}
      >
        <div className="kh-tkt-idrow">
          <label className="kh-tkt-num">
            <input
              value={x.number}
              maxLength={40}
              spellCheck={false}
              readOnly={!can}
              aria-label={t('tk_number')}
              aria-invalid={numErr || undefined}
              onChange={(e) => {
                const v = e.target.value;
                onLocal({ number: v });
                setNumErr(false);
                if (v.trim()) upd({ number: v }, 800);
              }}
            />
          </label>
          <ChipSelect
            value={x.status}
            options={STATUSES}
            label={t('tk_status')}
            disabled={!can}
            render={(s) => statusLabel(t, s)}
            colorOf={(s) => STATUS_COLOR[s]}
            onChange={setStatus}
          />
        </div>
        {numErr && (
          <em className="kh-tkt-err" role="alert">
            {t('tk_numberTaken')}
          </em>
        )}
        <textarea
          className="kh-tkt-summary"
          rows={2}
          value={x.summary}
          maxLength={300}
          readOnly={!can}
          placeholder={t('tk_summaryPh')}
          aria-label={t('tk_summary')}
          onChange={(e) => {
            const v = e.target.value.replace(/\n/g, ' ');
            onLocal({ summary: v });
            if (v.trim()) upd({ summary: v });
          }}
        />
        <div className="kh-sap-fld">
          <span>{t('tk_priority')}</span>
          <div className="kh-tkt-prios" role="radiogroup" aria-label={t('tk_priority')}>
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={x.priority === p}
                disabled={!can}
                style={
                  x.priority === p
                    ? {
                        background: PRIORITY_COLOR[p].replace(')', ' / .26)'),
                        borderColor: PRIORITY_COLOR[p],
                      }
                    : undefined
                }
                onClick={() => x.priority !== p && upd({ priority: p }, 0)}
              >
                <span className="kh-tkt-dot" style={{ background: PRIORITY_COLOR[p] }} />
                {prioLabel(t, p)}
              </button>
            ))}
          </div>
        </div>
        <div className="kh-sap-grid2">
          <label className="kh-sap-fld">
            <span>{t('tk_type')}</span>
            <select
              className="kh-sap-select"
              aria-label={t('tk_type')}
              value={x.typeId ?? ''}
              disabled={!can}
              onChange={(e) => upd({ typeId: e.target.value || null }, 0)}
            >
              <option value="">{t('tk_noType')}</option>
              {types.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </label>
          {owner ? (
            <label className="kh-sap-fld">
              <span>{t('tk_folder')}</span>
              <select
                className="kh-sap-select"
                aria-label={t('tk_folder')}
                value={folderVal}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.startsWith('sh:')) upd({ sharedFolderId: v.slice(3), folderId: null }, 0);
                  else upd({ folderId: v || null, sharedFolderId: null }, 0);
                }}
              >
                <option value="">{t('tk_noFolder')}</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
                {ownShared.map((f) => (
                  <option key={f.id} value={`sh:${f.id}`}>
                    {f.name} · {t('sh_shared')}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div />
          )}
          <div className="kh-sap-fld">
            <span>{t('tk_client')}</span>
            <PartyField
              label={t('tk_client')}
              value={x.clientName}
              linked={!!x.clientId}
              options={owner ? clients : []}
              disabled={!can}
              onPick={(o) => upd({ clientId: o.id, clientName: o.name }, 0)}
              onName={(n) => upd({ clientId: null, clientName: n }, 0)}
            />
          </div>
          <div className="kh-sap-fld">
            <span>{t('tk_resp')}</span>
            <PartyField
              label={t('tk_resp')}
              value={x.responsibleName}
              linked={!!x.responsibleId}
              options={owner ? people : []}
              disabled={!can}
              onPick={(o) => upd({ responsibleId: o.id, responsibleName: o.name }, 0)}
              onName={(n) => upd({ responsibleId: null, responsibleName: n }, 0)}
            />
          </div>
        </div>

        <fieldset className="kh-tkt-sec">
          <legend>{t('tk_parent')}</legend>
          <div className="kh-tkt-parent">
            <input
              className="kh-sap-input"
              data-mono
              value={x.parentNumber}
              maxLength={40}
              readOnly={!can}
              placeholder={t('tk_numberShort')}
              aria-label={t('tk_parentNo')}
              onChange={(e) => upd({ parentNumber: e.target.value })}
            />
            <input
              className="kh-sap-input"
              value={x.parentSummary}
              maxLength={300}
              readOnly={!can}
              placeholder={t('tk_summary')}
              aria-label={t('tk_parentDesc')}
              onChange={(e) => upd({ parentSummary: e.target.value })}
            />
          </div>
        </fieldset>

        <fieldset className="kh-tkt-sec">
          <legend>{t('tk_dates')}</legend>
          <div className="kh-tkt-dates">
            <label className="kh-sap-fld">
              <span>{t('tk_opened')}</span>
              <input
                className="kh-sap-input"
                type="datetime-local"
                value={toLocalInput(x.openedAt)}
                readOnly={!can}
                onChange={(e) => {
                  const v = fromLocalInput(e.target.value);
                  if (v) upd({ openedAt: v }, 0);
                }}
              />
            </label>
            <label className="kh-sap-fld">
              <span>{t('tk_due')}</span>
              <input
                className="kh-sap-input"
                type="date"
                data-late={late || undefined}
                value={x.dueOn ?? ''}
                readOnly={!can}
                onChange={(e) => upd({ dueOn: e.target.value || null }, 0)}
              />
              {late && <em className="kh-tkt-late">{t('tk_overdue')}</em>}
            </label>
            <label className="kh-sap-fld">
              <span>{t('tk_resolved')}</span>
              <input
                className="kh-sap-input"
                type="datetime-local"
                value={toLocalInput(x.resolvedAt)}
                disabled={!resolvedNow || !can}
                title={t('tk_resolvedAuto')}
                onChange={(e) => upd({ resolvedAt: fromLocalInput(e.target.value) }, 0)}
              />
            </label>
          </div>
        </fieldset>

        <div className="kh-sap-fld">
          <span>{t('tk_notes')}</span>
          {full && (
            <TicketNotes
              key={id}
              ticketId={id}
              doc={full.notesDoc}
              editable={can}
              onChange={(doc) => upd({ notesDoc: doc }, 800)}
            />
          )}
        </div>

        <div className="kh-tkt-files" aria-label={t('tk_files')} role="group">
          <div className="kh-cx__cap">
            <Ico d={I.clip} s={14} w={2} />
            {t('tk_files')}
            <span className="kh-cx__n">{full?.files.length || ''}</span>
            <div style={{ flex: 1 }} />
            {can && (
              <button
                type="button"
                className="kh-sap-ghost kh-tkt-attach"
                onClick={() => fileRef.current?.click()}
              >
                <Ico d={I.plus} s={13} w={2.4} />
                {t('tk_attach')}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              aria-label={t('tk_attach')}
              onChange={(e) => {
                if (e.target.files?.length) void uploadAll(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
          {busy && <div className="kh-tkt-busy">{t('tk_uploading').replace('{name}', busy)}</div>}
          {full && !full.files.length && !busy && <div className="kh-cx__empty">{t('tk_filesEmpty')}</div>}
          {full?.files.map((f) => (
            <div key={f.id} className="kh-tkt-file">
              <Ico d={I.file} s={16} />
              <a
                href={`${BASE}/api/v1/tickets/files/${f.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="kh-tkt-file__n"
                title={f.name}
              >
                {f.name}
              </a>
              <span className="kh-tkt-file__m">
                {fmtSize(f.size)} · {f.author || '—'} · {when(f.createdAt)}
              </span>
              <a
                className="kh-sap-ico"
                href={`${BASE}/api/v1/tickets/files/${f.id}?dl=1`}
                title={t('tk_download')}
                aria-label={`${t('tk_download')}: ${f.name}`}
              >
                <Ico d={I.down} s={15} />
              </a>
              {(f.mine || owner) && can && (
                <button
                  type="button"
                  className="kh-sap-ico kh-sap-ico--del"
                  title={t('tk_delFile')}
                  aria-label={`${t('tk_delFile')}: ${f.name}`}
                  onClick={() => void delFile(f)}
                >
                  <Ico d={I.trash} s={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="kh-tkt-hist" role="group" aria-label={t('tk_history')}>
          <div className="kh-cx__cap">
            <Ico d={I.clock} s={14} w={2} />
            {t('tk_history')}
            <span className="kh-cx__n">{full?.events.length || ''}</span>
          </div>
          {can && (
            <div className="kh-tkt-compose">
              <textarea
                className="kh-sap-input kh-sap-text"
                value={comment}
                maxLength={20000}
                placeholder={t('tk_commentPh')}
                aria-label={t('tk_commentPh')}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void addComment();
                }}
              />
              <button
                type="button"
                className="kh-sap-new"
                disabled={!comment.trim()}
                onClick={() => void addComment()}
              >
                <Ico d={I.comment} s={14} />
                {t('tk_comment')}
              </button>
            </div>
          )}
          <ol className="kh-tkt-tl">
            {(full?.events ?? [])
              .slice()
              .reverse()
              .map((e) => (
                <li key={e.id} className="kh-tkt-ev" data-kind={e.kind}>
                  <span className="kh-tkt-ev__dot" style={{ background: evColor(e) }} />
                  <div className="kh-tkt-ev__main">
                    <div className="kh-tkt-ev__head">
                      <span className="kh-tkt-ev__t">{evText(e)}</span>
                      <span className="kh-tkt-ev__at">{when(e.at)}</span>
                      {e.kind === 'comment' && e.mine && (
                        <button
                          type="button"
                          className="kh-tkt-ev__del"
                          title={t('tk_delComment')}
                          aria-label={t('tk_delComment')}
                          onClick={() => void delComment(e)}
                        >
                          <Ico d={I.x} s={11} w={2.4} />
                        </button>
                      )}
                    </div>
                    {evDetail(e)}
                    {e.kind === 'comment' && <div className="kh-tkt-ev__body">{e.body}</div>}
                  </div>
                </li>
              ))}
          </ol>
        </div>

        {owner && <Connections type="ticket" id={id} variant="section" transports />}
      </div>
    </>
  );
}
