import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useCounts } from '../context/CountsContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { backdropClose } from '../lib/backdropClose.js';
import { useIsMobile } from '../lib/useIsMobile.js';

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
  const confirm = useConfirm();
  const { refresh: refreshCounts } = useCounts();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [voiceNotes, setVoiceNotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState('');
  const [suggestedTasks, setSuggestedTasks] = useState(null);
  const [creatingTasks, setCreatingTasks] = useState(false);

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
    if (!isMobile && !selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [filtered, selectedId, isMobile]);

  const mobileShowDetail = isMobile && !!selectedId;

  useEffect(() => {
    if (location.state?.voiceId) setSelectedId(location.state.voiceId);
  }, [location.state]);

  useEffect(() => {
    setTitleDraft(selected?.title ?? '');
    setTranscribeError('');
    setSuggestError('');
    setSuggestedTasks(null);
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
        refreshCounts();
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

  const transcribe = async () => {
    if (!selected) return;
    setTranscribing(true);
    setTranscribeError('');
    try {
      const { text } = await api.transcribeVoiceNote(selected.id);
      const merged = selected.notes?.trim() ? `${selected.notes}\n\n${text}` : text;
      await patch(selected.id, { notes: merged });
    } catch (err) {
      setTranscribeError(err.message || t('voice.transcribeFailed'));
    } finally {
      setTranscribing(false);
    }
  };

  const suggestTasks = async () => {
    if (!selected) return;
    setSuggesting(true);
    setSuggestError('');
    try {
      const { tasks } = await api.suggestTasksFromVoiceNote(selected.id);
      setSuggestedTasks(tasks.map((task) => ({ ...task, include: true })));
    } catch (err) {
      setSuggestError(err.message || t('voice.suggestFailed'));
    } finally {
      setSuggesting(false);
    }
  };

  const createSuggestedTasks = async () => {
    const toCreate = suggestedTasks.filter((task) => task.include && task.title.trim());
    if (toCreate.length === 0) return setSuggestedTasks(null);
    setCreatingTasks(true);
    try {
      await Promise.all(toCreate.map((task) => api.createTask({ title: task.title.trim(), due: task.due || undefined })));
      refreshCounts();
      setSuggestedTasks(null);
    } finally {
      setCreatingTasks(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    const ok = await confirm({ message: t('common.confirmTrashMessage') });
    if (!ok) return;
    await api.trashVoiceNote(selected.id);
    setVoiceNotes((prev) => prev.filter((v) => v.id !== selected.id));
    setSelectedId(null);
    refreshCounts();
  };

  if (loading) return <div style={{ padding: 28, color: theme.textMuted }}>{t('common.loading')}</div>;

  const recordBanner = (
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
  );

  return (
    <div style={{ padding: isMobile ? 14 : '24px 28px', flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 12 : 24, minHeight: 0 }}>
      {isMobile && !mobileShowDetail && recordBanner}
      {(!isMobile || !mobileShowDetail) && (
      <div style={{ flex: isMobile ? '1 1 auto' : '1 1 320px', minWidth: isMobile ? 0 : 280, maxWidth: isMobile ? 'none' : 380, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
      )}

      {(!isMobile || mobileShowDetail) && (
      <div style={{ flex: isMobile ? '1 1 auto' : '1 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
        {!isMobile && recordBanner}

        {selected ? (
          <div style={{ flex: 1, minHeight: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
              {isMobile && (
                <span onClick={() => setSelectedId(null)} style={{ display: 'flex', cursor: 'pointer', color: theme.textMuted, transform: 'rotate(180deg)', flexShrink: 0 }}>
                  <Icon name="chevron" size={18} />
                </span>
              )}
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                style={{ flex: '1 1 160px', minWidth: 160, border: 'none', outline: 'none', background: 'transparent', fontSize: 18, fontWeight: 800, color: theme.textPrimary }}
              />
              <span onClick={() => patch(selected.id, { favorite: !selected.favorite })} style={{ display: 'flex', cursor: 'pointer', flexShrink: 0 }}>
                <Icon name="pin" size={17} color={selected.favorite ? theme.accentText : theme.textMuted} />
              </span>
              <button
                onClick={transcribe}
                disabled={transcribing}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: theme.subtleBg, border: 'none', color: theme.textPrimary, borderRadius: 8, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0, opacity: transcribing ? 0.6 : 1 }}
              >
                <Icon name="sparkle" size={13} color={theme.accentText} />
                {transcribing ? t('voice.transcribing') : t('voice.transcribe')}
              </button>
              <button onClick={remove} style={{ background: 'transparent', border: '1px solid oklch(0.55 0.18 25 / 0.35)', color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                {t('common.delete')}
              </button>
            </div>
            <div style={{ fontSize: 12.5, color: theme.textMuted }}>
              {new Date(selected.createdAt).toLocaleString()} · {formatDuration(selected.duration)}
            </div>
            {transcribeError && <div style={{ fontSize: 12, color: 'oklch(0.55 0.18 25)' }}>{transcribeError}</div>}
            <audio controls src={selected.audioUrl} style={{ width: '100%' }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('voice.notes')}</div>
                <button
                  onClick={suggestTasks}
                  disabled={suggesting || !selected.notes?.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: theme.accentText, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', opacity: suggesting || !selected.notes?.trim() ? 0.5 : 1, padding: 0 }}
                >
                  <Icon name="sparkle" size={12} color={theme.accentText} />
                  {suggesting ? t('voice.suggesting') : t('voice.suggestTasks')}
                </button>
              </div>
              <textarea
                value={selected.notes || ''}
                onChange={(e) => patch(selected.id, { notes: e.target.value })}
                rows={6}
                placeholder={t('voice.notesPlaceholder')}
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: 10, fontSize: 13.5, lineHeight: 1.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
              />
              {suggestError && <div style={{ fontSize: 12, color: 'oklch(0.55 0.18 25)', marginTop: 6 }}>{suggestError}</div>}
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
            {t('voice.recordFirst')}
          </div>
        )}
      </div>
      )}

      {suggestedTasks && (
        <div
          onMouseDown={backdropClose(() => setSuggestedTasks(null))}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 460, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
              borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 800 }}>{t('voice.suggestedTasksTitle')}</div>
            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: -8 }}>{t('voice.suggestedTasksDesc')}</div>

            {suggestedTasks.length === 0 && (
              <div style={{ fontSize: 13, color: theme.textMuted, padding: '8px 0' }}>{t('voice.noTasksFound')}</div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {suggestedTasks.map((task, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={task.include}
                    onChange={(e) => setSuggestedTasks((prev) => prev.map((t2, i2) => (i2 === i ? { ...t2, include: e.target.checked } : t2)))}
                    style={{ flexShrink: 0, width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <input
                    value={task.title}
                    onChange={(e) => setSuggestedTasks((prev) => prev.map((t2, i2) => (i2 === i ? { ...t2, title: e.target.value } : t2)))}
                    style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
                  />
                  <input
                    type="date"
                    value={task.due || ''}
                    onChange={(e) => setSuggestedTasks((prev) => prev.map((t2, i2) => (i2 === i ? { ...t2, due: e.target.value } : t2)))}
                    style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: '7px 8px', fontSize: 12, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', flexShrink: 0 }}
                  />
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={() => setSuggestedTasks(null)}
                style={{ flex: 1, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={createSuggestedTasks}
                disabled={creatingTasks || suggestedTasks.filter((t2) => t2.include).length === 0}
                style={{
                  flex: 1, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', opacity: creatingTasks || suggestedTasks.filter((t2) => t2.include).length === 0 ? 0.5 : 1,
                }}
              >
                {creatingTasks ? t('voice.creatingTasks') : t('voice.createTasks')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
