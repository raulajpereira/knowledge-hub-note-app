'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePersistentState } from '@/components/ui';
import { mgIni, wLbl, wLblY, type MgPerson } from '@/lib/mg';
import { CHEV, OPT, css } from './css';
import type { Mg } from './store';
import './mg.css';
import { avatarBg } from '@/lib/avatarColor';

// Shared pieces of the Management screens, styled 1:1 with Management.dc.html.

export const GLASS =
  'position:relative;isolation:isolate;flex:1;min-height:0;border-radius:30px;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,.12),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.14);box-shadow:inset 0 1px 0 rgba(255,255,255,.18);';
const BLUR = css(
  'position:absolute;inset:0;z-index:-1;pointer-events:none;border-radius:inherit;backdrop-filter:blur(var(--glass-blur-user, 34px)) saturate(150%);',
);

/** Full-height glass section (list pages). */
export function Glass({
  s = '',
  children,
  label,
}: {
  s?: string;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <section aria-label={label} style={css(`${GLASS}display:flex;flex-direction:column;${s}`)}>
      <div style={BLUR} />
      {children}
    </section>
  );
}

/** Two columns with the prototype's resizable list (width per page, double click resets). */
export function Split({
  page,
  def = 330,
  list,
  children,
  tip = 'Arraste para ajustar · duplo clique repõe',
  bare,
}: {
  page: string;
  def?: number;
  list: React.ReactNode;
  children: React.ReactNode;
  tip?: string;
  /** inside another glass section (Timesheets): no glass of its own */
  bare?: boolean;
}) {
  const [cols, setCols] = usePersistentState<Record<string, number>>('mg.cols', {});
  const [live, setLive] = useState<number | null>(null);
  const ref = useRef<HTMLElement>(null);
  const cw = live ?? cols[page] ?? def;
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    const sec = ref.current;
    if (!sec) return;
    const max = Math.max(300, sec.getBoundingClientRect().width - 380);
    const x0 = e.clientX;
    let w = cw;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const mv = (ev: PointerEvent) => {
      w = Math.round(Math.max(240, Math.min(max, cw + ev.clientX - x0)));
      setLive(w);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setLive(null);
      setCols({ ...cols, [page]: w });
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  return (
    <section
      ref={ref}
      className="mg-split"
      style={css(
        `${bare ? 'position:relative;flex:1;min-height:0;' : GLASS}display:grid;grid-template-rows:minmax(0,1fr);grid-template-columns:min(${cw}px, calc(100% - 360px)) minmax(0,1fr);`,
      )}
    >
      <div style={bare ? { display: 'none' } : BLUR} />
      <div
        role="separator"
        aria-orientation="vertical"
        title={tip}
        className="mg-handle"
        onPointerDown={down}
        onDoubleClick={() => {
          const c = { ...cols };
          delete c[page];
          setCols(c);
        }}
        style={css(
          `position:absolute;top:0;bottom:0;left:${cw - 7}px;width:14px;z-index:6;cursor:col-resize;display:flex;align-items:center;justify-content:center;touch-action:none;`,
        )}
      >
        <div
          style={css(
            `width:4px;height:48px;border-radius:4px;background:${live !== null ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.22)'};box-shadow:0 0 0 1px rgba(255,255,255,.08);`,
          )}
        />
      </div>
      <div
        style={css(
          'min-height:0;display:flex;flex-direction:column;border-right:1px solid rgba(255,255,255,.1);min-width:0;',
        )}
      >
        {list}
      </div>
      <div style={css('min-height:0;min-width:0;overflow:auto;')}>{children}</div>
    </section>
  );
}

/** Person avatar with the team outline (prototype _decTeam). */
export function Av({
  p,
  size,
  fs,
  name,
  av,
  tc,
  s = '',
}: {
  p?: MgPerson;
  size: number;
  fs: number;
  name?: string;
  av?: string;
  tc?: string;
  s?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={css(
        `width:${size}px;height:${size}px;flex:none;border-radius:50%;background:${avatarBg(av ?? p?.av) ?? 'rgba(255,255,255,.15)'};outline:2px solid ${tc ?? 'transparent'};outline-offset:2px;display:flex;align-items:center;justify-content:center;font-size:${fs}px;font-weight:700;${s}`,
      )}
    >
      {mgIni(name ?? p?.name ?? '?')}
    </span>
  );
}

export type Opt = { v: string; l: string };
/** The prototype's select (chevron, dark options); `s` is its own style string. */
export function Sel({
  value,
  onChange,
  opts,
  s,
  label,
  pos = 'right 10px center',
  size = '11px',
}: {
  value: string;
  onChange: (v: string) => void;
  opts: Opt[];
  s: string;
  label: string;
  pos?: string;
  size?: string;
}) {
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      style={{
        ...css(`${s}cursor:pointer;appearance:none;-webkit-appearance:none;color-scheme:dark;`),
        backgroundImage: CHEV,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: pos,
        backgroundSize: size,
      }}
    >
      {opts.map((o) => (
        <option key={o.v} value={o.v} style={OPT}>
          {o.l}
        </option>
      ))}
    </select>
  );
}

/** Team filter chips above the pages (prototype teamBar). */
export function TeamBar({ mg, manageOn }: { mg: Mg; manageOn?: boolean }) {
  const items = [{ id: 'all', name: 'Todas as equipas', color: 'rgba(255,248,240,.55)' }, ...mg.TEAMS];
  return (
    <div
      style={css('flex-shrink:0;display:flex;align-items:center;gap:10px;margin-bottom:12px;min-width:0;')}
    >
      <div
        role="group"
        aria-label={mg.tr('Equipas')}
        style={css(
          'display:flex;gap:3px;padding:4px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(24px) saturate(150%);overflow-x:auto;min-width:0;',
        )}
      >
        {items.map((t) => {
          const on = mg.gTeam === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => mg.setTeam(t.id)}
              style={css(
                `flex:none;height:30px;padding:0 14px;border-radius:999px;border:0;background:${on ? '#fbf8f5' : 'transparent'};color:${on ? '#2a211c' : 'rgba(255,248,240,.85)'};font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:8px;white-space:nowrap;`,
              )}
            >
              <span style={css(`width:8px;height:8px;border-radius:50%;background:${t.color};`)} />
              {t.id === 'all' ? mg.tr(t.name) : t.name}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => mg.nav('mg_teams')}
        style={css(
          `flex:none;height:38px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:${manageOn ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.07)'};backdrop-filter:blur(24px);color:#fbf8f5;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:8px;white-space:nowrap;`,
        )}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="9" cy="8" r="3.5" />
          <path d="M3 20a6 6 0 0 1 12 0" />
          <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
          <path d="M18 14.5a6 6 0 0 1 3 5.5" />
        </svg>
        {mg.tr('Gerir Equipas')}
      </button>
    </div>
  );
}

/** Dimmed overlay + glass dialog (portal: a glass parent would trap position:fixed). */
export function Dialog({
  label,
  onClose,
  s,
  children,
}: {
  label: string;
  onClose: () => void;
  s: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      prev?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <div
      onClick={onClose}
      style={css(
        'position:fixed;inset:0;z-index:55;display:flex;align-items:center;justify-content:center;padding:24px;',
      )}
    >
      {/* the dim blur is a sibling, not a parent: a backdrop-filter parent would stop the dialog's own blur */}
      <div
        aria-hidden="true"
        style={css('position:absolute;inset:0;background:rgba(20,14,10,.12);backdrop-filter:blur(6px);')}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={css(
          `position:relative;${s}background:linear-gradient(180deg,rgba(255,255,255,.22),rgba(255,255,255,.1));backdrop-filter:blur(40px) saturate(170%);border:1px solid rgba(255,255,255,.28);box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 30px 70px rgba(0,0,0,.25);color:#fbf8f5;outline:none;line-height:normal;`,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export const X = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const Trash = () => (
  <svg
    width="14"
    height="14"
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
);

export type Field = {
  label: string;
  val: string | number;
  onChange: (v: string) => void;
  opts?: Opt[];
  type?: string;
  unit?: string;
};
/** Label | input rows inside a rounded box (prototype fld()). */
export function Fields({
  fields,
  labelW = '32%',
  inputS = '',
}: {
  fields: Field[];
  labelW?: string;
  inputS?: string;
}) {
  return (
    <div
      style={css(
        'display:flex;flex-direction:column;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);',
      )}
    >
      {fields.map((f, j) => (
        <div
          key={f.label}
          style={css(
            `display:grid;grid-template-columns:minmax(110px,${labelW}) minmax(0,1fr);align-items:center;gap:12px;min-height:46px;padding:5px 12px 5px 14px;border-top:1px solid ${j ? 'rgba(255,255,255,.07)' : 'transparent'};`,
          )}
        >
          <span style={css('font-size:12.5px;color:rgba(255,248,240,.72);')}>{f.label}</span>
          <div style={css('min-width:0;display:flex;align-items:center;gap:8px;')}>
            {f.opts ? (
              <Sel
                value={String(f.val)}
                onChange={f.onChange}
                opts={f.opts}
                label={f.label}
                s="width:100%;height:34px;padding:0 30px 0 10px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background-color:rgba(255,255,255,.06);color:#fbf8f5;font:inherit;font-size:13px;outline:none;"
              />
            ) : (
              <input
                className="mg-in"
                value={f.val}
                type={f.type ?? 'text'}
                aria-label={f.label}
                onChange={(e) => f.onChange(e.target.value)}
                style={css(
                  `width:100%;min-width:0;height:34px;padding:0 10px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(18,12,9,.16);color:#fbf8f5;font:inherit;font-size:13px;outline:none;box-sizing:border-box;${inputS}`,
                )}
              />
            )}
            {f.unit && (
              <span style={css('flex:none;font-size:12px;color:rgba(255,248,240,.6);')}>{f.unit}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Person summary dialog (prototype mkPop): 12-week load strip and allocations. */
export function PersonPop({
  mg,
  pid,
  a0,
  b0,
  onClose,
}: {
  mg: Mg;
  pid: string;
  a0: number;
  b0: number;
  onClose: () => void;
}) {
  const p = mg.pById[pid];
  if (!p) return null;
  const { tr } = mg;
  const cap = +p.cap || 40;
  const avg = mg.avgLoad(p.id, a0, b0);
  const b = mg.band(avg, cap);
  const my = mg.D.allocs
    .filter((x) => x.person === p.id && mg.wi(x.to) >= 0)
    .sort((x, y) => x.from.localeCompare(y.from));
  const C = ['rgba(255,248,240,.6)', 'oklch(0.86 0.12 85)', 'oklch(0.86 0.12 150)', 'oklch(0.82 0.14 30)'][b];
  return (
    <Dialog
      label={p.name}
      onClose={onClose}
      s="width:100%;max-width:720px;max-height:100%;display:flex;flex-direction:column;border-radius:28px;overflow:hidden;"
    >
      <div style={css('flex-shrink:0;display:flex;align-items:center;gap:14px;padding:22px 22px 16px;')}>
        <Av p={p} size={52} fs={17} tc={mg.tOf(p).tc} />
        <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;')}>
          <span
            style={css(
              'font-size:22px;font-weight:600;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
            )}
          >
            {p.name}
          </span>
          <span style={css('font-size:13px;color:rgba(255,248,240,.72);')}>
            {tr(`${p.role} · ${mg.LV[p.level]} · ${cap}h/semana`)}
          </span>
        </div>
        <span style={css(`font-family:'Geist Mono',monospace;font-size:26px;font-weight:700;color:${C};`)}>
          {Math.round((avg / cap) * 100)}%
        </span>
        <button
          type="button"
          onClick={onClose}
          title={tr('Fechar')}
          aria-label={tr('Fechar')}
          className="mg-round"
        >
          <X />
        </button>
      </div>
      <div
        style={css(
          'flex:1;min-height:0;overflow:auto;padding:0 22px 22px;display:flex;flex-direction:column;gap:18px;',
        )}
      >
        <div style={css('display:flex;flex-direction:column;gap:10px;')}>
          <span style={css('font-size:15px;font-weight:600;')}>{tr('Carga · Próximas 12 Semanas')}</span>
          <div style={css('display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:4px;')}>
            {Array.from({ length: 12 }, (_, w) => {
              const hh = mg.loadW(p.id, w);
              const c = mg.heat(hh, cap);
              return (
                <div
                  key={w}
                  title={`${hh}h · ${wLblY(mg.wk(w))}`}
                  style={css('display:flex;flex-direction:column;gap:4px;min-width:0;')}
                >
                  <div
                    style={css(
                      `height:38px;border-radius:10px;background:${c.bg};outline:${w >= a0 && w <= b0 ? '1.5px solid rgba(255,255,255,.55)' : '0 solid transparent'};outline-offset:1px;display:flex;align-items:center;justify-content:center;font-family:'Geist Mono',monospace;font-size:12px;font-weight:600;color:${c.fg};`,
                    )}
                  >
                    {hh || '·'}
                  </div>
                  <span
                    style={css(
                      'font-size:10.5px;text-align:center;color:rgba(255,248,240,.58);white-space:nowrap;',
                    )}
                  >
                    {wLbl(mg.wk(w))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={css('display:flex;flex-direction:column;gap:8px;')}>
          <span style={css('font-size:15px;font-weight:600;')}>{tr('Alocações')}</span>
          {my.map((x) => {
            const pj = mg.pjById[x.project];
            return (
              <div
                key={x.id}
                style={css(
                  'display:flex;align-items:center;gap:12px;min-height:54px;padding:0 16px;border-radius:16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);',
                )}
              >
                <span
                  style={css(
                    `width:4px;height:28px;flex:none;border-radius:999px;background:${pj?.color ?? 'transparent'};`,
                  )}
                />
                <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;')}>
                  <span
                    style={css(
                      'font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                    )}
                  >
                    <span style={css("font-family:'Geist Mono',monospace;")}>{pj?.code}</span> · {pj?.name}
                  </span>
                  <span style={css('font-size:12.5px;color:rgba(255,248,240,.64);')}>
                    {wLblY(x.from)} → {wLblY(x.to)}
                  </span>
                </span>
                <span style={css("font-family:'Geist Mono',monospace;font-size:14px;font-weight:600;")}>
                  {tr(`${x.hours}h/sem`)}
                </span>
              </div>
            );
          })}
          {!my.length && (
            <div style={css('font-size:13px;color:rgba(255,248,240,.62);')}>
              {tr('Sem alocações ativas.')}
            </div>
          )}
        </div>
        <div style={css('display:flex;justify-content:flex-end;')}>
          <button
            type="button"
            onClick={() => {
              onClose();
              mg.nav('mg_people', { p: p.id });
            }}
            style={css(
              'height:36px;padding:0 16px;border-radius:999px;border:0;background:#fbf8f5;color:#2a211c;font:inherit;font-size:13px;font-weight:600;cursor:pointer;',
            )}
          >
            {tr('Abrir Ficha Completa')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/** Pill chip used for filters (prototype chip()). */
export function Chip({
  on,
  label,
  onClick,
  s = 'height:28px;padding:0 10px;font-size:12px;',
}: {
  on: boolean;
  label: string;
  onClick: () => void;
  s?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      style={css(
        `font:inherit;${s}border-radius:999px;border:1px solid ${on ? '#fbf8f5' : 'rgba(255,255,255,.16)'};background:${on ? '#fbf8f5' : 'rgba(255,255,255,.06)'};color:${on ? '#2a211c' : '#fbf8f5'};font-weight:600;cursor:pointer;`,
      )}
    >
      {label}
    </button>
  );
}

export const uid = () => crypto.randomUUID();
