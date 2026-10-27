'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { compass, tempColor, tempInk, type WxHour } from '@/lib/weather';
import { WxIcon } from './weatherArt';
import { ICON, deg, fill, hm, hourLabel, toUnit, type TempUnit } from './weatherFmt';

const COL = 54;
const CURVE_H = 46;
const LABEL_H = 18;
// track padding + column padding + time row + gap + icon + gap (see home.css)
const CURVE_TOP = 8 + 4 + 16 + 2 + 28 + 2;

export const Ico = ({ d, size = 13, sw = 2 }: { d: string; size?: number; sw?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flex: 'none' }}
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: d }}
  />
);

/** Arrow pointing where the wind blows TO (the forecast gives where it comes FROM). */
export const WindArrow = ({ dir, size = 11 }: { dir: number; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    style={{ flex: 'none', transform: `rotate(${dir + 180}deg)` }}
  >
    <path d="M12 2l6 18-6-4-6 4z" fill="currentColor" />
  </svg>
);

type Entry = { kind: 'hour'; h: WxHour; i: number } | { kind: 'sun'; time: string; rise: boolean };

/** Smooth path through the points (Catmull-Rom as cubic Béziers). */
function smooth(p: Array<[number, number]>): string {
  if (!p.length) return '';
  let d = `M${p[0]![0]},${p[0]![1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i]!;
    const p1 = p[i]!;
    const p2 = p[i + 1]!;
    const p3 = p[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0]!.toFixed(1)},${c1[1]!.toFixed(1)} ${c2[0]!.toFixed(1)},${c2[1]!.toFixed(1)} ${p2[0]},${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * Horizontally scrollable hours: time, sky, temperature curve (coloured by
 * temperature), precipitation bar + chance, wind. Tap an hour for its details.
 */
export function WeatherHours({
  hours,
  tz,
  unit,
  sun = [],
  label,
  nowFirst = false,
}: {
  hours: WxHour[];
  tz: string;
  unit: TempUnit;
  /** sunrise/sunset instants, shown between the hours they fall in */
  sun?: Array<{ time: string; rise: boolean }>;
  label: string;
  /** the first entry is "now" */
  nowFirst?: boolean;
}) {
  const { t, lang } = useI18n();
  const gid = useId().replace(/:/g, '');
  const scroller = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [edge, setEdge] = useState({ l: false, r: false });

  const entries = useMemo(() => {
    const out: Entry[] = [];
    hours.forEach((h, i) => {
      out.push({ kind: 'hour', h, i });
      const a = Date.parse(h.time);
      const b = a + h.step * 3600_000;
      for (const s of sun) {
        const st = Date.parse(s.time);
        if (st >= a && st < b && h.step === 1) out.push({ kind: 'sun', time: s.time, rise: s.rise });
      }
    });
    return out;
  }, [hours, sun]);

  const temps = hours.map((h) => toUnit(h.t, unit));
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const y = (v: number) => LABEL_H + 6 + (hi - lo < 0.5 ? 0.5 : 1 - (v - lo) / (hi - lo)) * (CURVE_H - 12);
  const pts: Array<[number, number]> = [];
  const stops: Array<[number, string]> = [];
  entries.forEach((e, k) => {
    if (e.kind !== 'hour') return;
    const x = k * COL + COL / 2;
    pts.push([x, y(toUnit(e.h.t, unit))]);
    stops.push([x, tempColor(e.h.t)]);
  });
  const width = entries.length * COL;
  const line = smooth(pts);
  const area = pts.length
    ? `${line}L${pts[pts.length - 1]![0]},${LABEL_H + CURVE_H}L${pts[0]![0]},${LABEL_H + CURVE_H}Z`
    : '';
  const mmMax = Math.max(2, ...hours.map((h) => h.mm / h.step));
  // no rain row at all when none of these hours has any
  const anyRain = hours.some((h) => h.mm > 0 || (h.pop ?? 0) >= 10);

  const syncEdges = () => {
    const el = scroller.current;
    if (!el) return;
    setEdge({ l: el.scrollLeft > 4, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(() => {
    syncEdges();
    const el = scroller.current;
    if (!el) return;
    el.scrollLeft = 0;
    const ro = new ResizeObserver(syncEdges);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hours]);
  useEffect(() => setSel(null), [hours]);

  const page = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * Math.max(COL * 3, el.clientWidth - COL * 2), behavior: 'smooth' });
  };

  const h = sel === null ? null : hours[sel];
  return (
    <>
      <div className="kh-wxh-wrap">
        <button
          type="button"
          className="kh-wxh__scroll"
          data-side="l"
          disabled={!edge.l}
          aria-label={t('wx_earlier')}
          onClick={() => page(-1)}
        >
          <Ico d={ICON.left} />
        </button>
        <div
          ref={scroller}
          className="kh-wxh"
          role="group"
          aria-label={label}
          tabIndex={0}
          onScroll={syncEdges}
        >
          <div className="kh-wxh__track" data-dry={anyRain ? undefined : ''} style={{ width: width + 12 }}>
            <svg
              className="kh-wxh__curve"
              width={width}
              height={LABEL_H + CURVE_H}
              style={{ top: CURVE_TOP }}
              aria-hidden="true"
            >
              <defs>
                <linearGradient
                  id={`wxg${gid}`}
                  gradientUnits="userSpaceOnUse"
                  x1="0"
                  x2={width}
                  y1="0"
                  y2="0"
                >
                  {stops.map(([x, c], i) => (
                    <stop key={i} offset={width ? x / width : 0} stopColor={c} />
                  ))}
                </linearGradient>
                <linearGradient id={`wxa${gid}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="white" stopOpacity=".55" />
                  <stop offset="1" stopColor="white" stopOpacity="0" />
                </linearGradient>
                <mask id={`wxm${gid}`}>
                  <rect x="0" y="0" width={width} height={LABEL_H + CURVE_H} fill={`url(#wxa${gid})`} />
                </mask>
              </defs>
              <path d={area} fill={`url(#wxg${gid})`} opacity=".28" mask={`url(#wxm${gid})`} />
              <path d={line} fill="none" stroke={`url(#wxg${gid})`} strokeWidth="2.5" strokeLinecap="round" />
              {pts.map(([x, py], i) => (
                <circle key={i} cx={x} cy={py} r={sel === i ? 4 : 2.6} fill={stops[i]![1]} />
              ))}
            </svg>
            {entries.map((e, k) => {
              if (e.kind === 'sun')
                return (
                  <div key={`s${k}`} className="kh-wxh__col" data-sun="" style={{ width: COL }}>
                    <span className="kh-wxh__time">{hm(e.time, lang, tz)}</span>
                    <span style={{ height: 28, display: 'flex', alignItems: 'center', color: '#ffc861' }}>
                      <Ico d={e.rise ? ICON.rise : ICON.set} size={22} sw={1.8} />
                    </span>
                    <span className="kh-wxh__zone" style={{ height: LABEL_H + CURVE_H }} />
                    <span className="kh-wxh__rain" style={{ justifyContent: 'center' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: 'rgb(var(--w) / .7)' }}>
                        {t(e.rise ? 'wx_sunrise' : 'wx_sunset').split(' ')[0]}
                      </span>
                    </span>
                    <span className="kh-wxh__wind" />
                  </div>
                );
              const x = e.h;
              const perH = x.mm / x.step;
              const strong = (x.gust ?? x.wind) >= 50;
              const desc = [
                nowFirst && e.i === 0 ? t('wx_now') : hourLabel(x.time, lang, tz),
                deg(x.t, unit),
                t(`wx_k_${x.cond}`),
                x.pop !== null ? `${x.pop}%` : '',
                x.mm > 0 ? `${x.mm} mm` : '',
              ]
                .filter(Boolean)
                .join(', ');
              return (
                <button
                  key={x.time}
                  type="button"
                  className="kh-wxh__col"
                  style={{ width: COL }}
                  aria-pressed={sel === e.i}
                  aria-label={desc}
                  data-now={nowFirst && e.i === 0 ? '' : undefined}
                  onClick={() => setSel(sel === e.i ? null : e.i)}
                >
                  <span className="kh-wxh__time">
                    {nowFirst && e.i === 0 ? t('wx_now') : hourLabel(x.time, lang, tz)}
                  </span>
                  <WxIcon cond={x.cond} day={x.day} size={28} />
                  <span className="kh-wxh__zone" style={{ height: LABEL_H + CURVE_H }}>
                    <b
                      className="kh-wxh__t"
                      style={{ top: y(toUnit(x.t, unit)) - LABEL_H, color: tempInk(x.t) }}
                    >
                      {deg(x.t, unit)}
                    </b>
                  </span>
                  <span className="kh-wxh__rain">
                    {x.mm > 0 && (
                      <span
                        className="kh-wxh__bar"
                        style={{
                          height: Math.max(3, Math.min(1, perH / mmMax) * 18),
                          opacity: 0.45 + ((x.pop ?? 70) / 100) * 0.55,
                        }}
                      />
                    )}
                    <span className="kh-wxh__pop">
                      {x.pop !== null && x.pop >= 10 ? `${x.pop}%` : x.mm > 0 ? `${x.mm}` : ''}
                    </span>
                  </span>
                  <span className="kh-wxh__wind" data-strong={strong}>
                    {x.dir !== null && <WindArrow dir={x.dir} />}
                    {x.wind}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          className="kh-wxh__scroll"
          data-side="r"
          disabled={!edge.r}
          aria-label={t('wx_later')}
          onClick={() => page(1)}
        >
          <Ico d={ICON.right} />
        </button>
      </div>
      {h && (
        <div className="kh-wx__hourinfo" aria-live="polite">
          <span>
            <b>
              {hourLabel(h.time, lang, tz)}
              {h.step > 1
                ? `–${hourLabel(new Date(Date.parse(h.time) + h.step * 3600_000).toISOString(), lang, tz)}`
                : ''}
            </b>{' '}
            · {t(`wx_k_${h.cond}`)}
          </span>
          <span>
            <b style={{ color: tempInk(h.t) }}>{deg(h.t, unit)}</b> ·{' '}
            {fill(t('wx_feelsLike'), { n: deg(h.feels, unit) })}
          </span>
          <span>
            <Ico d={ICON.umbrella} size={12} /> <b>{h.mm} mm</b>
            {h.pop !== null ? ` · ${h.pop}%` : ''}
          </span>
          <span>
            <Ico d={ICON.wind} size={12} /> <b>{h.wind} km/h</b>
            {h.dir !== null ? ` ${compass(h.dir, lang)}` : ''}
            {h.gust !== null ? ` · ${fill(t('wx_gusts'), { n: `${h.gust} km/h` })}` : ''}
          </span>
          {h.hum !== null && (
            <span>
              {t('wx_humTile')} <b>{h.hum}%</b>
            </span>
          )}
          {h.uv !== null && h.uv > 0 && (
            <span>
              UV <b>{Math.round(h.uv)}</b>
            </span>
          )}
        </div>
      )}
    </>
  );
}
