// Weather visuals 1:1 from the prototype (wxKind, wxLabelKey, WX_ICON, WX_BG, wxFxEl).
import type { CSSProperties, ReactElement } from 'react';

export type WxKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

export const wxKind = (c: number): WxKind =>
  c === 0 || c === 1
    ? 'clear'
    : c === 2
      ? 'partly'
      : c === 3
        ? 'cloudy'
        : c === 45 || c === 48
          ? 'fog'
          : (c >= 51 && c <= 67) || (c >= 80 && c <= 82)
            ? 'rain'
            : (c >= 71 && c <= 77) || c === 85 || c === 86
              ? 'snow'
              : c >= 95
                ? 'storm'
                : 'cloudy';

export const wxLabelKey = (c: number) =>
  c === 0
    ? 'c0'
    : c === 1
      ? 'c1'
      : c === 2
        ? 'c2'
        : c === 3
          ? 'c3'
          : c === 45 || c === 48
            ? 'c45'
            : c >= 51 && c <= 57
              ? 'c51'
              : c === 65 || c === 67 || c === 82
                ? 'c65'
                : c >= 61 && c <= 67
                  ? 'c61'
                  : (c >= 71 && c <= 77) || c === 85 || c === 86
                    ? 'c71'
                    : c >= 80 && c <= 82
                      ? 'c80'
                      : c >= 95
                        ? 'c95'
                        : 'c3';

const WX_ICON: Record<WxKind, string> = (() => {
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
  const cloud = (fill: string, dx = 0, dy = 0) =>
    `<path transform="translate(${dx} ${dy})" d="M9 26h15.5a5.5 5.5 0 0 0 .6-10.97A7.5 7.5 0 0 0 10.6 13.2 6.4 6.4 0 0 0 9 26z" fill="${fill}"></path>`;
  const defs =
    '<defs><linearGradient id="wxs" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe89a"></stop><stop offset="1" stop-color="#ffb347"></stop></linearGradient><linearGradient id="wxc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"></stop><stop offset="1" stop-color="#dfe7f2"></stop></linearGradient><linearGradient id="wxd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9e1ec"></stop><stop offset="1" stop-color="#9eabbf"></stop></linearGradient></defs>';
  const drops = (c: string) =>
    `<g stroke="${c}" stroke-width="2" stroke-linecap="round"><line x1="12.5" y1="26" x2="11" y2="30.5"></line><line x1="17.5" y1="27" x2="16" y2="31.5"></line><line x1="22.5" y1="26" x2="21" y2="30.5"></line></g>`;
  return {
    clear: defs + sun(18, 18, 7),
    partly: defs + sun(13, 13, 5.5) + cloud('url(#wxc)', 3, 2),
    cloudy: defs + cloud('url(#wxd)', 5, -3) + cloud('url(#wxc)', 0, 2),
    fog:
      defs +
      cloud('url(#wxc)', 0, -3) +
      '<g stroke="#e8eef6" stroke-width="2" stroke-linecap="round"><line x1="7" y1="28" x2="29" y2="28"></line><line x1="10" y1="32.5" x2="26" y2="32.5"></line></g>',
    rain: defs + cloud('url(#wxd)', 0, -3) + drops('#8ec5ff'),
    snow:
      defs +
      cloud('url(#wxc)', 0, -3) +
      '<g fill="#ffffff"><circle cx="12" cy="27.5" r="1.6"></circle><circle cx="17" cy="30" r="1.6"></circle><circle cx="22" cy="27.5" r="1.6"></circle></g>',
    storm:
      defs +
      cloud('url(#wxd)', 0, -3) +
      '<path d="M19 23l-4 6.5h3.6L16.5 35l6-8h-3.8l2.3-4z" fill="#ffd36b"></path>',
  };
})();

export function WxIcon({ code, size = 44 }: { code: number; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.18))' }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: WX_ICON[wxKind(code)] }}
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

export type Alert = [text: string, tone: 'purple' | 'blue' | 'amber' | 'red'];
export const ALERT_BG = {
  purple: 'oklch(0.55 0.18 300 / .55)',
  blue: 'oklch(0.55 0.14 245 / .55)',
  amber: 'oklch(0.7 0.16 70 / .6)',
  red: 'oklch(0.6 0.2 25 / .6)',
} as const;

type Daily = {
  weather_code: number[];
  precipitation_sum: number[];
  wind_gusts_10m_max: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  uv_index_max?: number[];
};

/** Warnings derived from the forecast (prototype `alerts`). */
export function wxAlerts(dl: Daily, gustsNow: number, t: (k: string) => string): Alert[] {
  const out: Alert[] = [];
  const cs = [dl.weather_code[0] ?? 0, dl.weather_code[1] ?? 0];
  if (cs.some((c) => c >= 95)) out.push([t('wx_a_storm'), 'purple']);
  if ((dl.precipitation_sum[0] ?? 0) >= 20 || (dl.precipitation_sum[1] ?? 0) >= 20)
    out.push([t('wx_a_rain'), 'blue']);
  const gust = Math.max(dl.wind_gusts_10m_max[0] ?? 0, gustsNow || 0);
  if (gust >= 60) out.push([`${t('wx_a_wind')} · ${Math.round(gust)} km/h`, 'amber']);
  if ((dl.temperature_2m_max[0] ?? 0) >= 35)
    out.push([`${t('wx_a_heat')} · ${Math.round(dl.temperature_2m_max[0]!)}°`, 'red']);
  if ((dl.temperature_2m_min[0] ?? 99) <= 0) out.push([t('wx_a_cold'), 'blue']);
  if (cs.some((c) => (c >= 71 && c <= 77) || c === 85 || c === 86)) out.push([t('wx_a_snow'), 'blue']);
  if ((dl.uv_index_max?.[0] ?? 0) >= 8)
    out.push([`${t('wx_a_uv')} · ${Math.round(dl.uv_index_max![0]!)}`, 'amber']);
  return out;
}
