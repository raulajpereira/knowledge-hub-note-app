'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, isApiFailure } from '@/lib/client/api';
import type { WeatherLoc } from '@/lib/prefs';
import { usePref } from '@/components/shell/PrefsProvider';
import { useI18n } from '@/i18n/client';
import { ALERT_BG, WxFx, WxIcon, wxAlerts, wxBg, wxKind, wxLabelKey } from './weatherArt';

type Forecast = {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_gusts_10m: number;
    is_day: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max: number[];
    wind_gusts_10m_max: number[];
    uv_index_max: number[];
  };
};

const LISBOA: WeatherLoc = { lat: 38.72, lon: -9.14, city: 'Lisboa' };
const REFRESH_MS = 30 * 60 * 1000;
const svg = (d: string, size = 13, sw = 2) => (
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

/** Weather card (prototype wx*), data from /api/v1/weather (Open-Meteo through our server). */
export function WeatherCard() {
  const { t, lang } = useI18n();
  const [loc, setLoc] = usePref<WeatherLoc>('weatherLoc', LISBOA);
  const [wx, setWx] = useState<Forecast | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'err' | 'notfound'>('loading');
  const [editing, setEditing] = useState(false);
  const [city, setCity] = useState('');

  const load = useCallback(() => {
    api<Forecast>(`/weather?lat=${loc.lat}&lon=${loc.lon}`)
      .then((r) => {
        setWx(r);
        setStatus('ok');
      })
      .catch(() => setStatus('err'));
  }, [loc.lat, loc.lon]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const setCityByName = async (name: string) => {
    try {
      const g = await api<WeatherLoc>(`/weather/geocode?lang=${lang}&q=${encodeURIComponent(name)}`);
      setLoc({ ...g, manual: true });
      setEditing(false);
      setCity('');
    } catch (e) {
      setStatus(isApiFailure(e) && e.code === 'city_not_found' ? 'notfound' : 'err');
    }
  };
  const useGeo = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLoc({
          lat: +p.coords.latitude.toFixed(3),
          lon: +p.coords.longitude.toFixed(3),
          city: t('wx_myLoc'),
        });
        setEditing(false);
      },
      () => setStatus('err'),
      { timeout: 10000, maximumAge: 600000 },
    );
  };

  const cur = wx?.current;
  const dl = wx?.daily;
  const code = cur ? cur.weather_code : 3;
  const isDay = cur ? Boolean(cur.is_day) : true;
  const kind = wxKind(code);
  const alerts = dl && cur ? wxAlerts(dl, cur.wind_gusts_10m, t) : [];
  const msg =
    status === 'err' ? t('wx_err') : status === 'notfound' ? t('wx_notFound') : cur ? t('wx_src') : '';
  const DN =
    lang === 'en'
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      : ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const lo = dl ? Math.min(...dl.temperature_2m_min) : 0;
  const hi = dl ? Math.max(...dl.temperature_2m_max) : 1;
  const sp = Math.max(1, hi - lo);

  return (
    <div className="kh-wx" data-testid="weather">
      <div className="kh-wx__sky">
        <div style={{ position: 'absolute', inset: 0, background: wxBg(kind, isDay), opacity: 0.75 }} />
        <WxFx kind={kind} isDay={isDay} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.12)' }} />
      </div>
      <div className="kh-wx__grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              fontWeight: 500,
              color: 'rgba(255,255,255,.9)',
              minWidth: 0,
            }}
          >
            {svg(
              '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"></path><circle cx="12" cy="9.5" r="2.5"></circle>',
            )}
            {editing ? (
              <>
                <input
                  className="kh-wx__in"
                  autoFocus
                  value={city}
                  placeholder={t('wx_cityPh')}
                  aria-label={t('wx_cityPh')}
                  onChange={(e) => setCity(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && city.trim()) void setCityByName(city.trim());
                    if (e.key === 'Escape') setEditing(false);
                  }}
                />
                <button
                  type="button"
                  className="kh-wx__geo"
                  title={t('wx_useGeo')}
                  aria-label={t('wx_useGeo')}
                  onClick={useGeo}
                >
                  {svg(
                    '<circle cx="12" cy="12" r="3.5"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path>',
                  )}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="kh-wx__city"
                title={t('wx_change')}
                onClick={() => setEditing(true)}
              >
                <span
                  style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {loc.city}
                </span>
                <span style={{ opacity: 0.7, display: 'flex' }}>
                  {svg('<path d="M6 9l6 6 6-6"></path>', 10, 2.6)}
                </span>
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <span style={{ flex: 'none', display: 'flex' }}>
              <WxIcon code={code} size={52} />
            </span>
            <div
              className="kh-mono"
              style={{ fontSize: 56, fontWeight: 600, letterSpacing: '-.04em', lineHeight: 1, color: '#fff' }}
            >
              {cur ? `${Math.round(cur.temperature_2m)}°` : '—'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>
                {cur ? t(wxLabelKey(code)) : status === 'err' ? t('wx_err') : t('wx_loading')}
              </span>
              <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,.85)' }}>
                {cur ? `${t('wx_feels')}${Math.round(cur.apparent_temperature)}°` : ''}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <span className="kh-wx__chip">
              {t('wx_hl')}
              <b>
                {dl
                  ? `${Math.round(dl.temperature_2m_max[0]!)}° / ${Math.round(dl.temperature_2m_min[0]!)}°`
                  : '—'}
              </b>
            </span>
            <span className="kh-wx__chip">
              {t('wx_hum')}
              <b>{cur ? `${cur.relative_humidity_2m}%` : '—'}</b>
            </span>
            <span className="kh-wx__chip">
              {t('wx_wind')}
              <b>{cur ? `${Math.round(cur.wind_speed_10m)} km/h` : '—'}</b>
            </span>
          </div>
          {alerts.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {alerts.map(([text, tone]) => (
                <span
                  key={text}
                  className="kh-wx__chip"
                  style={{
                    fontWeight: 600,
                    color: '#fff',
                    background: ALERT_BG[tone],
                    borderColor: 'rgba(255,255,255,.35)',
                  }}
                >
                  {svg(
                    '<path d="M12 3l10 18H2z"></path><path d="M12 10v5"></path><path d="M12 18h.01"></path>',
                    12,
                    2.2,
                  )}
                  {text}
                </span>
              ))}
            </div>
          )}
          {msg && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.75)' }}>{msg}</div>}
        </div>
        <div className="kh-wx__days">
          {dl?.time.map((d, i) => {
            const mn = dl.temperature_2m_min[i]!;
            const mx = dl.temperature_2m_max[i]!;
            const pp = dl.precipitation_probability_max?.[i] ?? 0;
            return (
              <div key={d} className="kh-wx__day">
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    color: '#fff',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {i === 0 ? t('wx_today') : DN[new Date(`${d}T12:00:00`).getDay()]}
                </span>
                <span style={{ display: 'flex', justifyContent: 'center' }}>
                  <WxIcon code={dl.weather_code[i]!} size={28} />
                </span>
                <span className="kh-mono" style={{ fontSize: 11.5, color: '#cfe4ff', whiteSpace: 'nowrap' }}>
                  {pp >= 20 ? `${pp}%` : ''}
                </span>
                <span
                  style={{
                    position: 'relative',
                    height: 5,
                    borderRadius: 999,
                    background: 'rgba(255,255,255,.18)',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${(((mn - lo) / sp) * 100).toFixed(1)}%`,
                      width: `${Math.max(6, ((mx - mn) / sp) * 100).toFixed(1)}%`,
                      borderRadius: 999,
                      background: 'linear-gradient(90deg,#9fd0ff,#ffd48a)',
                    }}
                  />
                </span>
                <span
                  className="kh-mono"
                  style={{ fontSize: 12.5, textAlign: 'right', color: 'rgba(255,255,255,.75)' }}
                >
                  {Math.round(mn)}°
                </span>
                <span
                  className="kh-mono"
                  style={{ fontSize: 13.5, fontWeight: 600, textAlign: 'right', color: '#fff' }}
                >
                  {Math.round(mx)}°
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
