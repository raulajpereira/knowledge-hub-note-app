'use client';

import { useState } from 'react';
import { Popover, Segmented } from '@/components/ui';
import { api, isApiFailure } from '@/lib/client/api';
import type { WeatherLoc } from '@/lib/prefs';
import { useI18n } from '@/i18n/client';
import { Ico } from './WeatherHours';
import { ICON, type TempUnit } from './weatherFmt';

type Place = { lat: number; lon: number; city: string; region: string };

/**
 * Location picker: search a town (on submit — Nominatim's policy forbids
 * search-as-you-type), use the device's location, or pick a recent place.
 */
export function WeatherPicker({
  anchor,
  current,
  recent,
  unit,
  onUnit,
  onPick,
  onClose,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  current: WeatherLoc;
  recent: WeatherLoc[];
  unit: TempUnit;
  onUnit: (u: TempUnit) => void;
  onPick: (loc: WeatherLoc) => void;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<'search' | 'geo' | null>(null);
  const [results, setResults] = useState<Place[] | null>(null);
  const [msg, setMsg] = useState('');

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = q.trim();
    if (!name || busy) return;
    setBusy('search');
    setMsg('');
    try {
      const r = await api<{ places: Place[] }>(`/weather/geocode?lang=${lang}&q=${encodeURIComponent(name)}`);
      setResults(r.places);
    } catch (err) {
      setResults([]);
      setMsg(isApiFailure(err) && err.code === 'city_not_found' ? t('wx_notFound') : t('wx_err'));
    } finally {
      setBusy(null);
    }
  };

  const geo = () => {
    if (!navigator.geolocation) return setMsg(t('wx_geoFail'));
    setBusy('geo');
    setMsg('');
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const lat = +p.coords.latitude.toFixed(3);
        const lon = +p.coords.longitude.toFixed(3);
        const r = await api<{ place: Place | null }>(
          `/weather/reverse?lang=${lang}&lat=${lat}&lon=${lon}`,
        ).catch(() => ({ place: null }));
        setBusy(null);
        onPick({
          lat,
          lon,
          city: r.place?.city ?? t('wx_myLoc'),
          ...(r.place?.region ? { region: r.place.region } : {}),
        });
      },
      (err) => {
        setBusy(null);
        setMsg(err.code === err.PERMISSION_DENIED ? t('wx_geoDenied') : t('wx_geoFail'));
      },
      { timeout: 10000, maximumAge: 600000 },
    );
  };

  const item = (p: WeatherLoc | Place, k: string) => (
    <button
      key={k}
      type="button"
      className="kh-wxp__item"
      aria-current={p.city === current.city && Math.abs(p.lat - current.lat) < 0.01 ? 'true' : undefined}
      onClick={() =>
        onPick({
          lat: p.lat,
          lon: p.lon,
          city: p.city,
          ...(p.region ? { region: p.region } : {}),
          manual: true,
        })
      }
    >
      <b>{p.city}</b>
      {p.region && <small>{p.region}</small>}
    </button>
  );

  return (
    <Popover
      anchor={anchor}
      align="left"
      onClose={onClose}
      className="kh-wxp"
      width={340}
      maxHeight={520}
      sheet
      role="dialog"
      aria-label={t('wx_loc')}
    >
      <h3 style={{ display: 'flex', alignItems: 'center' }}>
        {t('wx_loc')}
        <button type="button" className="kh-wx__close" onClick={onClose} aria-label={t('ui_close')}>
          ×
        </button>
      </h3>
      <form onSubmit={search} role="search">
        <input
          className="kh-menu__search"
          style={{ height: 38 }}
          autoFocus
          value={q}
          placeholder={t('wx_searchPh')}
          aria-label={t('wx_searchPh')}
          enterKeyHint="search"
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className="kh-wxp__geo" disabled={!q.trim() || !!busy}>
          {busy === 'search' ? '…' : t('wx_search')}
        </button>
      </form>
      <button type="button" className="kh-wxp__geo" onClick={geo} disabled={!!busy}>
        <Ico d={ICON.locate} size={15} />
        {busy === 'geo' ? '…' : t('wx_useGeo')}
      </button>
      {msg && (
        <div className="kh-wxp__note" role="alert">
          {msg}
        </div>
      )}
      {results && results.length > 0 && (
        <div className="kh-wxp__list" role="list" aria-label={t('wx_search')}>
          {results.map((p, i) => item(p, `r${i}`))}
        </div>
      )}
      {!results && recent.length > 0 && (
        <>
          <div className="kh-wxp__sub">{t('wx_recent')}</div>
          <div className="kh-wxp__list">{recent.map((p, i) => item(p, `h${i}`))}</div>
        </>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          justifyContent: 'space-between',
          padding: '2px 4px',
        }}
      >
        <span className="kh-wxp__note" style={{ padding: 0 }}>
          {t('wx_unit')}
        </span>
        <Segmented
          label={t('wx_unit')}
          value={unit}
          onChange={onUnit}
          options={[
            { value: 'C', label: '°C' },
            { value: 'F', label: '°F' },
          ]}
        />
      </div>
      <div className="kh-wxp__note">
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          {t('wx_osm')}
        </a>
      </div>
    </Popover>
  );
}
