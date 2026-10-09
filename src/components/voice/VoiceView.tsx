'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api, isApiFailure } from '@/lib/client/api';
import { COL_DEFAULTS, COL_LIMITS } from '@/lib/prefs';
import { useConfirm, usePersistentState, useToast } from '@/components/ui';
import { usePref } from '@/components/shell/PrefsProvider';
import { useShell } from '@/components/shell/ShellContext';
import { refreshCounts } from '@/components/shell/counts';
import { ColHandle } from '@/components/content/ColHandle';
import { Connections } from '@/components/content/Connections';
import { useDraft } from '@/components/content/useDraft';
import { useWhen } from '@/components/content/useWhen';
import { AiButton } from '@/components/ai/AiButton';
import { aiError, useAi } from '@/components/ai/useAi';
import './voice.css';

// ZNotes.dc.html `isVoice`: recordings list · recorder + player, transcript
// (typed by hand — no automatic transcription in this release), notes, links.

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
type Kind = 'mic' | 'pc';
type Voice = {
  id: string;
  title: string;
  kind: Kind;
  durationMs: number;
  levels: number[];
  transcript: string;
  notes: string;
  pinned: boolean;
  mime: string;
  createdAt: string;
};
type Cols = { side?: number; list?: number; insp?: number };

/** Prototype fmtT: 4:12 */
const fmtT = (s: number) => {
  const x = Math.max(0, Math.floor(s));
  return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`;
};
/** Prototype resample: max per bucket, 0.1–1. */
const resample = (arr: number[], n: number) => {
  if (!arr.length) return Array<number>(n).fill(0.15);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * arr.length) / n);
    const b = Math.max(a + 1, Math.floor(((i + 1) * arr.length) / n));
    let m = 0;
    for (let j = a; j < b && j < arr.length; j++) m = Math.max(m, arr[j]!);
    out.push(Math.max(0.1, Math.min(1, m)));
  }
  return out;
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const extOf = (mime: string) =>
  mime === 'audio/mp4' ? 'm4a' : mime === 'audio/mpeg' ? 'mp3' : mime.split('/')[1];

const MicIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M6 11a6 6 0 0 0 12 0" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);
const PcIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <line x1="8" y1="20" x2="16" y2="20" />
    <line x1="12" y1="16" x2="12" y2="20" />
  </svg>
);
const PinIcon = ({ size, fill, sw }: { size: number; fill: string; sw?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke={sw ? 'currentColor' : 'none'}
    strokeWidth={sw}
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M15 3l6 6-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z" />
  </svg>
);

type RecSession = {
  kind: Kind;
  stream: MediaStream;
  mr: MediaRecorder;
  ctx: AudioContext;
  tick: ReturnType<typeof setInterval>;
  levels: number[];
  chunks: Blob[];
  t0: number;
};

/** Prototype vStartRec / vFinishRec, uploading the recording when it stops. */
function Recorder({ onSaved }: { onSaved: (v: Voice) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [kind, setKind] = useState<Kind | null>(null);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [live, setLive] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const sess = useRef<RecSession | null>(null);

  const finish = useCallback(
    (save: boolean) => {
      const s = sess.current;
      if (!s) return;
      sess.current = null;
      clearInterval(s.tick);
      const dur = Math.max(1, (Date.now() - s.t0) / 1000);
      s.mr.onstop = async () => {
        s.stream.getTracks().forEach((tr) => tr.stop());
        void s.ctx.close();
        if (!save || !s.chunks.length) return;
        const blob = new Blob(s.chunks, { type: s.mr.mimeType || 'audio/webm' });
        if (blob.size > 25 * 1024 * 1024) return toast({ message: t('vc_tooBig'), tone: 'error' });
        const d = new Date();
        const p2 = (n: number) => String(n).padStart(2, '0');
        const stamp = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}, ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
        const form = new FormData();
        form.append('audio', blob);
        form.append(
          'meta',
          JSON.stringify({
            title: `${t('v_recName')} ${stamp}`,
            kind: s.kind,
            durationMs: Math.round(dur * 1000),
            levels: resample(s.levels, 72),
          }),
        );
        setSaving(true);
        try {
          const res = await fetch(`${BASE}/api/v1/voice`, {
            method: 'POST',
            body: form,
            credentials: 'same-origin',
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw { code: data?.error?.code };
          onSaved(data.voice as Voice);
        } catch (e) {
          const code = (e as { code?: string }).code;
          toast({
            message: t(
              code === 'limit_reached'
                ? 'vc_limit'
                : code === 'file_too_large'
                  ? 'vc_tooBig'
                  : 'vc_uploadFail',
            ),
            tone: 'error',
          });
        } finally {
          setSaving(false);
        }
      };
      if (s.mr.state !== 'inactive') s.mr.stop();
      else void s.mr.onstop?.(new Event('stop'));
      setKind(null);
      setLive([]);
    },
    [onSaved, t, toast],
  );

  useEffect(() => () => finish(false), [finish]);

  const start = async (k: Kind) => {
    setError('');
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices) return setError(t('vc_noSupport'));
    let stream: MediaStream;
    try {
      if (k === 'mic') stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      else {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        if (!stream.getAudioTracks().length) {
          stream.getTracks().forEach((tr) => tr.stop());
          return setError(t('v_errNoAudio'));
        }
      }
    } catch {
      return setError(t(k === 'mic' ? 'v_errMic' : 'v_errPc'));
    }
    const audio = new MediaStream(stream.getAudioTracks());
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) =>
      MediaRecorder.isTypeSupported(m),
    );
    const mr = new MediaRecorder(audio, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    ctx.createMediaStreamSource(audio).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const levels: number[] = [];
    const t0 = Date.now();
    const tick = setInterval(() => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const b of buf) {
        const v = (b - 128) / 128;
        sum += v * v;
      }
      levels.push(Math.min(1, Math.sqrt(sum / buf.length) * 4));
      setElapsed((Date.now() - t0) / 1000);
      setLive(levels.slice(-40));
    }, 80);
    sess.current = { kind: k, stream, mr, ctx, tick, levels, chunks, t0 };
    mr.start(250);
    // Ending the screen share (browser bar) stops and saves, like the prototype.
    stream.getTracks().forEach((tr) => (tr.onended = () => finish(true)));
    setKind(k);
    setElapsed(0);
    setLive([]);
  };

  return (
    <div className="kh-vc-rec">
      {!kind ? (
        <>
          <div className="kh-vc-rec__head">
            <div className="kh-vc-rec__title">{t('v_newTitle')}</div>
            <div className="kh-vc-rec__desc">{t('v_newDesc')}</div>
          </div>
          <div className="kh-vc-rec__btns">
            <button
              type="button"
              className="kh-vc-btn kh-vc-btn--main"
              disabled={saving}
              onClick={() => void start('mic')}
            >
              <MicIcon size={17} /> {t('v_recMic')}
            </button>
            <button type="button" className="kh-vc-btn" disabled={saving} onClick={() => void start('pc')}>
              <PcIcon size={17} /> {t('v_recPc')}
            </button>
          </div>
          {error && <div className="kh-vc-rec__err">{error}</div>}
        </>
      ) : (
        <>
          <div className="kh-vc-rec__live">
            <span className="kh-vc-rec__dot" />
            <div className="kh-vc-rec__time">
              <div>{t(kind === 'pc' ? 'v_recordingPc' : 'v_recordingMic')}</div>
              <div>{fmtT(elapsed)}</div>
            </div>
            <div className="kh-vc-rec__bars" aria-hidden="true">
              {Array.from({ length: 40 }, (_, i) => (
                <div key={i} style={{ height: pct(Math.max(0.08, live[live.length - 40 + i] ?? 0)) }} />
              ))}
            </div>
          </div>
          <div className="kh-vc-rec__btns kh-vc-rec__btns--rec">
            <button type="button" className="kh-vc-btn kh-vc-btn--main" onClick={() => finish(true)}>
              <span className="kh-vc-rec__stop" />
              {t('v_stop')}
            </button>
            <button type="button" className="kh-vc-btn kh-vc-btn--ghost" onClick={() => finish(false)}>
              {t('v_cancel')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Detail({
  v,
  onPatch,
  onDelete,
}: {
  v: Voice;
  onPatch: (p: Partial<Voice>) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const when = useWhen();
  const toast = useToast();
  const router = useRouter();
  const { modules } = useShell();
  const { ai, ready } = useAi();
  const [aiBusy, setAiBusy] = useState<'' | 'tr' | 'mt'>('');
  const [title, setTitle, flushTitle] = useDraft(v.title, (x) => onPatch({ title: x }));
  const [transcript, setTranscript, flushTr] = useDraft(v.transcript, (x) => onPatch({ transcript: x }), 700);
  const [notes, setNotes, flushNotes] = useDraft(v.notes, (x) => onPatch({ notes: x }), 700);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [copied, setCopied] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const dur = v.durationMs / 1000;

  // The recording is fetched once as a blob: seeking works even for WebM files without cues.
  useEffect(() => {
    let live = true;
    let obj: string | null = null;
    const el = audio;
    fetch(`${BASE}/api/v1/voice/${v.id}/audio`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (!live || !b) return;
        obj = URL.createObjectURL(b);
        setUrl(obj);
      })
      .catch(() => {});
    return () => {
      live = false;
      el.current?.pause();
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [v.id]);

  const seek = (s: number) => {
    const p = Math.max(0, Math.min(dur, s));
    if (audio.current) audio.current.currentTime = p;
    setPos(p);
  };
  const play = () => {
    const a = audio.current;
    if (!a) return;
    if (playing) return a.pause();
    if (pos >= dur - 0.05) seek(0);
    a.playbackRate = speed;
    void a.play();
  };
  const bars = resample(v.levels, 72);
  const frac = dur ? pos / dur : 0;

  return (
    <div className="kh-vc-detail">
      <div className="kh-vc-detail__top">
        <div className="kh-vc-detail__head">
          <input
            className="kh-vc-title"
            value={title}
            maxLength={300}
            aria-label={t('v_recName')}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={flushTitle}
          />
          <div className="kh-vc-meta">
            <span className="kh-vc-src">
              {v.kind === 'mic' ? <MicIcon size={13} /> : <PcIcon size={13} />}
              {t(v.kind === 'mic' ? 'v_mic' : 'v_pc')}
            </span>
            <span className="kh-vc-meta__t">
              {t('createdAt')} {when(v.createdAt, true)} · {fmtT(dur)}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="kh-vc-round"
          title={v.pinned ? t('v_unpin') : t('v_pin')}
          aria-label={v.pinned ? t('v_unpin') : t('v_pin')}
          aria-pressed={v.pinned}
          style={{ background: v.pinned ? 'rgba(255,255,255,.24)' : undefined }}
          onClick={() => onPatch({ pinned: !v.pinned })}
        >
          <PinIcon size={16} sw={1.8} fill={v.pinned ? 'currentColor' : 'none'} />
        </button>
        <button
          type="button"
          className="kh-vc-round"
          style={{ color: '#ffc9b8' }}
          title={t('del')}
          aria-label={t('del')}
          onClick={onDelete}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 7h16" />
            <path d="M9 7V4h6v3" />
            <path d="M6 7l1 13h10l1-13" />
          </svg>
        </button>
      </div>

      <div className="kh-vc-player">
        {url && (
          <audio
            ref={audio}
            src={url}
            preload="auto"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              setPlaying(false);
              setPos(dur);
            }}
            onTimeUpdate={(e) => setPos(Math.min(dur, e.currentTarget.currentTime))}
          />
        )}
        <div
          className="kh-vc-wave"
          role="slider"
          tabIndex={0}
          aria-label={t('v_speed')}
          aria-valuemin={0}
          aria-valuemax={Math.round(dur)}
          aria-valuenow={Math.round(pos)}
          onClick={(e) => {
            const b = e.currentTarget.getBoundingClientRect();
            seek(((e.clientX - b.left) / b.width) * dur);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') seek(pos - 5);
            else if (e.key === 'ArrowRight') seek(pos + 5);
          }}
        >
          {bars.map((x, i) => (
            <div
              key={i}
              style={{
                height: pct(x),
                background: (i + 0.5) / bars.length <= frac ? '#fbf8f5' : 'rgba(255,248,240,.28)',
              }}
            />
          ))}
        </div>
        <div className="kh-vc-ctrl">
          <button type="button" className="kh-vc-skip" title="-10s" onClick={() => seek(pos - 10)}>
            -10
          </button>
          <button
            type="button"
            className="kh-vc-play"
            disabled={!url}
            aria-label={t(playing ? 'vc_pause' : 'vc_play')}
            onClick={play}
          >
            {playing ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="6" y="4.5" width="4" height="15" rx="1" />
                <rect x="14" y="4.5" width="4" height="15" rx="1" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M7 4.5v15l13-7.5z" />
              </svg>
            )}
          </button>
          <button type="button" className="kh-vc-skip" title="+10s" onClick={() => seek(pos + 10)}>
            +10
          </button>
          <span className="kh-vc-pos">
            {fmtT(pos)} <span>/ {fmtT(dur)}</span>
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="kh-vc-speed"
            title={t('v_speed')}
            onClick={() => {
              const sp = [1, 1.25, 1.5, 2];
              const n = sp[(sp.indexOf(speed) + 1) % sp.length]!;
              if (audio.current) audio.current.playbackRate = n;
              setSpeed(n);
            }}
          >
            {speed}×
          </button>
          {url && (
            <a
              className="kh-vc-round"
              href={url}
              download={`${(v.title || 'gravacao').replace(/[^\w\- ]+/g, '_')}.${extOf(v.mime)}`}
              title={t('v_download')}
              aria-label={t('v_download')}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 4v11" />
                <path d="M7 10l5 5 5-5" />
                <path d="M5 20h14" />
              </svg>
            </a>
          )}
        </div>
      </div>

      <div className="kh-vc-field">
        <div className="kh-vc-field__row">
          <div className="kh-vc-lbl">{t('v_transcript')}</div>
          {ready && ai?.audio && (
            <AiButton
              label={transcript.trim() ? t('ai_retranscribe') : t('ai_transcribe')}
              busy={aiBusy === 'tr'}
              disabled={!!aiBusy}
              onClick={async () => {
                setAiBusy('tr');
                try {
                  const r = await api<{ transcript: string }>(`/ai/voice/${v.id}`, { action: 'transcribe' });
                  setTranscript(r.transcript);
                } catch (e) {
                  toast({ message: aiError(t, e), tone: 'error' });
                } finally {
                  setAiBusy('');
                }
              }}
            />
          )}
          {ready && modules.has('meetings') && (
            <AiButton
              label={t('ai_toMeeting')}
              busy={aiBusy === 'mt'}
              disabled={!!aiBusy || (!transcript.trim() && !ai?.audio)}
              title={!transcript.trim() && !ai?.audio ? t('ai_toMeetingNeedsTr') : t('ai_toMeeting')}
              onClick={async () => {
                flushTr();
                setAiBusy('mt');
                try {
                  const r = await api<{ meeting: { id: string } }>(`/ai/voice/${v.id}`, {
                    action: 'meeting',
                  });
                  toast({ message: t('ai_meetingMade'), tone: 'success' });
                  router.push(`/app/meetings?m=${r.meeting.id}`);
                } catch (e) {
                  toast({ message: aiError(t, e), tone: 'error' });
                } finally {
                  setAiBusy('');
                }
              }}
            />
          )}
          {transcript.trim() && (
            <button
              type="button"
              className="kh-vc-copy"
              onClick={() => {
                void navigator.clipboard?.writeText(transcript).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? t('copied') : t('copy')}
            </button>
          )}
        </div>
        <textarea
          className="kh-vc-text kh-vc-text--tr"
          value={transcript}
          placeholder={t('vc_transPh')}
          aria-label={t('v_transcript')}
          maxLength={100000}
          onChange={(e) => setTranscript(e.target.value)}
          onBlur={flushTr}
        />
      </div>

      <div className="kh-vc-field">
        <div className="kh-vc-lbl">{t('v_notes')}</div>
        <textarea
          className="kh-vc-text"
          value={notes}
          placeholder={t('v_notesPh')}
          aria-label={t('v_notes')}
          maxLength={20000}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={flushNotes}
        />
      </div>

      <Connections type="voice" id={v.id} variant="section" />
    </div>
  );
}

export function VoiceView() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const { focus } = useShell();
  const when = useWhen();
  const [filter, setFilter] = usePersistentState<'all' | Kind>('voice.filter', 'all');
  const [cols, setCols] = usePref<Cols>('cols', {});
  const [liveList, setLiveList] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Voice[] | null>(null);
  const activeId = sp.get('v');

  const open = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(sp.toString());
      if (id) next.set('v', id);
      else next.delete('v');
      router.replace(`${path}${next.size ? `?${next}` : ''}`, { scroll: false });
    },
    [path, router, sp],
  );

  useEffect(() => {
    api<{ voice: Voice[] }>('/voice')
      .then((r) => setItems(r.voice))
      .catch(() => setItems([]));
  }, []);

  const all = useMemo(() => items ?? [], [items]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all
      .filter(
        (v) =>
          (filter === 'all' || v.kind === filter) &&
          (!s || v.title.toLowerCase().includes(s) || v.transcript.toLowerCase().includes(s)),
      )
      .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [all, filter, q]);
  const active = all.find((v) => v.id === activeId) ?? null;

  useEffect(() => {
    if (!items) return;
    if (activeId && !active) open(null);
    else if (!activeId && list[0]) open(list[0].id);
  }, [items, activeId, active, list, open]);

  const patch = async (id: string, p: Partial<Voice>) => {
    setItems((cur) => cur && cur.map((x) => (x.id === id ? { ...x, ...p } : x)));
    try {
      await api(`/voice/${id}`, p, 'PATCH');
    } catch (e) {
      toast({ message: t(isApiFailure(e) ? 'ne_saveFail' : 'ne_saveFail'), tone: 'error' });
    }
  };

  const remove = async () => {
    if (!active) return;
    const ok = await confirm({
      title: t('tr_askTitle'),
      body: t('tr_askBody').replace('{x}', active.title),
      confirmLabel: t('tr_move'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/voice/${active.id}`, undefined, 'DELETE');
    } catch {
      toast({ message: t('ui_delFail'), tone: 'error' });
      return;
    }
    const idx = list.findIndex((x) => x.id === active.id);
    const rest = list.filter((x) => x.id !== active.id);
    setItems((cur) => cur && cur.filter((x) => x.id !== active.id));
    open(rest[Math.min(idx, rest.length - 1)]?.id ?? null);
    refreshCounts();
  };

  const listW = liveList ?? cols.list ?? COL_DEFAULTS.list;

  return (
    <div
      className="kh-vc"
      style={{ gridTemplateColumns: focus ? 'minmax(0,1fr)' : `${listW}px minmax(0,1fr)` }}
    >
      {!focus && (
        <ColHandle
          style={{ left: listW }}
          value={listW}
          limits={COL_LIMITS.list}
          dir={1}
          onLive={setLiveList}
          onDone={(w) => setCols({ ...cols, list: w })}
          onReset={() => setCols({ ...cols, list: COL_DEFAULTS.list })}
        />
      )}
      {!focus && (
        <section className="kh-vc-list">
          <label className="kh-vc-search">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,248,240,.6)"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.5" y2="16.5" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('v_search')}
              aria-label={t('v_search')}
            />
          </label>
          <div className="kh-vc-filters">
            {(
              [
                ['all', 'v_all'],
                ['mic', 'v_mic'],
                ['pc', 'v_pc'],
              ] as const
            ).map(([id, k]) => (
              <button
                key={id}
                type="button"
                data-on={filter === id || undefined}
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
              >
                {t(k)}
              </button>
            ))}
          </div>
          <div className="kh-vc-items">
            {list.map((v) => {
              const on = v.id === activeId;
              return (
                <button
                  key={v.id}
                  type="button"
                  className="kh-vc-item"
                  data-on={on || undefined}
                  onClick={() => open(v.id)}
                >
                  <span className="kh-vc-item__ic">{v.kind === 'mic' ? <MicIcon /> : <PcIcon />}</span>
                  <span className="kh-vc-item__body">
                    <span className="kh-vc-item__title">
                      {v.pinned && <PinIcon size={11} fill="currentColor" />}
                      <span>{v.title}</span>
                    </span>
                    <span className="kh-vc-item__meta">
                      {when(v.createdAt, true).split(',')[0]} · {fmtT(v.durationMs / 1000)}
                    </span>
                  </span>
                  <span className="kh-vc-item__mini" aria-hidden="true">
                    {resample(v.levels, 14).map((x, i) => (
                      <span key={i} style={{ height: pct(x) }} />
                    ))}
                  </span>
                </button>
              );
            })}
            {items && list.length === 0 && <div className="kh-vc-empty">{t('v_empty')}</div>}
          </div>
        </section>
      )}
      <div className="kh-vc-right">
        <Recorder
          onSaved={(v) => {
            setItems((cur) => [v, ...(cur ?? [])]);
            if (filter !== 'all' && filter !== v.kind) setFilter('all');
            open(v.id);
            refreshCounts();
          }}
        />
        <section className="kh-vc-pane">
          {active ? (
            <Detail
              key={active.id}
              v={active}
              onPatch={(p) => void patch(active.id, p)}
              onDelete={() => void remove()}
            />
          ) : (
            <div className="kh-vc-none">{items ? t('v_noActive') : ''}</div>
          )}
        </section>
      </div>
    </div>
  );
}
