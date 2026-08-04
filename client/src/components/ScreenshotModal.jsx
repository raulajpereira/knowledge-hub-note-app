import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useCounts } from '../context/CountsContext.jsx';
import { api } from '../api.js';
import Icon from './Icon.jsx';

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#111111', '#f5f5f5'];
const WIDTHS = [2, 4, 8, 14];
const FONT_SIZE = 22;
const LINE_HEIGHT_FACTOR = 1.3;
const optionStyle = { color: '#1a1a1a', background: '#fff' };

function newId() {
  return `el_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const rawLine of (text || '').split('\n')) {
    if (rawLine === '') { lines.push(''); continue; }
    const words = rawLine.split(' ');
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

function getBBox(el) {
  if (el.type === 'stroke') {
    const xs = el.points.map((p) => p.x);
    const ys = el.points.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
  }
  if (el.type === 'arrow') {
    const minX = Math.min(el.x1, el.x2);
    const minY = Math.min(el.y1, el.y2);
    return { x: minX, y: minY, width: Math.abs(el.x2 - el.x1), height: Math.abs(el.y2 - el.y1) };
  }
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}

export default function ScreenshotModal({ onClose }) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { refresh: refreshCounts } = useCounts();

  const [stage, setStage] = useState('idle'); // idle | capturing | annotate | saving
  const [error, setError] = useState('');
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(WIDTHS[1]);
  const [filled, setFilled] = useState(false);
  const [editingTextId, setEditingTextId] = useState(null);

  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const textareaElRef = useRef(null);
  const baseImageRef = useRef(null);
  const imgSizeRef = useRef({ width: 0, height: 0 });
  const displayScaleRef = useRef(1);
  const elementsRef = useRef([]);
  const historyRef = useRef([]);
  const draftRef = useRef(null);

  const supported = typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia;

  const capture = async () => {
    setError('');
    setStage('capturing');
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'never' } });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      if (video.readyState < 2) await new Promise((resolve) => { video.onloadedmetadata = resolve; });
      const w = video.videoWidth;
      const h = video.videoHeight;
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      off.getContext('2d').drawImage(video, 0, 0, w, h);
      stream.getTracks().forEach((tr) => tr.stop());
      stream = null;

      const img = new Image();
      img.src = off.toDataURL('image/png');
      await new Promise((resolve) => { img.onload = resolve; });
      baseImageRef.current = img;
      imgSizeRef.current = { width: w, height: h };
      elementsRef.current = [];
      historyRef.current = [];
      setEditingTextId(null);
      setStage('annotate');
    } catch (err) {
      stream?.getTracks().forEach((tr) => tr.stop());
      if (err?.name !== 'NotAllowedError') setError(t('screenshot.captureError'));
      setStage('idle');
    }
  };

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || stage !== 'annotate') return;
    const { width, height } = imgSizeRef.current;
    const maxW = wrap.clientWidth - 32;
    const maxH = wrap.clientHeight - 32;
    const scale = Math.min(1, maxW / width, maxH / height);
    displayScaleRef.current = scale;
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${width * scale}px`;
    canvas.style.height = `${height * scale}px`;
    draw();
  };

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  function drawArrowHead(ctx, x1, y1, x2, y2, size) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  function renderElement(ctx, el) {
    ctx.strokeStyle = el.color;
    ctx.fillStyle = el.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (el.type === 'stroke') {
      if (el.points.length === 0) return;
      if (el.points.length === 1) {
        const p = el.points[0];
        ctx.beginPath();
        ctx.arc(p.x, p.y, el.width / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.lineWidth = el.width;
      ctx.beginPath();
      ctx.moveTo(el.points[0].x, el.points[0].y);
      for (let i = 1; i < el.points.length; i++) ctx.lineTo(el.points[i].x, el.points[i].y);
      ctx.stroke();
      return;
    }
    if (el.type === 'rect') {
      ctx.lineWidth = el.strokeWidth;
      if (el.filled) ctx.fillRect(el.x, el.y, el.width, el.height);
      ctx.strokeRect(el.x, el.y, el.width, el.height);
      return;
    }
    if (el.type === 'ellipse') {
      ctx.lineWidth = el.strokeWidth;
      ctx.beginPath();
      ctx.ellipse(el.x + el.width / 2, el.y + el.height / 2, Math.abs(el.width) / 2, Math.abs(el.height) / 2, 0, 0, Math.PI * 2);
      if (el.filled) ctx.fill();
      ctx.stroke();
      return;
    }
    if (el.type === 'arrow') {
      ctx.lineWidth = el.strokeWidth;
      ctx.beginPath();
      ctx.moveTo(el.x1, el.y1);
      ctx.lineTo(el.x2, el.y2);
      ctx.stroke();
      drawArrowHead(ctx, el.x1, el.y1, el.x2, el.y2, 14 + el.strokeWidth);
      return;
    }
    if (el.type === 'text') {
      if (el.id === editingTextId) return;
      ctx.font = `700 ${el.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`;
      ctx.textBaseline = 'top';
      const lineHeight = el.fontSize * LINE_HEIGHT_FACTOR;
      wrapText(ctx, el.text || '', el.width).forEach((line, i) => ctx.fillText(line, el.x, el.y + i * lineHeight));
    }
  }

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas || !baseImageRef.current) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseImageRef.current, 0, 0, canvas.width, canvas.height);
    const list = draftRef.current ? [...elementsRef.current, draftRef.current] : elementsRef.current;
    for (const el of list) renderElement(ctx, el);
  }

  const toCanvasCoords = (clientX, clientY) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scale = displayScaleRef.current || 1;
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  };

  const pushHistory = () => {
    historyRef.current.push(elementsRef.current.map((e) => e));
    if (historyRef.current.length > 50) historyRef.current.shift();
  };

  const commitTextEdit = () => {
    if (!editingTextId) return;
    const el = elementsRef.current.find((e) => e.id === editingTextId);
    const ta = textareaElRef.current;
    if (el && ta) el.text = ta.value;
    const wasEmpty = el && !el.text?.trim();
    setEditingTextId(null);
    if (wasEmpty) elementsRef.current = elementsRef.current.filter((e) => e.id !== el.id);
    draw();
  };

  const startTextEdit = (id) => {
    setEditingTextId(id);
    setTimeout(() => textareaElRef.current?.focus(), 0);
  };

  const onPointerDown = (e) => {
    if (editingTextId) commitTextEdit();
    canvasRef.current.setPointerCapture(e.pointerId);
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);

    if (tool === 'text') {
      pushHistory();
      const el = { id: newId(), type: 'text', x, y, width: 320, height: 40, text: '', fontSize: FONT_SIZE, color };
      elementsRef.current.push(el);
      startTextEdit(el.id);
      draw();
      return;
    }
    if (tool === 'rect' || tool === 'ellipse' || tool === 'arrow') {
      pushHistory();
      draftRef.current = { id: newId(), type: tool, x1: x, y1: y, x2: x, y2: y, x, y, width: 0, height: 0, color, strokeWidth, filled };
      draw();
      return;
    }
    if (tool === 'eraser') {
      pushHistory();
      const radius = 16;
      elementsRef.current = elementsRef.current.filter((el) => !(el.type === 'stroke' && el.points.some((p) => Math.hypot(p.x - x, p.y - y) < radius)));
      draw();
      return;
    }
    if (tool === 'pen') {
      pushHistory();
      draftRef.current = { id: newId(), type: 'stroke', color, width: strokeWidth, points: [{ x, y }] };
      draw();
    }
  };

  const onPointerMove = (e) => {
    if (!draftRef.current) {
      if (tool === 'eraser' && e.buttons === 1) {
        const { x, y } = toCanvasCoords(e.clientX, e.clientY);
        const radius = 16;
        const before = elementsRef.current.length;
        elementsRef.current = elementsRef.current.filter((el) => !(el.type === 'stroke' && el.points.some((p) => Math.hypot(p.x - x, p.y - y) < radius)));
        if (elementsRef.current.length !== before) draw();
      }
      return;
    }
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);
    const d = draftRef.current;
    if (d.type === 'stroke') {
      d.points.push({ x, y });
    } else if (d.type === 'arrow') {
      d.x2 = x; d.y2 = y;
    } else {
      d.x2 = x; d.y2 = y;
      d.x = Math.min(d.x1, d.x2);
      d.y = Math.min(d.y1, d.y2);
      d.width = Math.abs(d.x2 - d.x1);
      d.height = Math.abs(d.y2 - d.y1);
    }
    draw();
  };

  const onPointerUp = () => {
    if (!draftRef.current) return;
    const d = draftRef.current;
    draftRef.current = null;
    if (d.type === 'stroke') {
      elementsRef.current.push(d);
    } else if (d.type === 'arrow' || d.width > 3 || d.height > 3) {
      elementsRef.current.push(d);
    }
    draw();
  };

  const undo = () => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    elementsRef.current = prev;
    draw();
  };

  const clearAnnotations = () => {
    pushHistory();
    elementsRef.current = [];
    draw();
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveAsNote = async () => {
    if (editingTextId) commitTextEdit();
    setStage('saving');
    try {
      const { width, height } = imgSizeRef.current;
      const flat = document.createElement('canvas');
      flat.width = width;
      flat.height = height;
      const ctx = flat.getContext('2d');
      ctx.drawImage(baseImageRef.current, 0, 0, width, height);
      for (const el of elementsRef.current) renderElement(ctx, el);
      const blob = await new Promise((resolve) => flat.toBlob(resolve, 'image/png'));
      const file = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' });
      const { url } = await api.uploadNoteImage(file);
      const title = t('screenshot.noteTitle', { date: new Date().toLocaleString() });
      const { note } = await api.createNote({ title, blocks: [{ id: newId(), type: 'image', url }] });
      refreshCounts();
      onClose();
      navigate('/notes', { state: { noteId: note.id } });
    } catch (err) {
      setError(err.message || t('screenshot.saveError'));
      setStage('annotate');
    }
  };

  const toolBtnStyle = (active) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 9, cursor: 'pointer',
    background: active ? theme.accent : theme.subtleBg, color: active ? '#fff' : theme.textPrimary, flexShrink: 0,
  });

  const editingEl = editingTextId ? elementsRef.current.find((e) => e.id === editingTextId) : null;
  const scale = displayScaleRef.current || 1;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        style={{
          width: '94vw', height: '92vh', maxWidth: 1500, background: theme.cardBg, borderRadius: 16, border: `1px solid ${theme.border}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${theme.border}` }}>
          <Icon name="camera" size={18} color={theme.accentText} />
          <div style={{ fontSize: 15, fontWeight: 800, color: theme.textPrimary }}>{t('screenshot.title')}</div>
          <div style={{ flex: 1 }} />
          {stage === 'annotate' && (
            <>
              <button
                onClick={capture}
                style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
              >
                {t('screenshot.recapture')}
              </button>
              <button
                onClick={saveAsNote}
                style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
              >
                {t('screenshot.saveAsNote')}
              </button>
            </>
          )}
          <span onClick={onClose} title={t('common.close')} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: theme.textMuted, marginLeft: 4, fontSize: 20, lineHeight: 1 }}>
            &times;
          </span>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {stage === 'annotate' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRight: `1px solid ${theme.border}`, width: 60, flexShrink: 0, overflowY: 'auto' }}>
              <span onClick={() => setTool('pen')} title={t('whiteboard.pen')} style={toolBtnStyle(tool === 'pen')}>
                <Icon name="edit" size={16} />
              </span>
              <span onClick={() => setTool('text')} title={t('whiteboard.text')} style={toolBtnStyle(tool === 'text')}>
                <Icon name="textTool" size={16} />
              </span>
              <span onClick={() => setTool('rect')} title={t('whiteboard.rectangle')} style={toolBtnStyle(tool === 'rect')}>
                <Icon name="square" size={16} />
              </span>
              <span onClick={() => setTool('ellipse')} title={t('whiteboard.ellipse')} style={toolBtnStyle(tool === 'ellipse')}>
                <Icon name="circleShape" size={16} />
              </span>
              <span onClick={() => setTool('arrow')} title={t('whiteboard.arrow')} style={toolBtnStyle(tool === 'arrow')}>
                <Icon name="arrowShape" size={16} />
              </span>
              <span onClick={() => setTool('eraser')} title={t('whiteboard.eraser')} style={toolBtnStyle(tool === 'eraser')}>
                <Icon name="trash" size={16} />
              </span>
              <div style={{ height: 1, background: theme.border, margin: '4px 0' }} />
              <span
                onClick={() => setFilled((v) => !v)}
                title={t('whiteboard.fill')}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 24, borderRadius: 6, cursor: 'pointer', background: filled ? theme.accentSoftBg : 'transparent' }}
              >
                <span style={{ width: 15, height: 15, borderRadius: 3, border: `1.5px solid ${theme.textPrimary}`, background: filled ? theme.textPrimary : 'transparent' }} />
              </span>
              <div style={{ height: 1, background: theme.border, margin: '4px 0' }} />
              {COLORS.map((c) => (
                <span
                  key={c}
                  onClick={() => setColor(c)}
                  style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', alignSelf: 'center', border: color === c ? `2px solid ${theme.accentText}` : `1px solid ${theme.border}` }}
                />
              ))}
              <div style={{ height: 1, background: theme.border, margin: '4px 0' }} />
              {WIDTHS.map((w) => (
                <span
                  key={w}
                  onClick={() => setStrokeWidth(w)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 24, borderRadius: 6, cursor: 'pointer', background: strokeWidth === w ? theme.accentSoftBg : 'transparent' }}
                >
                  <span style={{ width: Math.min(w, 16), height: Math.min(w, 16), borderRadius: '50%', background: theme.textPrimary }} />
                </span>
              ))}
              <div style={{ height: 1, background: theme.border, margin: '4px 0' }} />
              <span onClick={undo} title={t('whiteboard.undo')} style={toolBtnStyle(false)}>
                <Icon name="undo" size={16} />
              </span>
              <span onClick={clearAnnotations} title={t('whiteboard.clear')} style={toolBtnStyle(false)}>
                <Icon name="trash" size={16} />
              </span>
            </div>
          )}

          <div ref={wrapRef} style={{ flex: 1, position: 'relative', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: theme.dark ? '#14171f' : '#f4f4f6' }}>
            {stage === 'idle' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 30, textAlign: 'center' }}>
                {!supported ? (
                  <div style={{ fontSize: 13.5, color: theme.textMuted, maxWidth: 340 }}>{t('screenshot.unsupported')}</div>
                ) : (
                  <>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: theme.accentSoftBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="camera" size={28} color={theme.accentText} />
                    </div>
                    <div style={{ fontSize: 13.5, color: theme.textMuted, maxWidth: 340 }}>{t('screenshot.intro')}</div>
                    <button
                      onClick={capture}
                      style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 22px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
                    >
                      {t('screenshot.capture')}
                    </button>
                    {error && <div style={{ fontSize: 12.5, color: 'oklch(0.6 0.2 25)' }}>{error}</div>}
                  </>
                )}
              </div>
            )}

            {stage === 'capturing' && <div style={{ color: theme.textMuted, fontSize: 13.5 }}>{t('screenshot.waitingPermission')}</div>}
            {stage === 'saving' && <div style={{ color: theme.textMuted, fontSize: 13.5 }}>{t('screenshot.savingNote')}</div>}

            {stage === 'annotate' && (
              <>
                <canvas
                  ref={canvasRef}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  style={{ display: 'block', touchAction: 'none', cursor: tool === 'eraser' ? 'cell' : tool === 'text' ? 'text' : 'crosshair', boxShadow: '0 8px 30px rgba(0,0,0,0.35)' }}
                />
                {editingTextId && editingEl && (() => {
                  const wrap = wrapRef.current?.getBoundingClientRect();
                  const canvasRect = canvasRef.current?.getBoundingClientRect();
                  if (!canvasRect) return null;
                  const left = canvasRect.left - (wrap?.left || 0) + editingEl.x * scale;
                  const top = canvasRect.top - (wrap?.top || 0) + editingEl.y * scale;
                  return (
                    <textarea
                      ref={textareaElRef}
                      defaultValue={editingEl.text}
                      onBlur={commitTextEdit}
                      onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); }}
                      style={{
                        position: 'absolute', left, top, width: Math.max(editingEl.width * scale, 80), minHeight: 32,
                        font: `700 ${editingEl.fontSize * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`,
                        color: editingEl.color, background: 'transparent', border: `1.5px dashed ${theme.accent}`, outline: 'none',
                        resize: 'none', padding: 2, lineHeight: `${LINE_HEIGHT_FACTOR}em`, overflow: 'hidden',
                      }}
                    />
                  );
                })()}
              </>
            )}

            {error && stage === 'annotate' && (
              <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', background: 'oklch(0.55 0.18 25)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 12.5 }}>
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
