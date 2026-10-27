// Weather visuals from the prototype (WX_ICON, WX_BG, wxFxEl), extended with
// night, showers, light/heavy rain and sleet icons for the richer conditions.
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import type { Cond } from '@/lib/weather';

export type WxKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

/** Condition → the animated sky it gets. */
export const condKind = (c: Cond): WxKind =>
  c === 'clear' || c === 'fair'
    ? 'clear'
    : c === 'partly'
      ? 'partly'
      : c === 'fog'
        ? 'fog'
        : c === 'lightrain' || c === 'rain' || c === 'heavyrain' || c === 'showers'
          ? 'rain'
          : c === 'sleet' || c === 'snow'
            ? 'snow'
            : c === 'storm'
              ? 'storm'
              : 'cloudy';

const ICONS = (() => {
  const sun = (cx: number, cy: number, rr: number) =>
    '<g stroke="#ffd36b" stroke-width="1.6" stroke-linecap="round">' +
    [0, 45, 90, 135, 180, 225, 270, 315]
      .map((a) => {
        const t = (a * Math.PI) / 180;
        const r1 = rr + 2.2;
        const r2 = rr + 4.4;
        return `<line x1="${(cx + Math.cos(t) * r1).toFixed(2)}" y1="${(cy + Math.sin(t) * r1).toFixed(2)}" x2="${(cx + Math.cos(t) * r2).toFixed(2)}" y2="${(cy + Math.sin(t) * r2).toFixed(2)}"></line>`;
      })
      .join('') +
    `</g><circle cx="${cx}" cy="${cy}" r="${rr}" fill="url(#wxs)"></circle>`;
  const moon = (dx = 0, dy = 0, k = 1) =>
    `<path transform="translate(${dx} ${dy}) scale(${k})" d="M20.5 8.2a9.6 9.6 0 1 0 7.3 14.6A7.8 7.8 0 0 1 20.5 8.2z" fill="url(#wxm)"></path>`;
  const cloud = (fill: string, dx = 0, dy = 0) =>
    `<path transform="translate(${dx} ${dy})" d="M9 26h15.5a5.5 5.5 0 0 0 .6-10.97A7.5 7.5 0 0 0 10.6 13.2 6.4 6.4 0 0 0 9 26z" fill="${fill}"></path>`;
  const defs =
    '<defs><linearGradient id="wxs" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe89a"></stop><stop offset="1" stop-color="#ffb347"></stop></linearGradient><linearGradient id="wxm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffbe8"></stop><stop offset="1" stop-color="#e3dcc4"></stop></linearGradient><linearGradient id="wxc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"></stop><stop offset="1" stop-color="#dfe7f2"></stop></linearGradient><linearGradient id="wxd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9e1ec"></stop><stop offset="1" stop-color="#9eabbf"></stop></linearGradient></defs>';
  const drop = (x: number, y: number) => `<line x1="${x}" y1="${y}" x2="${x - 1.5}" y2="${y + 4.5}"></line>`;
  const drops = (xs: Array<[number, number]>, c = '#8ec5ff') =>
    `<g stroke="${c}" stroke-width="2" stroke-linecap="round">${xs.map(([x, y]) => drop(x, y)).join('')}</g>`;
  const flakes = (xs: Array<[number, number]>) =>
    `<g fill="#ffffff">${xs.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6"></circle>`).join('')}</g>`;
  const R3: Array<[number, number]> = [
    [12.5, 26],
    [17.5, 27],
    [22.5, 26],
  ];
  const small = (d: string) => `<g transform="translate(4 4) scale(.78)">${d}</g>`;
  const body = (c: Cond, day: boolean) => {
    const light = day ? sun(13, 13, 5.5) : moon(-5, -3, 0.82);
    switch (c) {
      case 'clear':
        return day ? sun(18, 18, 7) : moon(-1, 0);
      case 'fair':
        return day
          ? sun(16, 16, 6.5) + small(cloud('url(#wxc)', 14, 12))
          : moon(-1, -1) + small(cloud('url(#wxc)', 14, 12));
      case 'partly':
        return light + cloud('url(#wxc)', 3, 2);
      case 'cloudy':
        return cloud('url(#wxd)', 5, -3) + cloud('url(#wxc)', 0, 2);
      case 'fog':
        return (
          cloud('url(#wxc)', 0, -3) +
          '<g stroke="#e8eef6" stroke-width="2" stroke-linecap="round"><line x1="7" y1="28" x2="29" y2="28"></line><line x1="10" y1="32.5" x2="26" y2="32.5"></line></g>'
        );
      case 'lightrain':
        return (
          cloud('url(#wxc)', 0, -3) +
          drops([
            [14.5, 26],
            [21, 26.5],
          ])
        );
      case 'rain':
        return cloud('url(#wxd)', 0, -3) + drops(R3);
      case 'heavyrain':
        return (
          cloud('url(#wxd)', 0, -3) +
          drops(
            [
              [10.5, 26],
              [15, 27.5],
              [19.5, 26],
              [24, 27.5],
            ],
            '#6fb2ff',
          )
        );
      case 'showers':
        return (
          light +
          cloud('url(#wxc)', 3, -1) +
          drops([
            [15.5, 27],
            [21.5, 27.5],
          ])
        );
      case 'sleet':
        return (
          cloud('url(#wxc)', 0, -3) +
          drops([
            [13, 26],
            [21, 26],
          ]) +
          flakes([[17, 29.5]])
        );
      case 'snow':
        return (
          cloud('url(#wxc)', 0, -3) +
          flakes([
            [12, 27.5],
            [17, 30],
            [22, 27.5],
          ])
        );
      case 'storm':
        return (
          cloud('url(#wxd)', 0, -3) +
          '<path d="M19 23l-4 6.5h3.6L16.5 35l6-8h-3.8l2.3-4z" fill="#ffd36b"></path>'
        );
    }
  };
  return (c: Cond, day: boolean) => defs + body(c, day);
})();

export function WxIcon({ cond, day = true, size = 44 }: { cond: Cond; day?: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      style={{ flex: 'none', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.18))' }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS(cond, day) }}
    />
  );
}

const WX_BG: Record<string, string> = {
  clear: 'linear-gradient(135deg,oklch(0.72 0.12 230) 0%,oklch(0.78 0.11 200) 55%,oklch(0.86 0.1 80) 100%)',
  clearN: 'linear-gradient(135deg,oklch(0.28 0.07 270),oklch(0.36 0.08 250) 60%,oklch(0.42 0.06 290))',
  partly: 'linear-gradient(135deg,oklch(0.66 0.09 235),oklch(0.74 0.06 220) 60%,oklch(0.8 0.07 80))',
  partlyN: 'linear-gradient(135deg,oklch(0.3 0.05 260),oklch(0.4 0.05 250))',
  cloudy: 'linear-gradient(135deg,oklch(0.55 0.03 250),oklch(0.66 0.02 240))',
  fog: 'linear-gradient(135deg,oklch(0.62 0.02 240),oklch(0.74 0.01 80))',
  rain: 'linear-gradient(135deg,oklch(0.42 0.06 250),oklch(0.54 0.06 235) 60%,oklch(0.5 0.04 260))',
  snow: 'linear-gradient(135deg,oklch(0.7 0.04 240),oklch(0.84 0.02 230))',
  storm: 'linear-gradient(135deg,oklch(0.28 0.06 290),oklch(0.38 0.07 270) 60%,oklch(0.32 0.05 250))',
};
export const wxBg = (kind: WxKind, isDay: boolean) =>
  WX_BG[kind + (isDay ? '' : 'N')] ?? WX_BG[kind] ?? WX_BG.cloudy!;

const wxRnd = (n: number, seed: number) => {
  let x = seed;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    x = (x * 9301 + 49297) % 233280;
    out.push(x / 233280);
  }
  return out;
};

// How much of each effect a condition gets (rain/snow particle counts and
// speeds, clouds) — drizzle is light and slow, heavy rain dense and fast.
const RAIN: Partial<Record<Cond, { n: number; dur: [number, number]; len: [number, number]; op: number }>> = {
  lightrain: { n: 26, dur: [1.0, 1.5], len: [9, 14], op: 0.5 },
  showers: { n: 42, dur: [0.75, 1.1], len: [12, 20], op: 0.62 },
  rain: { n: 64, dur: [0.6, 0.95], len: [14, 24], op: 0.7 },
  heavyrain: { n: 110, dur: [0.42, 0.62], len: [20, 32], op: 0.82 },
  storm: { n: 90, dur: [0.45, 0.7], len: [18, 30], op: 0.78 },
  sleet: { n: 30, dur: [0.8, 1.2], len: [10, 16], op: 0.6 },
};
const SNOW: Partial<Record<Cond, number>> = { snow: 46, sleet: 18 };
const CLOUDS: Partial<Record<Cond, number>> = {
  fair: 1,
  partly: 3,
  cloudy: 5,
  fog: 3,
  lightrain: 4,
  showers: 3,
  rain: 5,
  heavyrain: 5,
  sleet: 4,
  snow: 4,
  storm: 5,
};
const DARK_CLOUDS = new Set<Cond>(['rain', 'heavyrain', 'storm', 'sleet']);

/**
 * Animated sky for the current conditions: sun glow and slow rays, stars and
 * moon at night, drifting clouds, rain (by intensity), snow, sleet (both),
 * a rare soft lightning flash, fog haze. Only transforms and opacity are
 * animated (compositor-only); particles sit at scattered positions and move
 * around them, so with animations off (reduced motion, paused off-screen)
 * the same picture shows still. `scale` thins the particles on small screens.
 */
export function WxFx({ cond, isDay, scale = 1 }: { cond: Cond; isDay: boolean; scale?: number }) {
  const abs: CSSProperties = { position: 'absolute', pointerEvents: 'none' };
  const kids: ReactElement[] = [];
  const sunny = cond === 'clear' || cond === 'fair' || cond === 'partly';
  if (sunny && isDay) {
    kids.push(
      <div
        key="sun"
        className="kh-wxfx__glow"
        style={{
          ...abs,
          right: '6%',
          top: -70,
          width: 240,
          height: 240,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(255,245,200,.95) 0%, rgba(255,215,120,.5) 35%, rgba(255,200,100,0) 70%)',
          opacity: cond === 'partly' ? 0.7 : 1,
          animation: 'zn-pulse 7s ease-in-out infinite',
        }}
      />,
      <div
        key="rays"
        className="kh-wxfx__rays"
        style={{
          ...abs,
          right: 'calc(6% - 130px)',
          top: -200,
          width: 500,
          height: 500,
          borderRadius: '50%',
          background:
            'repeating-conic-gradient(from 0deg, rgba(255,240,200,.22) 0deg 5deg, rgba(255,240,200,0) 5deg 22deg)',
          maskImage: 'radial-gradient(circle, #000 18%, transparent 62%)',
          WebkitMaskImage: 'radial-gradient(circle, #000 18%, transparent 62%)',
          opacity: cond === 'clear' ? 0.6 : 0.38,
          animation: 'kh-wx-spin 140s linear infinite',
        }}
      />,
    );
  }
  if (!isDay && sunny) {
    const R = wxRnd(120, 7);
    const n = Math.round((cond === 'partly' ? 22 : 36) * scale);
    for (let i = 0; i < n; i++)
      kids.push(
        <div
          key={`s${i}`}
          style={{
            ...abs,
            left: `${R[i * 3]! * 100}%`,
            top: `${R[i * 3 + 1]! * 90}%`,
            width: R[i * 3 + 2]! > 0.8 ? 3 : 2,
            height: R[i * 3 + 2]! > 0.8 ? 3 : 2,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: R[i * 3 + 2]! > 0.8 ? '0 0 6px rgba(255,255,255,.8)' : undefined,
            opacity: 0.7,
            animation: `zn-twinkle ${(2.4 + R[i * 3 + 2]! * 3.5).toFixed(2)}s ease-in-out infinite`,
            animationDelay: `${(-R[i * 3 + 2]! * 5).toFixed(2)}s`,
          }}
        />,
      );
    kids.push(
      <div
        key="moon"
        className="kh-wxfx__moon"
        style={{
          ...abs,
          right: '10%',
          top: 22,
          width: 56,
          height: 56,
          borderRadius: '50%',
          boxShadow: 'inset -14px 6px 0 0 rgba(255,250,235,.95)',
          filter: 'drop-shadow(0 0 16px rgba(255,250,220,.5))',
        }}
      />,
    );
  }
  const nClouds = CLOUDS[cond] ?? 0;
  if (nClouds) {
    const R = wxRnd(nClouds * 4, 11);
    const dark = DARK_CLOUDS.has(cond);
    for (let i = 0; i < nClouds; i++)
      kids.push(
        <div
          key={`c${i}`}
          className="kh-wxfx__cloud"
          style={{
            ...abs,
            left: `${R[i * 4 + 3]! * 90}%`,
            top: `${R[i * 4]! * 70 - 10}%`,
            width: 260 + R[i * 4 + 1]! * 200,
            height: 90 + R[i * 4 + 2]! * 50,
            borderRadius: '50%',
            background: dark ? 'rgba(40,50,70,.38)' : 'rgba(255,255,255,.34)',
            filter: 'blur(22px)',
            animation: `kh-wx-drift ${(60 + R[i * 4 + 1]! * 50).toFixed(1)}s linear infinite`,
            animationDelay: `${(-R[i * 4 + 2]! * 100).toFixed(1)}s`,
          }}
        />,
      );
  }
  const rain = RAIN[cond];
  if (rain) {
    const n = Math.round(rain.n * scale);
    const R = wxRnd(n * 3, 3);
    const tilt = cond === 'heavyrain' || cond === 'storm' ? 16 : 11;
    for (let i = 0; i < n; i++) {
      const len = rain.len[0] + R[i * 3 + 1]! * (rain.len[1] - rain.len[0]);
      const dur = rain.dur[0] + R[i * 3 + 2]! * (rain.dur[1] - rain.dur[0]);
      kids.push(
        <div
          key={`r${i}`}
          className="kh-wxfx__drop"
          style={{
            ...abs,
            left: `${R[i * 3]! * 106 - 3}%`,
            top: `${R[(i * 3 + 7) % (n * 3)]! * 100}%`,
            width: cond === 'heavyrain' ? 1.8 : 1.4,
            height: len,
            borderRadius: 2,
            background: 'linear-gradient(180deg, rgba(210,230,255,0), var(--wx-drop, rgba(210,230,255,.85)))',
            opacity: rain.op,
            ['--tilt' as string]: `${tilt}deg`,
            animation: `kh-wx-fall ${dur.toFixed(2)}s linear infinite`,
            animationDelay: `${(-R[i * 3 + 1]! * 2).toFixed(2)}s`,
          }}
        />,
      );
    }
  }
  const nSnow = Math.round((SNOW[cond] ?? 0) * scale);
  if (nSnow) {
    const R = wxRnd(nSnow * 3, 5);
    for (let i = 0; i < nSnow; i++) {
      const size = 2.5 + R[i * 3 + 1]! * 4;
      kids.push(
        <div
          key={`f${i}`}
          className="kh-wxfx__flake"
          style={{
            ...abs,
            left: `${R[i * 3]! * 100}%`,
            top: `${R[(i * 3 + 5) % (nSnow * 3)]! * 100}%`,
            width: size,
            height: size,
            borderRadius: '50%',
            background: 'var(--wx-flake, rgba(255,255,255,.92))',
            boxShadow: '0 0 4px rgba(255,255,255,.5)',
            opacity: 0.55 + R[i * 3 + 2]! * 0.4,
            ['--sway' as string]: `${(6 + R[i * 3 + 2]! * 14).toFixed(0)}px`,
            animation: `kh-wx-snow ${(6 + R[i * 3 + 2]! * 6).toFixed(2)}s linear infinite`,
            animationDelay: `${(-R[i * 3 + 1]! * 12).toFixed(2)}s`,
          }}
        />,
      );
    }
  }
  if (cond === 'storm')
    kids.push(
      <div
        key="fl"
        className="kh-wxfx__flash"
        style={{
          ...abs,
          inset: 0,
          background: 'radial-gradient(120% 90% at 30% 0%, rgba(235,240,255,.85), rgba(235,240,255,.15) 70%)',
          opacity: 0,
          animation: 'kh-wx-flash 11s linear infinite',
          animationDelay: '-3s',
        }}
      />,
    );
  if (cond === 'fog')
    for (let i = 0; i < 4; i++)
      kids.push(
        <div
          key={`fg${i}`}
          style={{
            ...abs,
            left: '-15%',
            right: '-15%',
            top: `${12 + i * 22}%`,
            height: 46,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.38), transparent)',
            filter: 'blur(9px)',
            animation: `zn-fog ${12 + i * 5}s ease-in-out infinite`,
            animationDelay: `${-i * 3}s`,
          }}
        />,
      );
  return (
    <div className="kh-wxfx" style={{ position: 'absolute', inset: 0, zIndex: 1, overflow: 'hidden' }}>
      {kids}
    </div>
  );
}

/**
 * The card's sky: condition gradient, animated effects, a soft dim so the
 * text stays readable. Animations pause while the sky is off-screen, the tab
 * is hidden or `paused` (e.g. the banner under the open popup) — battery.
 */
export function WxSky({
  cond,
  isDay,
  paused = false,
  scale = 1,
}: {
  cond: Cond;
  isDay: boolean;
  paused?: boolean;
  scale?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(true);
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setSeen(!!e?.isIntersecting));
    io.observe(el);
    const vis = () => setShown(document.visibilityState !== 'hidden');
    vis();
    document.addEventListener('visibilitychange', vis);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
  const kind = condKind(cond);
  return (
    <div
      ref={ref}
      className="kh-wx__sky"
      data-cond={cond}
      data-paused={paused || !seen || !shown ? '' : undefined}
      aria-hidden="true"
    >
      <div style={{ position: 'absolute', inset: 0, background: wxBg(kind, isDay), opacity: 0.75 }} />
      <WxFx cond={cond} isDay={isDay} scale={scale} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgb(var(--d) / calc(.12 * var(--d-k)))' }} />
    </div>
  );
}
