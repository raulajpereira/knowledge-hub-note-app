import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function seededBars(seed, count = 24) {
  let x = 0;
  for (let i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) % 1000;
  const bars = [];
  for (let i = 0; i < count; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    bars.push(6 + (x % 1000) / 1000 * 22);
  }
  return bars;
}

export default function Voice() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const location = useLocation();
  const [voiceNotes, setVoiceNotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [titleDraft, setTitleDraft] = useState('');

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startRef = useRef(0);

  const load = async () => {
    const { voiceNotes } = await api.listVoiceNotes();
    setVoiceNotes(voiceNotes);
    setLoading(false);
  };

  useEffect(() => {
    load();
    return () => clearInterval(timerRef.current);
  }, []);

  const filtered = useMemo(
    () => voiceNotes.filter((v) => !search.trim() || v.title.toLowerCase().includes(search.toLowerCase())),
    [voiceNotes, search]
  );

  const selected = voiceNotes.find((v) => v.id === selectedId) || filtered[0] || null;

  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  useEffect(() => {
    if (location.state?.voiceId) setSelectedId(location.state.voiceId);
  }, [location.state]);

  useEffect(() => {
    setTitleDraft(selected?.title ?? '');
  }, [selected?.id]);

  const commitTitle = async () => {
    if (!selected || titleDraft === selected.title) return;
    const { voiceNote } = await api.updateVoiceNote(selected.id, { title: titleDraft });
    setVoiceNotes((prev) => prev.map((v) => (v.id === voiceNote.id ? voiceNote : v)));
    setTitleDraft(voiceNote.title);
  };

  const startRecording = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const duration = Math.round((Date.now() - startRef.current) / 1000);
        const title = `Recording ${new Date().toLocaleString()}`;
        const { voiceNote } = await api.uploadVoiceNote(blob, title, duration);
        setVoiceNotes((prev) => [voiceNote, ...prev]);
        setSelectedId(voiceNote.id);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      startRef.current = Date.now();
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(Math.round((Date.now() - startRef.current) / 1000)), 250);
      setRecording(true);
    } catch (err) {
      setError(t('voice.micDenied'));
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    clearInterval(timerRef.current);
    setRecording(false);
  };

  const patch = async (id, payload) => {
    const { voiceNote } = await api.updateVoiceNote(id, payload);
    setVoiceNotes((prev) => prev.map((v) => (v.id === id ? voiceNote : v)));
  };

  const remove = async () => {
    if (!selected) return;
    await api.trashVoiceNote(selected.id);
    setVoiceNotes((prev) => prev.filter((v) => v.id !== selected.id));
    setSelectedId(null);
  };

  if (loading) return <div style={{ padding: 28, color: theme.textMuted }}>{t('common.loading')}</div>;

  return (
    <div style={{ padding: '24px 28px', flex: 1, display: 'flex', gap: 24, minHeight: 0 }}>
      <div style={{ flex: '1 1 320px', minWidth: 280, maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '9px 12px' }}>
          <span style={{ opacity: 0.5, display: 'flex' }}>
            <Icon name="search" size={15} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('voice.searchPlaceholder')}
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, flex: 1, minWidth: 0, color: theme.textPrimary }}
          />
        </div>
        <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 8, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {filtered.length === 0 && <div style={{ padding: 14, fontSize: 13, color: theme.textMuted }}>{t('voice.noRecordingsYet')}</div>}
          {filtered.map((v) => (
            <div
              key={v.id}
              onClick={() => setSelectedId(v.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', background: selected?.id === v.id ? theme.accentSoftBg : 'transparent' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.title}</div>
                <div style={{ fontSize: 11.5, color: theme.textMuted }}>
                  {new Date(v.createdAt).toLocaleDateString()} · {formatDuration(v.duration)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 24, flexShrink: 0 }}>
                {seededBars(v.id, 10).map((h, i) => (
                  <div key={i} style={{ width: 2, height: h, borderRadius: 1, background: `linear-gradient(180deg, ${theme.accent}, ${theme.accentDark})` }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: '1 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
        <div style={{ background: `linear-gradient(135deg, ${theme.accentDark}, ${theme.accent})`, borderRadius: 16, padding: 24, display: 'flex', alignItems: 'center', gap: 20, color: '#fff' }}>
          <button
            onClick={recording ? stopRecording : startRecording}
            style={{
              width: 64, height: 64, borderRadius: '50%', background: recording ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.2)',
              border: recording ? '2px solid #fff' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
            }}
          >
            <Icon name={recording ? 'check' : 'mic'} size={26} color="#fff" />
          </button>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{recording ? t('voice.recording') : t('voice.tapToRecord')}</div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>{recording ? formatDuration(elapsed) : t('voice.captureMemo')}</div>
            {error && <div style={{ fontSize: 12, marginTop: 4, color: '#fff' }}>{error}</div>}
          </div>
        </div>

        {selected ? (
          <div style={{ flex: 1, minHeight: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 18, fontWeight: 800, color: theme.textPrimary }}
              />
              <button onClick={remove} style={{ background: 'transparent', border: '1px solid oklch(0.55 0.18 25 / 0.35)', color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                {t('common.delete')}
              </button>
            </div>
            <div style={{ fontSize: 12.5, color: theme.textMuted }}>
              {new Date(selected.createdAt).toLocaleString()} · {formatDuration(selected.duration)}
            </div>
            <audio controls src={selected.audioUrl} style={{ width: '100%' }} />
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{t('voice.notes')}</div>
              <textarea
                value={selected.notes || ''}
                onChange={(e) => patch(selected.id, { notes: e.target.value })}
                rows={6}
                placeholder={t('voice.notesPlaceholder')}
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: 10, fontSize: 13.5, lineHeight: 1.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
            {t('voice.recordFirst')}
          </div>
        )}
      </div>
    </div>
  );
}
