import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { navigateToEntity } from '../lib/entityNav.js';

const TYPE_HUE = { note: 290, issue: 25, task: 230, code: 145 };

// Small hand-rolled force-directed layout (repulsion + spring edges + weak
// centering pull), run once per dataset rather than as a live simulation —
// a workspace-sized graph doesn't need real-time physics, just a stable,
// readable arrangement computed up front.
function computeLayout(nodes, edges, width, height) {
  const n = nodes.length;
  if (n === 0) return [];
  const positioned = nodes.map((node, i) => ({
    ...node,
    x: width / 2 + Math.cos((i / n) * 2 * Math.PI) * Math.min(width, height) * 0.32,
    y: height / 2 + Math.sin((i / n) * 2 * Math.PI) * Math.min(width, height) * 0.32,
    vx: 0,
    vy: 0,
  }));
  const indexByKey = new Map(positioned.map((node, i) => [`${node.type}:${node.id}`, i]));
  const edgePairs = edges
    .map((e) => [indexByKey.get(`${e.fromType}:${e.fromId}`), indexByKey.get(`${e.toType}:${e.toId}`)])
    .filter(([a, b]) => a !== undefined && b !== undefined && a !== b);

  const REPULSION = 2600;
  const SPRING_LEN = 120;
  const SPRING_K = 0.02;
  const CENTER_K = 0.008;
  const DAMPING = 0.85;

  for (let iter = 0; iter < 260; iter++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = positioned[i].x - positioned[j].x;
        const dy = positioned[i].y - positioned[j].y;
        const distSq = dx * dx + dy * dy || 0.01;
        const dist = Math.sqrt(distSq);
        const force = REPULSION / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        positioned[i].vx += fx;
        positioned[i].vy += fy;
        positioned[j].vx -= fx;
        positioned[j].vy -= fy;
      }
    }
    for (const [a, b] of edgePairs) {
      const dx = positioned[b].x - positioned[a].x;
      const dy = positioned[b].y - positioned[a].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = SPRING_K * (dist - SPRING_LEN);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      positioned[a].vx += fx;
      positioned[a].vy += fy;
      positioned[b].vx -= fx;
      positioned[b].vy -= fy;
    }
    for (let i = 0; i < n; i++) {
      const node = positioned[i];
      node.vx += (width / 2 - node.x) * CENTER_K;
      node.vy += (height / 2 - node.y) * CENTER_K;
      node.vx *= DAMPING;
      node.vy *= DAMPING;
      node.x += node.vx;
      node.y += node.vy;
    }
  }
  return positioned;
}

const CANVAS_W = 1100;
const CANVAS_H = 640;

export default function Graph() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [data, setData] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [visibleTypes, setVisibleTypes] = useState(() => new Set(['note', 'issue', 'task', 'code']));
  const [hoveredKey, setHoveredKey] = useState(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const dragState = useRef(null);

  useEffect(() => {
    api.getLinksGraph().then((res) => {
      setData(res);
      setLoading(false);
    });
  }, []);

  const positioned = useMemo(
    () => computeLayout(data.nodes, data.edges, CANVAS_W, CANVAS_H),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data]
  );

  const byKey = useMemo(() => new Map(positioned.map((n) => [`${n.type}:${n.id}`, n])), [positioned]);

  const visibleNodes = positioned.filter((n) => visibleTypes.has(n.type));
  const visibleEdges = data.edges.filter((e) => {
    const from = byKey.get(`${e.fromType}:${e.fromId}`);
    const to = byKey.get(`${e.toType}:${e.toId}`);
    return from && to && visibleTypes.has(e.fromType) && visibleTypes.has(e.toType);
  });

  const toggleType = (type) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const onWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    setView((v) => ({ ...v, scale: Math.min(3, Math.max(0.35, v.scale * delta)) }));
  };

  const onMouseDown = (e) => {
    dragState.current = { startX: e.clientX, startY: e.clientY, tx: view.tx, ty: view.ty };
  };
  const onMouseMove = (e) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setView((v) => ({ ...v, tx: dragState.current.tx + dx, ty: dragState.current.ty + dy }));
  };
  const onMouseUp = () => {
    dragState.current = null;
  };

  const filterChips = [
    { type: 'note', label: t('graph.filterNotes') },
    { type: 'issue', label: t('graph.filterIssues') },
    { type: 'task', label: t('graph.filterTasks') },
    { type: 'code', label: t('graph.filterCode') },
  ];

  return (
    <div style={{ padding: '24px 28px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="graph" size={20} color={theme.textPrimary} /> {t('graph.title')}
        </div>
        <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>{t('graph.subtitle')}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {filterChips.map((c) => (
          <span
            key={c.type}
            onClick={() => toggleType(c.type)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700,
              padding: '5px 11px', borderRadius: 20, border: `1px solid ${visibleTypes.has(c.type) ? `oklch(0.55 0.15 ${TYPE_HUE[c.type]})` : theme.border}`,
              background: visibleTypes.has(c.type) ? `oklch(0.55 0.15 ${TYPE_HUE[c.type]} / 0.14)` : 'transparent',
              color: visibleTypes.has(c.type) ? `oklch(0.5 0.16 ${TYPE_HUE[c.type]})` : theme.textMuted,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: `oklch(0.6 0.16 ${TYPE_HUE[c.type]})`, flexShrink: 0 }} />
            {c.label}
          </span>
        ))}
        {!loading && data.nodes.length > 0 && (
          <span style={{ fontSize: 12, color: theme.textMuted, marginLeft: 'auto' }}>
            {t('graph.nodeCount', { n: data.nodes.length, e: data.edges.length })}
          </span>
        )}
      </div>

      <div
        style={{
          flex: 1, minHeight: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14,
          overflow: 'hidden', position: 'relative', cursor: dragState.current ? 'grabbing' : 'grab',
        }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {!loading && data.nodes.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted, fontSize: 13.5, textAlign: 'center', padding: 40 }}>
            {t('graph.empty')}
          </div>
        )}
        <svg width="100%" height="100%" viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} style={{ display: 'block' }}>
          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
            {visibleEdges.map((e, i) => {
              const from = byKey.get(`${e.fromType}:${e.fromId}`);
              const to = byKey.get(`${e.toType}:${e.toId}`);
              return (
                <line
                  key={i}
                  x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                  stroke={theme.border} strokeWidth={1.3} opacity={0.7}
                />
              );
            })}
            {visibleNodes.map((n) => {
              const key = `${n.type}:${n.id}`;
              const hue = TYPE_HUE[n.type];
              const isHovered = hoveredKey === key;
              return (
                <g
                  key={key}
                  transform={`translate(${n.x} ${n.y})`}
                  onClick={() => navigateToEntity(navigate, n)}
                  onMouseEnter={() => setHoveredKey(key)}
                  onMouseLeave={() => setHoveredKey((v) => (v === key ? null : v))}
                  style={{ cursor: 'pointer' }}
                >
                  <circle r={isHovered ? 9 : 7} fill={`oklch(0.6 0.16 ${hue})`} stroke={theme.cardBg} strokeWidth={2} />
                  <text
                    x={12} y={4} fontSize={11} fontWeight={isHovered ? 700 : 500}
                    fill={isHovered ? theme.textPrimary : theme.textMuted}
                  >
                    {n.title?.length > 28 ? `${n.title.slice(0, 28)}…` : n.title}
                  </text>
                  <title>{n.title}</title>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
