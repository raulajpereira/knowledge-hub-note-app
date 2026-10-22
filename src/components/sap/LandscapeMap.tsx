'use client';

import { useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { useViewport } from '@/components/ui';
import { envColor, type SapEnv } from '@/lib/sap';
import { landscapes, routes, type LSystem, type LTransport } from '@/lib/landscape';

// "Mapa da paisagem": one lane per landscape (client + track) with its systems
// in DEV → QAS → PRD columns (sandbox and others at the sides), the transport
// routes as arrows and, on each arrow, the requests waiting to be imported into
// its target. Plain SVG; exported as SVG or PNG.

export type MapTransport = LTransport & { trkorr: string; description: string };

const BOX_W = 200;
const BOX_H = 84;
const COL_W = 350;
const PAD = 28;
const LANE_HEAD = 34;
const ROW_GAP = 18;
const LANE_GAP = 22;
const FONT = "'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif";
const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function LandscapeMap({
  systems,
  transports,
  clientName,
  activeId,
  onOpenSystem,
}: {
  systems: LSystem[];
  transports: MapTransport[] | null;
  clientName: (id: string | null) => string;
  activeId: string | null;
  onOpenSystem: (id: string) => void;
}) {
  const { t } = useI18n();
  const svgRef = useRef<SVGSVGElement>(null);
  const [edge, setEdge] = useState<string | null>(null);
  // phones/tablets: the whole map fits the width; − / + zoom in (the box scrolls) (D70)
  const compact = useViewport() !== 'desktop';
  const [zoom, setZoom] = useState(1);

  const lands = useMemo(() => landscapes(systems), [systems]);
  const rts = useMemo(() => routes(systems, transports ?? []), [systems, transports]);
  const used = new Set(systems.map((s) => s.env));
  const cols: SapEnv[] = [
    ...(used.has('SBX') ? (['SBX'] as const) : []),
    'DEV',
    'QAS',
    'PRD',
    ...(used.has('OTH') ? (['OTH'] as const) : []),
  ];
  // positions
  const pos = new Map<string, { x: number; y: number }>();
  const lanes: Array<{ key: string; y: number; h: number; title: string }> = [];
  let y = PAD;
  for (const l of lands) {
    const per = new Map<SapEnv, number>();
    let rows = 1;
    for (const s of l.systems) {
      const i = per.get(s.env) ?? 0;
      per.set(s.env, i + 1);
      rows = Math.max(rows, i + 1);
      pos.set(s.id, {
        x: PAD + cols.indexOf(s.env) * COL_W,
        y: y + LANE_HEAD + i * (BOX_H + ROW_GAP),
      });
    }
    const h = LANE_HEAD + rows * (BOX_H + ROW_GAP) + 8;
    lanes.push({
      key: l.key,
      y,
      h,
      title: [clientName(l.clientId) || t('lm_noClient'), l.track].filter(Boolean).join(' · '),
    });
    y += h + LANE_GAP;
  }
  const W = PAD * 2 + (cols.length - 1) * COL_W + BOX_W;
  const H = Math.max(y - LANE_GAP + PAD, 160);
  const sysById = new Map(systems.map((s) => [s.id, s]));
  const trById = new Map((transports ?? []).map((x) => [x.id, x]));
  const open = rts.find((r) => `${r.from}>${r.to}` === edge) ?? null;

  const exportSvg = () => {
    const el = svgRef.current;
    if (!el) return null;
    const c = el.cloneNode(true) as SVGSVGElement;
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // theme colours are CSS variables: a file outside the app needs the resolved values
    const src = [el, ...el.querySelectorAll('*')];
    [c, ...c.querySelectorAll('*')].forEach((n, i) => {
      const cs = getComputedStyle(src[i]!);
      for (const a of ['fill', 'stroke'] as const)
        if (n.getAttribute(a)?.includes('var(')) n.setAttribute(a, cs.getPropertyValue(a));
    });
    c.querySelectorAll('[data-ui]').forEach((n) => n.remove());
    return new XMLSerializer().serializeToString(c);
  };
  const save = (blob: Blob, name: string) => {
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  };
  const name = `sap-landscape-${new Date().toISOString().slice(0, 10)}`;
  const downloadSvg = () => {
    const s = exportSvg();
    if (s) save(new Blob([s], { type: 'image/svg+xml' }), `${name}.svg`);
  };
  const downloadPng = () => {
    const s = exportSvg();
    if (!s) return;
    const img = new Image();
    const url = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }));
    img.onload = () => {
      const k = 2;
      const cv = document.createElement('canvas');
      cv.width = W * k;
      cv.height = H * k;
      const g = cv.getContext('2d');
      if (!g) return;
      g.scale(k, k);
      g.drawImage(img, 0, 0, W, H);
      URL.revokeObjectURL(url);
      cv.toBlob((b) => b && save(b, `${name}.png`), 'image/png');
    };
    img.src = url;
  };

  if (!systems.length) return <div className="kh-sap-empty">{t('s_empty')}</div>;

  return (
    <div className="kh-lm">
      <div className="kh-lm-bar">
        <span className="kh-lm-hint">{t('lm_hint')}</span>
        <button type="button" className="kh-sap-ghost kh-lm-btn" onClick={downloadSvg}>
          {t('lm_svg')}
        </button>
        <button type="button" className="kh-sap-ghost kh-lm-btn" onClick={downloadPng}>
          {t('lm_png')}
        </button>
        {compact && (
          <span className="kh-lm-zoom" role="group" aria-label={t('lm_zoom')}>
            <button
              type="button"
              aria-label={t('wb_zoomOut')}
              disabled={zoom <= 1}
              onClick={() => setZoom((z) => Math.max(1, z / 1.5))}
            >
              −
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              aria-label={t('wb_zoomIn')}
              disabled={zoom >= 4}
              onClick={() => setZoom((z) => Math.min(4, z * 1.5))}
            >
              +
            </button>
          </span>
        )}
      </div>
      <div className="kh-lm-scroll">
        <svg
          ref={svgRef}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          style={
            compact
              ? { width: `${zoom * 100}%`, maxWidth: 'none', height: 'auto' }
              : { width: '100%', maxWidth: W, minWidth: Math.min(W, 820), height: 'auto' }
          }
          role="img"
          aria-label={t('lm_title')}
          className="kh-lm-svg"
          fontFamily={FONT}
        >
          <defs>
            <marker
              id="kh-lm-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M0 0L10 5L0 10z" fill="var(--ink)" fillOpacity="0.75" />
            </marker>
            <marker
              id="kh-lm-arrow-on"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M0 0L10 5L0 10z" fill="#f2c14e" />
            </marker>
          </defs>
          <rect x="0" y="0" width={W} height={H} rx="18" fill="var(--ink-inv)" />
          {cols.map((c, i) => (
            <text
              key={c}
              x={PAD + i * COL_W + BOX_W / 2}
              y={18}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              letterSpacing="1.5"
              fill={envColor(c)}
            >
              {c === 'OTH' ? t('s_envOTH').toUpperCase() : c}
            </text>
          ))}
          {lanes.map((l) => (
            <g key={l.key}>
              <rect
                x={PAD / 2}
                y={l.y}
                width={W - PAD}
                height={l.h}
                rx="16"
                fill="#ffffff"
                fillOpacity="0.045"
                stroke="#ffffff"
                strokeOpacity="0.12"
              />
              <text x={PAD} y={l.y + 22} fontSize="13" fontWeight="600" fill="var(--ink)" fillOpacity="0.85">
                {l.title}
              </text>
            </g>
          ))}
          {rts.map((r) => {
            const a = pos.get(r.from);
            const b = pos.get(r.to);
            if (!a || !b) return null;
            const n = r.waiting.length;
            const on = n > 0;
            const x1 = a.x + BOX_W;
            const y1 = a.y + BOX_H / 2;
            const forward = b.x > a.x;
            const x2 = forward ? b.x : b.x + BOX_W / 2;
            const y2 = forward ? b.y + BOX_H / 2 : b.y + (b.y > a.y ? 0 : BOX_H);
            const d = forward
              ? `M${x1} ${y1} C${x1 + 50} ${y1}, ${x2 - 50} ${y2}, ${x2 - 2} ${y2}`
              : `M${x1} ${y1} C${x1 + 80} ${y1}, ${x2} ${y2 + (b.y > a.y ? -60 : 60)}, ${x2} ${y2}`;
            const mx = forward ? (x1 + x2) / 2 : x1 + 40;
            const my = forward ? (y1 + y2) / 2 : (y1 + y2) / 2;
            const target = sysById.get(r.to);
            const label = on
              ? t(n === 1 ? 'lm_wait1' : 'lm_waitN')
                  .replace('{n}', String(n))
                  .replace('{sid}', target?.sid || target?.name || '')
              : '';
            const k = `${r.from}>${r.to}`;
            return (
              <g
                key={k}
                className="kh-lm-edge"
                role="button"
                tabIndex={0}
                aria-label={label || `${sysById.get(r.from)?.sid} → ${target?.sid}`}
                data-count={n}
                onClick={() => setEdge(edge === k ? null : k)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setEdge(edge === k ? null : k)}
              >
                <path d={d} fill="none" stroke="transparent" strokeWidth="16" />
                <path
                  d={d}
                  fill="none"
                  stroke={on ? '#f2c14e' : 'var(--ink)'}
                  strokeOpacity={on ? 1 : 0.45}
                  strokeWidth={edge === k ? 3.5 : on ? 2.5 : 1.6}
                  strokeDasharray={on ? undefined : '5 5'}
                  markerEnd={`url(#${on ? 'kh-lm-arrow-on' : 'kh-lm-arrow'})`}
                />
                {on && (
                  <g>
                    <rect
                      x={mx - 62}
                      y={my - 26}
                      width="124"
                      height="20"
                      rx="10"
                      fill="#f2c14e"
                      fillOpacity="0.95"
                    />
                    <text
                      x={mx}
                      y={my - 12}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="700"
                      fill="var(--ink-inv)"
                    >
                      {t(n === 1 ? 'lm_short1' : 'lm_shortN').replace('{n}', String(n))}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
          {systems.map((s) => {
            const p = pos.get(s.id);
            if (!p) return null;
            const c = envColor(s.env);
            const sel = s.id === activeId;
            return (
              <g
                key={s.id}
                className="kh-lm-box"
                role="button"
                tabIndex={0}
                aria-label={`${s.sid} ${s.name}`}
                onClick={() => onOpenSystem(s.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpenSystem(s.id)}
              >
                <rect
                  x={p.x}
                  y={p.y}
                  width={BOX_W}
                  height={BOX_H}
                  rx="14"
                  fill={sel ? '#ffffff' : '#3a2f28'}
                  stroke={c}
                  strokeWidth={sel ? 2.5 : 1.5}
                />
                <rect x={p.x} y={p.y + 12} width="4" height={BOX_H - 24} rx="2" fill={c} />
                <text
                  x={p.x + 16}
                  y={p.y + 28}
                  fontSize="17"
                  fontWeight="700"
                  fontFamily={MONO}
                  fill={sel ? '#1d1a17' : 'var(--ink)'}
                >
                  {s.sid || '—'}
                  <tspan fontSize="12" fontWeight="500" fillOpacity="0.7">
                    {s.mandt ? ` / ${s.mandt}` : ''}
                  </tspan>
                </text>
                <rect
                  x={p.x + BOX_W - 52}
                  y={p.y + 13}
                  width="40"
                  height="18"
                  rx="9"
                  fill={c}
                  fillOpacity="0.9"
                />
                <text
                  x={p.x + BOX_W - 32}
                  y={p.y + 26}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill="#1d1a17"
                >
                  {s.env}
                </text>
                <text
                  x={p.x + 16}
                  y={p.y + 50}
                  fontSize="12"
                  fill={sel ? '#3b332c' : 'var(--ink)'}
                  fillOpacity="0.85"
                >
                  {clip(s.name, 28)}
                </text>
                <text
                  x={p.x + 16}
                  y={p.y + 68}
                  fontSize="11"
                  fill={sel ? '#5b5047' : 'var(--ink)'}
                  fillOpacity="0.6"
                >
                  {clip(clientName(s.clientId) || '—', 30)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {open && (
        <div className="kh-lm-list" role="region" aria-label={t('lm_waiting')}>
          <div className="kh-lm-lhead">
            <b>
              {sysById.get(open.from)?.sid} → {sysById.get(open.to)?.sid}
            </b>
            <span>
              {open.waiting.length
                ? t(open.waiting.length === 1 ? 'lm_wait1' : 'lm_waitN')
                    .replace('{n}', String(open.waiting.length))
                    .replace('{sid}', sysById.get(open.to)?.sid ?? '')
                : t('lm_none')}
            </span>
            <button type="button" aria-label={t('i_close')} onClick={() => setEdge(null)}>
              ×
            </button>
          </div>
          {open.waiting.map((id) => {
            const x = trById.get(id);
            return (
              <a key={id} href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/app/transports?o=${id}`}>
                <b className="kh-sap-mono">{x?.trkorr}</b>
                <span>{x?.description}</span>
              </a>
            );
          })}
        </div>
      )}
      {transports === null && <div className="kh-lm-note">{t('lm_noTransports')}</div>}
    </div>
  );
}
