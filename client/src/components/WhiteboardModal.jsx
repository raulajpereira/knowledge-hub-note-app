import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { useClickOutside } from '../lib/useClickOutside.js';

const COLORS = ['#f5f5f5', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];
const WIDTHS = [2, 4, 8, 14];
const optionStyle = { color: '#1a1a1a', background: '#fff' };
const FONT_FAMILIES = { sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif", serif: 'Georgia, serif', mono: "ui-monospace, 'JetBrains Mono', monospace" };
const FONT_SIZES = [14, 18, 24, 32];
const HANDLE_HIT_PX = 9;
const LINE_HEIGHT_FACTOR = 1.3;

function emptyScene() {
  return { elements: [], viewport: { x: 0, y: 0, scale: 1 } };
}

function normalizeScene(data) {
  if (!data) return emptyScene();
  if (Array.isArray(data.elements)) return { elements: data.elements, viewport: data.viewport || { x: 0, y: 0, scale: 1 } };
  if (Array.isArray(data.strokes)) {
    // Fase 7 v1 boards only stored freehand strokes — lift them into the new typed-element model.
    return { elements: data.strokes.map((s) => ({ ...s, type: 'stroke' })), viewport: data.viewport || { x: 0, y: 0, scale: 1 } };
  }
  return emptyScene();
}

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

function fontString(el) {
  const family = FONT_FAMILIES[el.fontFamily] || FONT_FAMILIES.sans;
  const weight = el.bold ? '700' : '400';
  const style = el.italic ? 'italic' : 'normal';
  return `${style} ${weight} ${el.fontSize || 18}px ${family}`;
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

export default function WhiteboardModal({ onClose }) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { lang } = useLanguage();
  const confirm = useConfirm();
  const navigate = useNavigate();

  // Position offset from the modal's default centered spot — reset to
  // (0, 0) on every mount, so the popup always opens centered, and only
  // moves away from center while the header is actively being dragged.
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef(null);

  const startHeaderDrag = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    dragStateRef.current = { startX: e.clientX, startY: e.clientY, origin: dragOffset };
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return undefined;
    const onMove = (e) => {
      const st = dragStateRef.current;
      if (!st) return;
      setDragOffset({ x: st.origin.x + (e.clientX - st.startX), y: st.origin.y + (e.clientY - st.startY) });
    };
    const onUp = () => {
      dragStateRef.current = null;
      setDragging(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [dragging]);

  const [boards, setBoards] = useState([]);
  const [boardId, setBoardId] = useState(null);
  const [boardName, setBoardName] = useState('');
  const [loading, setLoading] = useState(true);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [tool, setTool] = useState('select');
  const [color, setColor] = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(WIDTHS[1]);
  const [filled, setFilled] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [editingTextId, setEditingTextId] = useState(null);
  const [cardPickerOpen, setCardPickerOpen] = useState(false);
  const [cardPickerTab, setCardPickerTab] = useState('notes');
  const [cardPickerSearch, setCardPickerSearch] = useState('');
  const [cardPickerNotes, setCardPickerNotes] = useState(null);
  const [cardPickerTasks, setCardPickerTasks] = useState(null);
  const [, forceRender] = useState(0);
  const rerender = () => forceRender((v) => v + 1);

  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const textareaElRef = useRef(null);
  const sceneRef = useRef(emptyScene());
  const historyRef = useRef([]);
  const draftRef = useRef(null); // in-progress stroke/shape being drawn
  const dragRef = useRef(null); // active select-tool move/resize
  const panningRef = useRef(null);
  const saveTimerRef = useRef(null);
  const switcherRef = useRef(null);
  const cardPickerRef = useRef(null);
  const initedRef = useRef(false);
  useClickOutside(switcherRef, () => setSwitcherOpen(false), switcherOpen);
  useClickOutside(cardPickerRef, () => setCardPickerOpen(false), cardPickerOpen);

  const selectedEl = useMemo(() => sceneRef.current.elements.find((e) => e.id === selectedId) || null, [selectedId, boardId]);

  const loadBoards = async () => {
    const { boards } = await api.listWhiteboards();
    setBoards(boards);
    return boards;
  };

  const commitTextEdit = () => {
    if (!editingTextId) return;
    const el = sceneRef.current.elements.find((e) => e.id === editingTextId);
    const ta = textareaElRef.current;
    if (el && ta) el.text = ta.value;
    setEditingTextId(null);
    draw();
    scheduleSave();
  };

  const openBoard = async (id) => {
    if (editingTextId) commitTextEdit();
    setLoading(true);
    const { board } = await api.getWhiteboard(id);
    sceneRef.current = normalizeScene(board.data);
    historyRef.current = [];
    setSelectedId(null);
    setBoardId(board.id);
    setBoardName(board.name);
    setLoading(false);
    rerender();
  };

  useEffect(() => {
    if (initedRef.current) return; // guards against StrictMode's double-invoke in dev creating two default boards
    initedRef.current = true;
    (async () => {
      const list = await loadBoards();
      if (list.length > 0) await openBoard(list[0].id);
      else {
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

  function drawArrowHead(ctx, x1, y1, x2, y2, size) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  function renderElement(ctx, el, scale) {
    ctx.strokeStyle = el.color;
    ctx.fillStyle = el.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (el.type === 'stroke') {
      if (el.points.length === 0) return;
      if (el.points.length === 1) {
        const p = el.points[0];
        ctx.beginPath();
        ctx.arc(p.x, p.y, (el.width * (0.4 + 0.6 * p.pressure)) / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      for (let i = 1; i < el.points.length; i++) {
        const a = el.points[i - 1];
        const b = el.points[i];
        ctx.lineWidth = el.width * (0.4 + 0.6 * ((a.pressure + b.pressure) / 2));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
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
      drawArrowHead(ctx, el.x1, el.y1, el.x2, el.y2, 12 / scale + el.strokeWidth);
      return;
    }

    if (el.type === 'text') {
      if (el.id === editingTextId) return; // live textarea overlay shows this one instead
      ctx.font = fontString(el);
      ctx.textBaseline = 'top';
      const lineHeight = (el.fontSize || 18) * LINE_HEIGHT_FACTOR;
      const lines = wrapText(ctx, el.text || '', el.width);
      lines.forEach((line, i) => ctx.fillText(line, el.x, el.y + i * lineHeight));
      return;
    }

    if (el.type === 'card') {
      const r = 10;
      ctx.fillStyle = theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
      ctx.strokeStyle = theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(el.x, el.y, el.width, el.height, r);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = el.entityType === 'task' ? '#22c55e' : '#a855f7';
      ctx.beginPath();
      ctx.arc(el.x + 16, el.y + el.height / 2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = theme.dark ? '#f5f5f5' : '#1a1a1a';
      ctx.font = `600 14px ${FONT_FAMILIES.sans}`;
      ctx.textBaseline = 'middle';
      const lines = wrapText(ctx, el.title || '', el.width - 40);
      ctx.fillText(lines[0] || '', el.x + 28, el.y + el.height / 2);
    }
  }

  function drawHandles(ctx, el, scale) {
    const box = getBBox(el);
    ctx.fillStyle = theme.accent;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5 / scale;
    const r = 5 / scale;
    ctx.setLineDash([]);
    ctx.strokeStyle = theme.accent;
    ctx.strokeRect(box.x - 2 / scale, box.y - 2 / scale, box.width + 4 / scale, box.height + 4 / scale);
    if (el.type === 'arrow') {
      for (const [hx, hy] of [[el.x1, el.y1], [el.x2, el.y2]]) {
        ctx.beginPath();
        ctx.arc(hx, hy, r, 0, Math.PI * 2);
        ctx.fillStyle = theme.accent;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      }
      return;
    }
    if (el.type === 'stroke') return;
    const corners = [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]];
    for (const [hx, hy] of corners) {
      ctx.fillStyle = theme.accent;
      ctx.fillRect(hx - r, hy - r, r * 2, r * 2);
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(hx - r, hy - r, r * 2, r * 2);
    }
  }

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const { viewport, elements } = sceneRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = theme.dark ? '#14171f' : '#f4f4f6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * viewport.scale, 0, 0, dpr * viewport.scale, dpr * viewport.x, dpr * viewport.y);

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

    const list = draftRef.current ? [...elements, draftRef.current] : elements;
    for (const el of list) renderElement(ctx, el, viewport.scale);

    if (selectedId && !draftRef.current) {
      const el = elements.find((e) => e.id === selectedId);
      if (el) drawHandles(ctx, el, viewport.scale);
    }
  }

  useEffect(draw, [loading, theme.dark, selectedId, editingTextId]);

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
    return { x: (clientX - rect.left - viewport.x) / viewport.scale, y: (clientY - rect.top - viewport.y) / viewport.scale };
  };

  const eraseAt = (x, y) => {
    const radius = 14 / sceneRef.current.viewport.scale;
    const before = sceneRef.current.elements.length;
    sceneRef.current.elements = sceneRef.current.elements.filter((el) => !(el.type === 'stroke' && el.points.some((p) => Math.hypot(p.x - x, p.y - y) < radius)));
    if (sceneRef.current.elements.length !== before) {
      draw();
      scheduleSave();
    }
  };

  const pushHistory = () => {
    historyRef.current.push(sceneRef.current.elements.map((e) => e));
    if (historyRef.current.length > 50) historyRef.current.shift();
  };

  // Rects/ellipses with no fill are only "solid" along their outline — a click
  // in the empty middle should fall through to whatever card/element is underneath.
  const pointNearRectBorder = (el, x, y, threshold) => {
    const inner = { x: el.x + threshold, y: el.y + threshold, width: el.width - 2 * threshold, height: el.height - 2 * threshold };
    const inOuter = x >= el.x - threshold && x <= el.x + el.width + threshold && y >= el.y - threshold && y <= el.y + el.height + threshold;
    const inInner = x >= inner.x && x <= inner.x + inner.width && y >= inner.y && y <= inner.y + inner.height;
    return inOuter && !inInner;
  };

  const pointNearEllipseBorder = (el, x, y, threshold) => {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const rx = Math.abs(el.width) / 2;
    const ry = Math.abs(el.height) / 2;
    if (rx < 1 || ry < 1) return false;
    const rxOuter = rx + threshold, ryOuter = ry + threshold;
    const rxInner = Math.max(0, rx - threshold), ryInner = Math.max(0, ry - threshold);
    const normOuter = ((x - cx) / rxOuter) ** 2 + ((y - cy) / ryOuter) ** 2;
    const normInner = rxInner > 0 && ryInner > 0 ? ((x - cx) / rxInner) ** 2 + ((y - cy) / ryInner) ** 2 : Infinity;
    return normOuter <= 1 && normInner >= 1;
  };

  const hitTestElement = (x, y) => {
    const { elements } = sceneRef.current;
    const threshold = 8 / sceneRef.current.viewport.scale;
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (el.type === 'stroke') {
        for (const p of el.points) if (Math.hypot(p.x - x, p.y - y) < threshold) return el.id;
        continue;
      }
      if (el.type === 'arrow') {
        const { x1, y1, x2, y2 } = el;
        const len2 = (x2 - x1) ** 2 + (y2 - y1) ** 2 || 1;
        let tt = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / len2;
        tt = Math.max(0, Math.min(1, tt));
        const px = x1 + tt * (x2 - x1);
        const py = y1 + tt * (y2 - y1);
        if (Math.hypot(px - x, py - y) < threshold) return el.id;
        continue;
      }
      if (el.type === 'rect') {
        if (el.filled) {
          if (x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height) return el.id;
        } else if (pointNearRectBorder(el, x, y, threshold)) return el.id;
        continue;
      }
      if (el.type === 'ellipse') {
        if (el.filled) {
          const cx = el.x + el.width / 2, cy = el.y + el.height / 2;
          const rx = Math.abs(el.width) / 2, ry = Math.abs(el.height) / 2;
          if (rx > 0 && ry > 0 && ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) return el.id;
        } else if (pointNearEllipseBorder(el, x, y, threshold)) return el.id;
        continue;
      }
      const box = getBBox(el);
      if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) return el.id;
    }
    return null;
  };

  const hitTestHandle = (x, y, el) => {
    const threshold = HANDLE_HIT_PX / sceneRef.current.viewport.scale;
    if (el.type === 'arrow') {
      if (Math.hypot(x - el.x1, y - el.y1) < threshold) return 'start';
      if (Math.hypot(x - el.x2, y - el.y2) < threshold) return 'end';
      return null;
    }
    if (el.type === 'stroke') return null;
    const box = getBBox(el);
    const corners = { nw: [box.x, box.y], ne: [box.x + box.width, box.y], sw: [box.x, box.y + box.height], se: [box.x + box.width, box.y + box.height] };
    for (const [name, [hx, hy]] of Object.entries(corners)) if (Math.hypot(x - hx, y - hy) < threshold) return name;
    return null;
  };

  const startTextEdit = (id) => {
    setSelectedId(id);
    setEditingTextId(id);
    setTimeout(() => textareaElRef.current?.focus(), 0);
  };

  const onPointerDown = (e) => {
    if (editingTextId) commitTextEdit();
    canvasRef.current.setPointerCapture(e.pointerId);
    if (e.button === 1) {
      panningRef.current = { startX: e.clientX, startY: e.clientY, originX: sceneRef.current.viewport.x, originY: sceneRef.current.viewport.y };
      return;
    }
    const { x, y } = toLogical(e.clientX, e.clientY);

    if (tool === 'select') {
      if (selectedId) {
        const el = sceneRef.current.elements.find((el2) => el2.id === selectedId);
        if (el) {
          const handle = hitTestHandle(x, y, el);
          if (handle) {
            pushHistory();
            dragRef.current = { mode: 'resize', handle, startX: x, startY: y, orig: JSON.parse(JSON.stringify(el)) };
            return;
          }
        }
      }
      const hit = hitTestElement(x, y);
      if (hit) {
        setSelectedId(hit);
        const el = sceneRef.current.elements.find((el2) => el2.id === hit);
        pushHistory();
        dragRef.current = { mode: 'move', startX: x, startY: y, orig: JSON.parse(JSON.stringify(el)) };
      } else {
        // Empty space with the Select tool: drag to pan the board instead of a dedicated Pan tool.
        setSelectedId(null);
        panningRef.current = { startX: e.clientX, startY: e.clientY, originX: sceneRef.current.viewport.x, originY: sceneRef.current.viewport.y };
      }
      return;
    }

    if (tool === 'text') {
      pushHistory();
      const el = { id: newId(), type: 'text', x, y, width: 240, height: 40, text: '', fontFamily: 'sans', fontSize: 18, color, bold: false, italic: false };
      sceneRef.current.elements.push(el);
      setTool('select');
      startTextEdit(el.id);
      draw();
      scheduleSave();
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
      eraseAt(x, y);
      return;
    }

    if (tool === 'pen') {
      pushHistory();
      const pressure = e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5;
      draftRef.current = { id: newId(), type: 'stroke', color, width: strokeWidth, points: [{ x, y, pressure }] };
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

    if (dragRef.current) {
      const { mode, handle, startX, startY, orig } = dragRef.current;
      const dx = x - startX;
      const dy = y - startY;
      const el = sceneRef.current.elements.find((el2) => el2.id === (selectedId));
      if (!el) return;
      if (mode === 'move') {
        if (el.type === 'stroke') el.points = orig.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
        else if (el.type === 'arrow') { el.x1 = orig.x1 + dx; el.y1 = orig.y1 + dy; el.x2 = orig.x2 + dx; el.y2 = orig.y2 + dy; }
        else { el.x = orig.x + dx; el.y = orig.y + dy; }
      } else if (mode === 'resize') {
        if (el.type === 'arrow') {
          if (handle === 'start') { el.x1 = orig.x1 + dx; el.y1 = orig.y1 + dy; }
          else { el.x2 = orig.x2 + dx; el.y2 = orig.y2 + dy; }
        } else {
          const MIN = 12;
          if (handle === 'se') { el.width = Math.max(MIN, orig.width + dx); el.height = Math.max(MIN, orig.height + dy); }
          else if (handle === 'nw') { el.x = orig.x + dx; el.y = orig.y + dy; el.width = Math.max(MIN, orig.width - dx); el.height = Math.max(MIN, orig.height - dy); }
          else if (handle === 'ne') { el.y = orig.y + dy; el.width = Math.max(MIN, orig.width + dx); el.height = Math.max(MIN, orig.height - dy); }
          else if (handle === 'sw') { el.x = orig.x + dx; el.width = Math.max(MIN, orig.width - dx); el.height = Math.max(MIN, orig.height + dy); }
        }
      }
      draw();
      return;
    }

    if (tool === 'eraser' && e.buttons === 1) {
      eraseAt(x, y);
      return;
    }

    if (draftRef.current) {
      const d = draftRef.current;
      if (d.type === 'stroke') {
        const pressure = e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5;
        d.points.push({ x, y, pressure });
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
    }
  };

  const onPointerUp = () => {
    if (panningRef.current) {
      panningRef.current = null;
      scheduleSave();
      return;
    }
    if (dragRef.current) {
      dragRef.current = null;
      scheduleSave();
      return;
    }
    if (draftRef.current) {
      const d = draftRef.current;
      draftRef.current = null;
      if (d.type === 'stroke') {
        sceneRef.current.elements.push(d);
      } else {
        if (d.width > 3 || d.height > 3 || d.type === 'arrow') {
          const { x1, y1, x2, y2, id, type, color: c, strokeWidth: sw, x, y, width, height, filled: f } = d;
          sceneRef.current.elements.push(type === 'arrow' ? { id, type, x1, y1, x2, y2, color: c, strokeWidth: sw } : { id, type, x, y, width, height, color: c, strokeWidth: sw, filled: f });
          setSelectedId(id);
          setTool('select');
        }
      }
      draw();
      scheduleSave();
    }
  };

  const onDoubleClick = (e) => {
    if (tool !== 'select') return;
    const { x, y } = toLogical(e.clientX, e.clientY);
    const hit = hitTestElement(x, y);
    if (!hit) return;
    const el = sceneRef.current.elements.find((el2) => el2.id === hit);
    if (el.type === 'text') startTextEdit(hit);
    else if (el.type === 'card') openCard(el);
  };

  const openCard = (el) => {
    onClose();
    if (el.entityType === 'note') navigate('/notes', { state: { noteId: el.entityId } });
    else navigate('/tasks', { state: { taskId: el.entityId } });
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
    sceneRef.current.elements = prev;
    setSelectedId(null);
    draw();
    scheduleSave();
  };

  const clearBoard = async () => {
    const ok = await confirm({ message: t('whiteboard.confirmClear') });
    if (!ok) return;
    pushHistory();
    sceneRef.current.elements = [];
    setSelectedId(null);
    draw();
    scheduleSave();
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    pushHistory();
    sceneRef.current.elements = sceneRef.current.elements.filter((el) => el.id !== selectedId);
    setSelectedId(null);
    draw();
    scheduleSave();
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === 'Escape') {
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const applyColorToSelection = (c) => {
    setColor(c);
    if (selectedEl && ['stroke', 'rect', 'ellipse', 'arrow', 'text'].includes(selectedEl.type)) {
      selectedEl.color = c;
      draw();
      scheduleSave();
    }
  };

  const applyFillToSelection = () => {
    const next = !filled;
    setFilled(next);
    if (selectedEl && ['rect', 'ellipse'].includes(selectedEl.type)) {
      selectedEl.filled = next;
      draw();
      scheduleSave();
    }
  };

  const applyWidthToSelection = (w) => {
    setStrokeWidth(w);
    if (selectedEl && selectedEl.type === 'stroke') selectedEl.width = w;
    else if (selectedEl && ['rect', 'ellipse', 'arrow'].includes(selectedEl.type)) selectedEl.strokeWidth = w;
    if (selectedEl) { draw(); scheduleSave(); }
  };

  const applyTextFormat = (patch) => {
    if (!selectedEl || selectedEl.type !== 'text') return;
    Object.assign(selectedEl, patch);
    draw();
    scheduleSave();
    rerender(); // the live textarea overlay + floating format bar read selectedEl's fields directly in JSX
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

  const openCardPicker = async () => {
    setCardPickerOpen(true);
    setCardPickerSearch('');
    if (cardPickerNotes === null) {
      const { notes } = await api.listNotes();
      setCardPickerNotes(notes);
    }
    if (cardPickerTasks === null) {
      const { tasks } = await api.listTasks();
      setCardPickerTasks(tasks);
    }
  };

  const insertCard = (entityType, item) => {
    const canvas = canvasRef.current;
    const { viewport } = sceneRef.current;
    const cx = (canvas.clientWidth / 2 - viewport.x) / viewport.scale;
    const cy = (canvas.clientHeight / 2 - viewport.y) / viewport.scale;
    // Cascade successive inserts so they don't land stacked exactly on top of each other.
    const cardCount = sceneRef.current.elements.filter((e) => e.type === 'card').length;
    const offset = (cardCount % 6) * 24;
    pushHistory();
    const el = { id: newId(), type: 'card', entityType, entityId: item.id, title: item.title || item.name, x: cx - 110 + offset, y: cy - 35 + offset, width: 220, height: 70, color: theme.textPrimary };
    sceneRef.current.elements.push(el);
    setSelectedId(el.id);
    setTool('select');
    setCardPickerOpen(false);
    draw();
    scheduleSave();
  };

  const cardPickerNoteList = (cardPickerNotes || []).filter((n) => !cardPickerSearch.trim() || n.title.toLowerCase().includes(cardPickerSearch.toLowerCase()));
  const cardPickerTaskList = (cardPickerTasks || []).filter((tk) => !cardPickerSearch.trim() || tk.title.toLowerCase().includes(cardPickerSearch.toLowerCase()));

  const toolBtnStyle = (active) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 9, cursor: 'pointer',
    background: active ? theme.accent : theme.subtleBg, color: active ? '#fff' : theme.textPrimary, flexShrink: 0,
  });

  // Screen-space position of the currently selected/edited text element, for the floating format bar / edit textarea.
  const textScreenBox = useMemo(() => {
    if (!selectedEl || selectedEl.type !== 'text') return null;
    const { viewport } = sceneRef.current;
    return {
      left: selectedEl.x * viewport.scale + viewport.x,
      top: selectedEl.y * viewport.scale + viewport.y,
      width: selectedEl.width * viewport.scale,
      scale: viewport.scale,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEl, boardId, editingTextId]);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        style={{
          width: '94vw', height: '92vh', maxWidth: 1600, background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', borderRadius: 16, border: `1px solid ${theme.border}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
        }}
      >
        <div
          onPointerDown={(e) => { if (e.target === e.currentTarget) startHeaderDrag(e); }}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, cursor: dragging ? 'grabbing' : 'grab' }}
        >
          <Icon name="whiteboard" size={18} color={theme.accentText} />
          <input
            value={boardName}
            onChange={(e) => setBoardName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontWeight: 800, color: theme.textPrimary, width: 200, padding: '4px 8px', borderRadius: 8 }}
          />

          <div ref={switcherRef} style={{ position: 'relative' }}>
            <div
              onClick={() => setSwitcherOpen((v) => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '7px 12px', borderRadius: 8, background: theme.subtleBg, fontSize: 12.5, fontWeight: 700, color: theme.textPrimary }}
            >
              <Icon name="layers" size={14} />
              {t('whiteboard.boardsButton', { n: boards.length })}
              <Icon name="chevron" size={12} color={theme.textMuted} />
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

          <span
            onClick={createBoard}
            title={t('whiteboard.newBoard')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', background: theme.accent, color: '#fff', flexShrink: 0 }}
          >
            <Icon name="plus" size={15} color="#fff" />
          </span>

          <div onPointerDown={startHeaderDrag} style={{ flex: 1, alignSelf: 'stretch' }} />

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
            <span onClick={() => setTool('select')} title={t('whiteboard.select')} style={toolBtnStyle(tool === 'select')}>
              <Icon name="cursor" size={16} />
            </span>
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
            <span onClick={openCardPicker} title={t('whiteboard.insertCard')} style={toolBtnStyle(false)}>
              <Icon name="doc" size={16} />
            </span>
            <div style={{ height: 1, background: theme.border, margin: '4px 0' }} />
            <span
              onClick={applyFillToSelection}
              title={t('whiteboard.fill')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 24, borderRadius: 6, cursor: 'pointer', flexShrink: 0,
                background: filled ? theme.accentSoftBg : 'transparent',
              }}
            >
              <span style={{
                width: 15, height: 15, borderRadius: 3, border: `1.5px solid ${theme.textPrimary}`,
                background: filled ? theme.textPrimary : 'transparent',
              }}
              />
            </span>
            <div style={{ height: 1, background: theme.border, margin: '4px 0' }} />
            {COLORS.map((c) => (
              <span
                key={c}
                onClick={() => applyColorToSelection(c)}
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
                onClick={() => applyWidthToSelection(w)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 24, borderRadius: 6, cursor: 'pointer',
                  background: strokeWidth === w ? theme.accentSoftBg : 'transparent',
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
              <>
                <canvas
                  ref={canvasRef}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onPointerLeave={onPointerUp}
                  onDoubleClick={onDoubleClick}
                  onWheel={onWheel}
                  style={{
                    display: 'block', touchAction: 'none',
                    cursor: tool === 'eraser' ? 'cell' : tool === 'select' ? 'default' : 'crosshair',
                  }}
                />

                {editingTextId && selectedEl && textScreenBox && (
                  <textarea
                    ref={textareaElRef}
                    defaultValue={selectedEl.text}
                    onBlur={commitTextEdit}
                    onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); }}
                    style={{
                      position: 'absolute', left: textScreenBox.left, top: textScreenBox.top, width: Math.max(textScreenBox.width, 60), minHeight: 28,
                      font: fontString(selectedEl).replace(`${selectedEl.fontSize || 18}px`, `${(selectedEl.fontSize || 18) * textScreenBox.scale}px`),
                      color: selectedEl.color, background: 'transparent', border: `1.5px dashed ${theme.accent}`, outline: 'none',
                      resize: 'none', padding: 2, lineHeight: `${LINE_HEIGHT_FACTOR}em`, overflow: 'hidden',
                    }}
                  />
                )}

                {selectedEl && selectedEl.type === 'text' && textScreenBox && (
                  <div
                    style={{
                      position: 'absolute', left: textScreenBox.left, top: Math.max(0, textScreenBox.top - 44), zIndex: 10,
                      display: 'flex', alignItems: 'center', gap: 6, background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff',
                      border: `1px solid ${theme.border}`, borderRadius: 9, padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                    }}
                  >
                    <select
                      value={selectedEl.fontFamily}
                      onChange={(e) => applyTextFormat({ fontFamily: e.target.value })}
                      style={{ fontSize: 11.5, border: `1px solid ${theme.border}`, borderRadius: 6, background: theme.subtleBg, color: theme.textPrimary, padding: '3px 4px' }}
                    >
                      <option value="sans" style={optionStyle}>{t('whiteboard.fontSans')}</option>
                      <option value="serif" style={optionStyle}>{t('whiteboard.fontSerif')}</option>
                      <option value="mono" style={optionStyle}>{t('whiteboard.fontMono')}</option>
                    </select>
                    <select
                      value={selectedEl.fontSize}
                      onChange={(e) => applyTextFormat({ fontSize: Number(e.target.value) })}
                      style={{ fontSize: 11.5, border: `1px solid ${theme.border}`, borderRadius: 6, background: theme.subtleBg, color: theme.textPrimary, padding: '3px 4px' }}
                    >
                      {FONT_SIZES.map((s) => <option key={s} value={s} style={optionStyle}>{s}</option>)}
                    </select>
                    <span
                      onClick={() => applyTextFormat({ bold: !selectedEl.bold })}
                      style={{ ...toolBtnStyle(selectedEl.bold), width: 26, height: 26, fontWeight: 800, fontSize: 12 }}
                    >
                      B
                    </span>
                    <span
                      onClick={() => applyTextFormat({ italic: !selectedEl.italic })}
                      style={{ ...toolBtnStyle(selectedEl.italic), width: 26, height: 26, fontStyle: 'italic', fontSize: 12 }}
                    >
                      I
                    </span>
                    {COLORS.map((c) => (
                      <span
                        key={c}
                        onClick={() => applyTextFormat({ color: c })}
                        style={{ width: 16, height: 16, borderRadius: '50%', background: c, cursor: 'pointer', border: selectedEl.color === c ? `2px solid ${theme.accentText}` : `1px solid ${theme.border}` }}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {cardPickerOpen && (
              <div
                ref={cardPickerRef}
                style={{
                  position: 'absolute', left: 16, top: 16, zIndex: 20, width: 300,
                  background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
                  borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,0.3)', padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
                }}
              >
                <div style={{ display: 'flex', gap: 6 }}>
                  {['notes', 'tasks'].map((tab) => (
                    <div
                      key={tab}
                      onClick={() => setCardPickerTab(tab)}
                      style={{
                        flex: 1, textAlign: 'center', padding: '6px 8px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                        background: cardPickerTab === tab ? theme.accentSoftBg : theme.subtleBg, color: cardPickerTab === tab ? theme.accentText : theme.textMuted,
                      }}
                    >
                      {tab === 'notes' ? t('whiteboard.tabNotes') : t('whiteboard.tabTasks')}
                    </div>
                  ))}
                </div>
                <input
                  value={cardPickerSearch}
                  onChange={(e) => setCardPickerSearch(e.target.value)}
                  placeholder={t('whiteboard.searchPlaceholder')}
                  autoFocus
                  style={{ border: `1px solid ${theme.border}`, borderRadius: 7, padding: '6px 8px', fontSize: 12, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
                />
                <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {cardPickerTab === 'notes' && cardPickerNoteList.map((n) => (
                    <div key={n.id} onClick={() => insertCard('note', n)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, color: theme.textPrimary }}>
                      <Icon name="doc" size={13} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                    </div>
                  ))}
                  {cardPickerTab === 'tasks' && cardPickerTaskList.map((tk) => (
                    <div key={tk.id} onClick={() => insertCard('task', tk)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, color: theme.textPrimary }}>
                      <Icon name="check" size={13} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tk.title}</span>
                    </div>
                  ))}
                  {cardPickerTab === 'notes' && cardPickerNotes !== null && cardPickerNoteList.length === 0 && (
                    <div style={{ fontSize: 12, color: theme.textMuted, padding: '6px 8px' }}>{t('whiteboard.noResults')}</div>
                  )}
                  {cardPickerTab === 'tasks' && cardPickerTasks !== null && cardPickerTaskList.length === 0 && (
                    <div style={{ fontSize: 12, color: theme.textMuted, padding: '6px 8px' }}>{t('whiteboard.noResults')}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
