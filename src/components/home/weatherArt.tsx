// Weather visuals from the prototype (WX_ICON, WX_BG, wxFxEl), extended with
// night, showers, light/heavy rain and sleet icons for the richer conditions.
import type { CSSProperties, ReactElement } from 'react';
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

/** Animated sky (sun, stars and moon, clouds, rain, lightning, snow, fog). */
export function WxFx({ kind, isDay }: { kind: WxKind; isDay: boolean }) {
  const abs: CSSProperties = { position: 'absolute', pointerEvents: 'none' };
  const kids: ReactElement[] = [];
  if (kind === 'clear' && isDay)
    kids.push(
      <div
        key="sun"
        style={{
          ...abs,
          right: '8%',
          top: -60,
          width: 220,
          height: 220,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(255,245,200,.95) 0%, rgba(255,215,120,.55) 35%, rgba(255,200,100,0) 70%)',
          animation: 'zn-pulse 6s ease-in-out infinite',
        }}
      />,
    );
  if (!isDay && (kind === 'clear' || kind === 'partly')) {
    const R = wxRnd(90, 7);
    for (let i = 0; i < 30; i++)
      kids.push(
        <div
          key={`s${i}`}
          style={{
            ...abs,
            left: `${R[i * 3]! * 100}%`,
            top: `${R[i * 3 + 1]! * 90}%`,
            width: 2,
            height: 2,
            borderRadius: '50%',
            background: '#fff',
            animation: `zn-twinkle ${(2 + R[i * 3 + 2]! * 3).toFixed(2)}s ease-in-out infinite`,
            animationDelay: `${(-R[i * 3 + 2]! * 4).toFixed(2)}s`,
          }}
        />,
      );
    kids.push(
      <div
        key="moon"
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
  if (['partly', 'cloudy', 'rain', 'storm', 'snow', 'fog'].includes(kind)) {
    const n = kind === 'partly' ? 3 : 5;
    const R = wxRnd(n * 3, 11);
    for (let i = 0; i < n; i++)
      kids.push(
        <div
          key={`c${i}`}
          style={{
            ...abs,
            left: 0,
            top: `${R[i * 3]! * 70 - 10}%`,
            width: 260 + R[i * 3 + 1]! * 200,
            height: 90 + R[i * 3 + 2]! * 50,
            borderRadius: '50%',
            background: kind === 'storm' || kind === 'rain' ? 'rgba(40,50,70,.35)' : 'rgba(255,255,255,.35)',
            filter: 'blur(22px)',
            animation: `zn-cloud ${(38 + R[i * 3 + 1]! * 30).toFixed(1)}s linear infinite`,
            animationDelay: `${(-R[i * 3 + 2]! * 60).toFixed(1)}s`,
          }}
        />,
      );
  }
  if (kind === 'rain' || kind === 'storm') {
    const R = wxRnd(210, 3);
    for (let i = 0; i < 70; i++)
      kids.push(
        <div
          key={`r${i}`}
          style={{
            ...abs,
            left: `${R[i * 3]! * 104 - 2}%`,
            top: -30,
            width: 1.5,
            transform: 'rotate(12deg)',
            height: 14 + R[i * 3 + 1]! * 12,
            borderRadius: 2,
            background: 'linear-gradient(180deg, rgba(210,230,255,0), rgba(210,230,255,.75))',
            animation: `zn-rain ${(0.55 + R[i * 3 + 2]! * 0.45).toFixed(2)}s linear infinite`,
            animationDelay: `${(-R[i * 3 + 1]! * 1.2).toFixed(2)}s`,
          }}
        />,
      );
  }
  if (kind === 'storm')
    kids.push(
      <div
        key="fl"
        style={{
          ...abs,
          inset: 0,
          background: 'rgba(235,240,255,.9)',
          animation: 'zn-flash 7s linear infinite',
        }}
      />,
    );
  if (kind === 'snow') {
    const R = wxRnd(150, 5);
    for (let i = 0; i < 50; i++)
      kids.push(
        <div
          key={`f${i}`}
          style={{
            ...abs,
            left: `${R[i * 3]! * 100}%`,
            top: 0,
            width: 3 + R[i * 3 + 1]! * 4,
            height: 3 + R[i * 3 + 1]! * 4,
            borderRadius: '50%',
            background: 'rgba(255,255,255,.9)',
            animation: `zn-snow ${(4 + R[i * 3 + 2]! * 4).toFixed(2)}s linear infinite`,
            animationDelay: `${(-R[i * 3 + 2]! * 8).toFixed(2)}s`,
          }}
        />,
      );
  }
  if (kind === 'fog')
    for (let i = 0; i < 3; i++)
      kids.push(
        <div
          key={`fg${i}`}
          style={{
            ...abs,
            left: '-10%',
            right: '-10%',
            top: `${20 + i * 25}%`,
            height: 40,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent)',
            filter: 'blur(8px)',
            animation: `zn-fog ${10 + i * 4}s ease-in-out infinite`,
          }}
        />,
      );
  return <div style={{ position: 'absolute', inset: 0, zIndex: 1, overflow: 'hidden' }}>{kids}</div>;
}
