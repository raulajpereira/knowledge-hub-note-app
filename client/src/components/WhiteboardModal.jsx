import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { useClickOutside } from '../lib/useClickOutside.js';

const COLORS = ['#f5f5f5', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];
const WIDTHS = [2, 4, 8, 14];

function emptyScene() {
  return { strokes: [], viewport: { x: 0, y: 0, scale: 1 } };
}

export default function WhiteboardModal({ onClose }) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const confirm = useConfirm();

  const [boards, setBoards] = useState([]);
  const [boardId, setBoardId] = useState(null);
  const [boardName, setBoardName] = useState('');
  const [loading, setLoading] = useState(true);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [, forceRender] = useState(0);
  const rerender = () => forceRender((v) => v + 1);

  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const sceneRef = useRef(emptyScene());
  const historyRef = useRef([]); // snapshots of strokes[] for undo
  const drawingRef = useRef(null); // in-progress stroke
  const panningRef = useRef(null); // { startX, startY, originX, originY }
  const saveTimerRef = useRef(null);
  const switcherRef = useRef(null);
  useClickOutside(switcherRef, () => setSwitcherOpen(false), switcherOpen);

  const loadBoards = async () => {
    const { boards } = await api.listWhiteboards();
    setBoards(boards);
    return boards;
  };

  const openBoard = async (id) => {
    setLoading(true);
    const { board } = await api.getWhiteboard(id);
    sceneRef.current = board.data && board.data.strokes ? board.data : emptyScene();
    historyRef.current = [];
    setBoardId(board.id);
    setBoardName(board.name);
    setLoading(false);
    rerender();
  };

  useEffect(() => {
    (async () => {
      const list = await loadBoards();
      if (list.length > 0) {
        await openBoard(list[0].id);
      } else {
        const { board } = await api.createWhiteboard({ name: t('whiteboard.boardNameDefault') });
        setBoards([board]);
        await openBoard(board.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = wrap.clientWidth * dpr;
    canvas.height = wrap.clientHeight * dpr;
    canvas.style.width = `${wrap.clientWidth}px`;
    canvas.style.height = `${wrap.clientHeight}px`;
    draw();
  };

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const { viewport, strokes } = sceneRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = theme.dark ? '#14171f' : '#f4f4f6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * viewport.scale, 0, 0, dpr * viewport.scale, dpr * viewport.x, dpr * viewport.y);

    // subtle dot grid, screen-space-consistent so it always looks "infinite"
    const gridSize = 40;
    const startX = Math.floor(-viewport.x / viewport.scale / gridSize) * gridSize;
    const startY = Math.floor(-viewport.y / viewport.scale / gridSize) * gridSize;
    const endX = startX + (canvas.width / dpr / viewport.scale) + gridSize;
    const endY = startY + (canvas.height / dpr / viewport.scale) + gridSize;
    ctx.fillStyle = theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    for (let gx = startX; gx < endX; gx += gridSize) {
      for (let gy = startY; gy < endY; gy += gridSize) {
        ctx.beginPath();
        ctx.arc(gx, gy, 1.4 / viewport.scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const allStrokes = drawingRef.current ? [...strokes, drawingRef.current] : strokes;
    for (const stroke of allStrokes) {
      if (stroke.points.length === 0) continue;
      ctx.strokeStyle = stroke.color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (stroke.points.length === 1) {
        const p = stroke.points[0];
        ctx.fillStyle = stroke.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (stroke.width * (0.4 + 0.6 * p.pressure)) / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      for (let i = 1; i < stroke.points.length; i++) {
        const a = stroke.points[i - 1];
        const b = stroke.points[i];
        ctx.lineWidth = stroke.width * (0.4 + 0.6 * ((a.pressure + b.pressure) / 2));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  useEffect(draw, [loading, theme.dark]);

  const scheduleSave = () => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (!boardId) return;
      api.updateWhiteboard(boardId, { data: sceneRef.current });
    }, 700);
  };

  const toLogical = (clientX, clientY) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const { viewport } = sceneRef.current;
    return {
      x: (clientX - rect.left - viewport.x) / viewport.scale,
      y: (clientY - rect.top - viewport.y) / viewport.scale,
    };
  };

  const eraseAt = (x, y) => {
    const radius = 14 / sceneRef.current.viewport.scale;
    const before = sceneRef.current.strokes.length;
    sceneRef.current.strokes = sceneRef.current.strokes.filter((s) => !s.points.some((p) => Math.hypot(p.x - x, p.y - y) < radius));
    if (sceneRef.current.strokes.length !== before) {
      draw();
      scheduleSave();
    }
  };

  const pushHistory = () => {
    historyRef.current.push(sceneRef.current.strokes.map((s) => s));
    if (historyRef.current.length > 50) historyRef.current.shift();
  };

  const onPointerDown = (e) => {
    canvasRef.current.setPointerCapture(e.pointerId);
    if (tool === 'pan' || e.button === 1) {
      panningRef.current = { startX: e.clientX, startY: e.clientY, originX: sceneRef.current.viewport.x, originY: sceneRef.current.viewport.y };
      return;
    }
    const { x, y } = toLogical(e.clientX, e.clientY);
    if (tool === 'eraser') {
      pushHistory();
      eraseAt(x, y);
      return;
    }
    if (tool === 'pen') {
      pushHistory();
      const pressure = e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5;
      drawingRef.current = { id: `s${Date.now()}`, tool: 'pen', color, width, points: [{ x, y, pressure }] };
      draw();
    }
  };

  const onPointerMove = (e) => {
    if (panningRef.current) {
      const dx = e.clientX - panningRef.current.startX;
      const dy = e.clientY - panningRef.current.startY;
      sceneRef.current.viewport.x = panningRef.current.originX + dx;
      sceneRef.current.viewport.y = panningRef.current.originY + dy;
      draw();
      return;
    }
    const { x, y } = toLogical(e.clientX, e.clientY);
    if (tool === 'eraser' && e.buttons === 1) {
      eraseAt(x, y);
      return;
    }
    if (drawingRef.current) {
      const pressure = e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5;
      drawingRef.current.points.push({ x, y, pressure });
      draw();
    }
  };

  const onPointerUp = () => {
    if (panningRef.current) {
      panningRef.current = null;
      scheduleSave();
      return;
    }
    if (drawingRef.current) {
      sceneRef.current.strokes.push(drawingRef.current);
      drawingRef.current = null;
      draw();
      scheduleSave();
    }
  };

  const onWheel = (e) => {
    e.preventDefault();
    const { viewport } = sceneRef.current;
    if (e.ctrlKey || e.metaKey) {
      const rect = canvasRef.current.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.01);
      const newScale = Math.min(4, Math.max(0.15, viewport.scale * factor));
      viewport.x = cx - ((cx - viewport.x) / viewport.scale) * newScale;
      viewport.y = cy - ((cy - viewport.y) / viewport.scale) * newScale;
      viewport.scale = newScale;
    } else {
      viewport.x -= e.deltaX;
      viewport.y -= e.deltaY;
    }
    draw();
    scheduleSave();
  };

  const zoomBy = (factor) => {
    const canvas = canvasRef.current;
    const { viewport } = sceneRef.current;
    const cx = canvas.clientWidth / 2;
    const cy = canvas.clientHeight / 2;
    const newScale = Math.min(4, Math.max(0.15, viewport.scale * factor));
    viewport.x = cx - ((cx - viewport.x) / viewport.scale) * newScale;
    viewport.y = cy - ((cy - viewport.y) / viewport.scale) * newScale;
    viewport.scale = newScale;
    draw();
    scheduleSave();
  };

  const undo = () => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    sceneRef.current.strokes = prev;
    draw();
    scheduleSave();
  };

  const clearBoard = async () => {
    const ok = await confirm({ message: t('whiteboard.confirmClear') });
    if (!ok) return;
    pushHistory();
    sceneRef.current.strokes = [];
    draw();
    scheduleSave();
  };

  const createBoard = async () => {
    const { board } = await api.createWhiteboard({ name: t('whiteboard.boardNameDefault') });
    setBoards((prev) => [board, ...prev]);
    setSwitcherOpen(false);
    await openBoard(board.id);
  };

  const commitName = async () => {
    if (!boardId) return;
    const { board } = await api.updateWhiteboard(boardId, { name: boardName });
    setBoardName(board.name);
    setBoards((prev) => prev.map((b) => (b.id === board.id ? { ...b, name: board.name } : b)));
  };

  const archiveBoard = async () => {
    if (!boardId) return;
    await api.updateWhiteboard(boardId, { archived: true });
    const list = await loadBoards();
    setSwitcherOpen(false);
    if (list.length > 0) await openBoard(list[0].id);
    else {
      const { board } = await api.createWhiteboard({ name: t('whiteboard.boardNameDefault') });
      setBoards([board]);
      await openBoard(board.id);
    }
  };

  const deleteBoard = async (id) => {
    const ok = await confirm({ message: t('whiteboard.confirmDelete') });
    if (!ok) return;
    await api.deleteWhiteboard(id);
    const list = await loadBoards();
    if (id === boardId) {
      if (list.length > 0) await openBoard(list[0].id);
      else {
        const { board } = await api.createWhiteboard({ name: t('whiteboard.boardNameDefault') });
        setBoards([board]);
        await openBoard(board.id);
      }
    }
  };

  const toolBtnStyle = (active) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 9, cursor: 'pointer',
    background: active ? theme.accent : theme.subtleBg, color: active ? '#fff' : theme.textPrimary, flexShrink: 0,
  });

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        style={{
          width: '94vw', height: '92vh', maxWidth: 1600, background: theme.cardBg, borderRadius: 16, border: `1px solid ${theme.border}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${theme.border}` }}>
          <Icon name="whiteboard" size={18} color={theme.accentText} />
          <div ref={switcherRef} style={{ position: 'relative' }}>
            <div
              onClick={() => setSwitcherOpen((v) => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 8px', borderRadius: 8, background: theme.subtleBg }}
            >
              <input
                value={boardName}
                onChange={(e) => setBoardName(e.target.value)}
                onBlur={commitName}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontWeight: 800, color: theme.textPrimary, width: 200 }}
              />
              <Icon name="chevron" size={13} color={theme.textMuted} />
            </div>
            {switcherOpen && (
              <div
                style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20, width: 260,
                  background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
                  borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,0.3)', padding: 8, display: 'flex', flexDirection: 'column', gap: 2,
                  maxHeight: 320, overflowY: 'auto',
                }}
              >
                {boards.map((b) => (
                  <div
                    key={b.id}
                    onClick={() => { setSwitcherOpen(false); openBoard(b.id); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 7, cursor: 'pointer',
                      background: b.id === boardId ? theme.accentSoftBg : 'transparent', color: b.id === boardId ? theme.accentText : theme.textPrimary,
                    }}
                  >
                    <Icon name="whiteboard" size={13} />
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
                    <span
                      onClick={(e) => { e.stopPropagation(); setSwitcherOpen(false); deleteBoard(b.id); }}
                      style={{ display: 'flex', color: theme.textMuted, flexShrink: 0 }}
                    >
                      <Icon name="trash" size={12} />
                    </span>
                  </div>
                ))}
                <div onClick={createBoard} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 7, cursor: 'pointer', color: theme.accentText, fontWeight: 700, fontSize: 12.5 }}>
                  <Icon name="plus" size={13} /> {t('whiteboard.newBoard')}
                </div>
              </div>
            )}
          </div>

          <div style={{ flex: 1 }} />

          <span onClick={archiveBoard} title={t('whiteboard.archive')} style={{ display: 'flex', cursor: 'pointer', color: theme.textMuted }}>
            <Icon name="archive" size={17} />
          </span>
          <span onClick={() => boardId && deleteBoard(boardId)} title={t('whiteboard.delete')} style={{ display: 'flex', cursor: 'pointer', color: theme.textMuted }}>
            <Icon name="trash" size={17} />
          </span>
          <span onClick={onClose} title={t('common.close')} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: theme.textMuted, marginLeft: 4, fontSize: 20, lineHeight: 1 }}>
            &times;
          </span>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRight: `1px solid ${theme.border}`, width: 60, flexShrink: 0, overflowY: 'auto' }}>
            <span onClick={() => setTool('pen')} title={t('whiteboard.pen')} style={toolBtnStyle(tool === 'pen')}>
              <Icon name="edit" size={16} />
            </span>
            <span onClick={() => setTool('eraser')} title={t('whiteboard.eraser')} style={toolBtnStyle(tool === 'eraser')}>
              <Icon name="trash" size={16} />
            </span>
            <span onClick={() => setTool('pan')} title={t('whiteboard.pan')} style={toolBtnStyle(tool === 'pan')}>
              <Icon name="focus" size={16} />
            </span>
            <div style={{ height: 1, background: theme.border, margin: '4px 0' }} />
            {COLORS.map((c) => (
              <span
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', alignSelf: 'center',
                  border: color === c ? `2px solid ${theme.accentText}` : `1px solid ${theme.border}`,
                }}
              />
            ))}
            <div style={{ height: 1, background: theme.border, margin: '4px 0' }} />
            {WIDTHS.map((w) => (
              <span
                key={w}
                onClick={() => setWidth(w)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 24, borderRadius: 6, cursor: 'pointer',
                  background: width === w ? theme.accentSoftBg : 'transparent',
                }}
              >
                <span style={{ width: Math.min(w, 16), height: Math.min(w, 16), borderRadius: '50%', background: theme.textPrimary }} />
              </span>
            ))}
            <div style={{ height: 1, background: theme.border, margin: '4px 0' }} />
            <span onClick={undo} title={t('whiteboard.undo')} style={toolBtnStyle(false)}>
              <Icon name="undo" size={16} />
            </span>
            <span onClick={clearBoard} title={t('whiteboard.clear')} style={toolBtnStyle(false)}>
              <Icon name="trash" size={16} />
            </span>
            <div style={{ flex: 1 }} />
            <span onClick={() => zoomBy(1.25)} title={t('whiteboard.zoomIn')} style={toolBtnStyle(false)}>
              <Icon name="plus" size={16} />
            </span>
            <span onClick={() => zoomBy(0.8)} title={t('whiteboard.zoomOut')} style={{ ...toolBtnStyle(false), fontSize: 18, fontWeight: 700 }}>
              &minus;
            </span>
          </div>

          <div ref={wrapRef} style={{ flex: 1, position: 'relative', minWidth: 0 }}>
            {loading ? (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
                {t('common.loading')}
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onPointerLeave={onPointerUp}
                onWheel={onWheel}
                style={{ display: 'block', touchAction: 'none', cursor: tool === 'pan' ? 'grab' : tool === 'eraser' ? 'cell' : 'crosshair' }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
