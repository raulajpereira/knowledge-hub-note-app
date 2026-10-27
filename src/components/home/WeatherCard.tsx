'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Sheet, usePersistentState, useViewport } from '@/components/ui';
import { api } from '@/lib/client/api';
import type { WeatherLoc } from '@/lib/prefs';
import {
  compass,
  tempColor,
  tempGradient,
  tempInk,
  uvBand,
  wxAlerts,
  type Wx,
  type WxDay,
  type WxHour,
  type WxNow,
  type WxWarning,
} from '@/lib/weather';
import { usePref } from '@/components/shell/PrefsProvider';
import { useI18n } from '@/i18n/client';
import { WeatherHours, Ico, WindArrow } from './WeatherHours';
import { WeatherPicker } from './WeatherPicker';
import { WxIcon, WxSky, condKind } from './weatherArt';
import { ICON, dayTime, deg, duration, fill, hm, hourLabel, weekday, type TempUnit } from './weatherFmt';

const LISBOA: WeatherLoc = { lat: 38.72, lon: -9.14, city: 'Lisboa', region: 'Portugal' };
const REFRESH_MS = 30 * 60 * 1000;
const CACHE_KEY = 'kh.wx.v2';
const LEVEL_COLOR = {
  yellow: 'oklch(0.85 0.16 95)',
  orange: 'oklch(0.74 0.17 55)',
  red: 'oklch(0.62 0.22 27)',
};
const UV_SCALE =
  'linear-gradient(90deg,oklch(0.75 0.15 145),oklch(0.85 0.16 95) 30%,oklch(0.75 0.17 55) 55%,oklch(0.62 0.22 27) 78%,oklch(0.6 0.2 310))';

type Cached = { k: string; wx: Wx };
const locKey = (l: WeatherLoc) => `${l.lat.toFixed(2)},${l.lon.toFixed(2)}`;

function readCache(k: string): Wx | null {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as Cached | null;
    return c?.k === k ? c.wx : null;
  } catch {
    return null;
  }
}
function writeCache(k: string, wx: Wx) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ k, wx } satisfies Cached));
  } catch {
    // storage full / private mode: just no offline copy
  }
}

/** "Chuva a partir das 15h" — when the rain starts or stops in the next 12 hours. */
function rainLine(hours: WxHour[], tz: string, t: (k: string) => string, lang: 'pt' | 'en') {
  const next = hours.filter((h) => h.step === 1).slice(0, 12);
  if (!next.length) return null;
  const wet = (h: WxHour) => h.mm >= 0.1 && (h.pop === null || h.pop >= 30);
  if (wet(next[0]!)) {
    const dry = next.findIndex((h) => !wet(h));
    return dry < 0 ? t('wx_rainOn') : fill(t('wx_rainUntil'), { t: hm(next[dry]!.time, lang, tz) });
  }
  const w = next.find(wet);
  return w ? fill(t('wx_rainFrom'), { t: hm(w.time, lang, tz) }) : t('wx_dry');
}

/** Weather card on Início: MET Norway forecast (+ IPMA warnings) through /api/v1/weather. */
export function WeatherCard() {
  const { t, lang } = useI18n();
  const [loc, setLoc] = usePref<WeatherLoc>('weatherLoc', LISBOA);
  const [recent, setRecent] = usePersistentState<WeatherLoc[]>('wxRecent', []);
  const [unit, setUnit] = usePersistentState<TempUnit>('wxUnit', 'C');
  const [details, setDetails] = usePersistentState<boolean>('wxDetails', true);
  const [wx, setWx] = useState<Wx | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'err'>('loading');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [picker, setPicker] = useState(false);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [showWarn, setShowWarn] = useState(false);
  const [wide, setWide] = useState(false);
  const [full, setFull] = useState(false);
  const phone = useViewport() === 'phone';
  // the picker opens under the place chip it was opened from (banner or popup)
  const bannerPlaceRef = useRef<HTMLButtonElement>(null);
  const fullPlaceRef = useRef<HTMLButtonElement>(null);
  const [pickerAt, setPickerAt] = useState<'banner' | 'full'>('banner');
  const ro = useRef<ResizeObserver | null>(null);
  const k = locKey(loc);

  // in the popup the 9-day list sits beside the hours from 860 px (home.css):
  // a day's hours then take the hours' place instead of opening in the list
  const fullRef = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    ro.current = null;
    if (!el) return;
    ro.current = new ResizeObserver(() => setWide(el.clientWidth >= 860));
    ro.current.observe(el);
  }, []);

  const load = useCallback(() => {
    setBusy(true);
    api<Wx>(`/weather?lat=${loc.lat}&lon=${loc.lon}`)
      .then((r) => {
        setWx(r);
        setStatus('ok');
        writeCache(k, r);
      })
      .catch(() => setStatus((s) => (s === 'ok' ? 'ok' : 'err')))
      .finally(() => setBusy(false));
  }, [loc.lat, loc.lon, k]);

  useEffect(() => {
    const c = readCache(k);
    setWx(c);
    setStatus(c ? 'ok' : 'loading');
    setOpenDay(null);
    load();
    const id = setInterval(load, REFRESH_MS);
    const vis = () => {
      if (document.visibilityState !== 'visible') return;
      const at = Date.parse(readCache(k)?.fetchedAt ?? '');
      if (!(Date.now() - at < 15 * 60 * 1000)) load();
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [k, load]);

  useEffect(() => {
    const up = () => {
      setOnline(true);
      load();
    };
    const down = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, [load]);

  const pick = (l: WeatherLoc) => {
    setLoc(l);
    setPicker(false);
    setRecent(
      // the new place first, the one it replaces next (to go back to it)
      [l, loc, ...recent]
        .filter(
          (r, i, all) => all.findIndex((x) => x.city === r.city && Math.abs(x.lat - r.lat) < 0.01) === i,
        )
        .slice(0, 5)
        .map(({ manual: _m, ...r }) => r),
    );
  };

  const now = wx?.now;
  const kind = condKind(now?.cond ?? 'cloudy');
  const isDay = now?.day ?? true;
  const d0 = wx?.days[0];
  const at = wx ? (wx.updatedAt ?? wx.fetchedAt) : null;
  const updLine = !wx
    ? ''
    : !online
      ? fill(t('wx_offline'), { t: hm(wx.fetchedAt, lang) })
      : wx.stale
        ? fill(t('wx_stale'), { t: hm(at!, lang) })
        : fill(t('wx_updated'), { t: hm(at!, lang) });
  const warns = wx?.warnings ?? null;
  const derived = wx && !warns ? wxAlerts(wx.days, wx.now) : [];
  const openDayObj = wx?.days.find((d) => d.date === openDay) ?? null;
  const dayName = (d: WxDay, i: number) =>
    i === 0 ? t('wx_today') : i === 1 ? t('wx_tomorrow') : weekday(d.date, lang, true);
  const sun = (wx?.days ?? []).flatMap((d) => [
    ...(d.sunrise ? [{ time: d.sunrise, rise: true }] : []),
    ...(d.sunset ? [{ time: d.sunset, rise: false }] : []),
  ]);

  const sky = <WxSky cond={now?.cond ?? 'cloudy'} isDay={isDay} paused={full} scale={phone ? 0.6 : 1} />;
  const placeChip = (ref: React.RefObject<HTMLButtonElement | null>, at: 'banner' | 'full') => (
    <button
      ref={ref}
      type="button"
      className="kh-wx__place"
      aria-haspopup="dialog"
      aria-expanded={picker && pickerAt === at}
      title={t('wx_change')}
      onClick={() => {
        setPickerAt(at);
        setPicker((v) => !(v && pickerAt === at));
      }}
    >
      <Ico d={ICON.pin} />
      <span className="kh-wx__ell">
        {loc.city}
        {loc.region && <small> · {loc.region.split(',').slice(-1)[0]!.trim()}</small>}
      </span>
      <span style={{ opacity: 0.7, display: 'flex' }}>
        <Ico d={ICON.chevron} size={11} sw={2.6} />
      </span>
    </button>
  );
  const warnChip =
    warns && warns.length > 0 ? (
      <span className="kh-wx__chip" data-sumlevel={warns[0]!.level} data-always="">
        <span className="kh-wx__dot" style={{ color: LEVEL_COLOR[warns[0]!.level] }} />
        {warns.length === 1
          ? `${warns[0]!.type === 'other' ? warns[0]!.name : t(`wx_w_${warns[0]!.type}`)} · ${t(`wx_lvl_${warns[0]!.level}`)}`
          : fill(t('wx_warnN'), { n: warns.length })}
      </span>
    ) : null;

  // the full forecast, shown in the popup
  const detail = (
    <div ref={fullRef} className="kh-wxd" data-testid="weather-full" data-kind={kind}>
      <WxSky cond={now?.cond ?? 'cloudy'} isDay={isDay} scale={phone ? 0.6 : 1} />
      <div className="kh-wx__body">
        <div className="kh-wx__head">
          {placeChip(fullPlaceRef, 'full')}
          <button
            type="button"
            className="kh-wx__iconbtn"
            style={{ marginLeft: 'auto' }}
            aria-label={t('wx_refresh')}
            title={t('wx_refresh')}
            data-spin={busy}
            onClick={load}
          >
            <Ico d={ICON.refresh} size={14} />
          </button>
        </div>

        {!wx ? (
          status === 'err' ? (
            <div className="kh-wx__err" role="alert">
              <Ico d={ICON.warn} size={16} />
              <span style={{ flex: 1 }}>{online ? t('wx_err') : fill(t('wx_offline'), { t: '—' })}</span>
              <button type="button" className="kh-wx__chip" onClick={load}>
                {t('wx_retry')}
              </button>
            </div>
          ) : (
            <Skeleton label={t('wx_loading')} />
          )
        ) : (
          <>
            <div className="kh-wx__main" data-details={details}>
              <div className="kh-wx__now">
                <div className="kh-wx__hero">
                  <span className="kh-wx__heroicon">
                    <WxIcon cond={now!.cond} day={isDay} size={68} />
                  </span>
                  <div className="kh-wx__temp" style={{ textShadow: `0 0 28px ${tempColor(now!.t)}55` }}>
                    {deg(now!.t, unit)}
                  </div>
                  <div className="kh-wx__cond">
                    <b>{t(`wx_k_${now!.cond}`)}</b>
                    <span>{fill(t('wx_feelsLike'), { n: deg(now!.feels, unit) })}</span>
                    {d0 && (
                      <span className="kh-wx__hl">
                        <span>
                          {t('wx_max')} <b style={{ color: tempInk(d0.max) }}>{deg(d0.max, unit)}</b>
                        </span>
                        <span>
                          {t('wx_min')} <b style={{ color: tempInk(d0.min) }}>{deg(d0.min, unit)}</b>
                        </span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="kh-wx__summary">
                  <span style={{ color: 'oklch(calc(.84 * var(--lk)) .11 235)', display: 'flex' }}>
                    <Ico d={ICON.umbrella} size={15} />
                  </span>
                  {rainLine(wx.hours, wx.tz, t, lang)}
                </div>
                {(warns?.length || derived.length) > 0 && (
                  <div className="kh-wx__chips">
                    {warns?.length ? (
                      <WarnChips warns={warns} open={showWarn} onToggle={() => setShowWarn((v) => !v)} />
                    ) : (
                      derived.map((a) => (
                        <span key={a.key} className="kh-wx__chip" data-derived="true" title={t('wx_derived')}>
                          <Ico d={ICON.warn} size={12} sw={2.2} />
                          {t(`wx_a_${a.key}`)}
                          {a.value !== undefined && a.key !== 'storm' && a.key !== 'snow'
                            ? ` · ${a.key === 'heat' || a.key === 'cold' ? deg(a.value, unit) : a.key === 'wind' ? `${a.value} km/h` : a.key === 'rain' ? `${a.value} mm` : a.value}`
                            : ''}
                        </span>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div
                style={{ gridArea: 'hours', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                {showWarn && warns && warns.length > 0 && (
                  <WarnPanel warns={warns} area={wx.warnArea} tz={wx.tz} />
                )}
                {wide && openDayObj ? (
                  <DayPanel
                    day={openDayObj}
                    tz={wx.tz}
                    unit={unit}
                    label={dayName(openDayObj, wx.days.indexOf(openDayObj))}
                    onClose={() => setOpenDay(null)}
                  />
                ) : (
                  <>
                    <h3 className="kh-wx__label">{t('wx_next48')}</h3>
                    <WeatherHours
                      hours={wx.hours}
                      tz={wx.tz}
                      unit={unit}
                      sun={sun}
                      label={t('wx_next48')}
                      nowFirst
                    />
                  </>
                )}
              </div>

              <Week
                wx={wx}
                unit={unit}
                openDay={openDay}
                inline={!wide}
                name={dayName}
                onOpen={(d) => setOpenDay(openDay === d ? null : d)}
              />
              {details && <Tiles wx={wx} unit={unit} />}
            </div>
          </>
        )}

        <div className="kh-wx__foot">
          {updLine && (
            <span className="kh-wx__upd" data-tone={!online || wx?.stale ? 'warn' : undefined} role="status">
              {updLine}
            </span>
          )}
          {wx?.source === 'openmeteo' ? (
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
              {t('wx_srcOm')}
            </a>
          ) : (
            <a
              href="https://www.met.no/en/free-meteorological-data/Licensing-and-crediting"
              target="_blank"
              rel="noreferrer"
              title="The Norwegian Meteorological Institute (MET Norway), CC BY 4.0"
            >
              {t('wx_srcMet')}
            </a>
          )}
          {warns && (
            <a href="https://www.ipma.pt/pt/otempo/prev-sam/" target="_blank" rel="noreferrer">
              {t('wx_srcIpma')}
            </a>
          )}
          {wx && (
            <button type="button" aria-expanded={details} onClick={() => setDetails(!details)}>
              {details ? t('wx_less') : t('wx_more')}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const close = () => {
    setFull(false);
    setPicker(false);
  };
  return (
    <section
      className="kh-wx kh-wxb"
      data-testid="weather"
      data-kind={kind}
      aria-label={`${t('wx_loc')}: ${loc.city}`}
    >
      {sky}
      <button
        type="button"
        className="kh-wxb__open"
        aria-haspopup="dialog"
        aria-expanded={full}
        aria-label={fill(t('wx_open'), { c: loc.city })}
        onClick={() => setFull(true)}
      />
      <div className="kh-wxb__body">
        <div className="kh-wxb__left">
          {placeChip(bannerPlaceRef, 'banner')}
          {!wx ? (
            status === 'err' ? (
              <div className="kh-wxb__msg" role="alert">
                <Ico d={ICON.warn} size={14} />
                {online ? t('wx_err') : fill(t('wx_offline'), { t: '—' })}
                <button type="button" className="kh-wx__chip kh-wxb__live" onClick={load}>
                  {t('wx_retry')}
                </button>
              </div>
            ) : (
              <div className="kh-wxb__msg" aria-busy="true">
                <span className="kh-wx__sk" style={{ width: 200, height: 48 }} />
                <span className="kh-wx__sk" style={{ width: 140, height: 14 }} />
              </div>
            )
          ) : (
            <>
              <div className="kh-wx__hero kh-wxb__hero">
                <span className="kh-wx__heroicon">
                  <WxIcon cond={now!.cond} day={isDay} size={52} />
                </span>
                <div className="kh-wx__temp">{deg(now!.t, unit)}</div>
                <div className="kh-wx__cond">
                  <b>{t(`wx_k_${now!.cond}`)}</b>
                  <span>{fill(t('wx_feelsLike'), { n: deg(now!.feels, unit) })}</span>
                </div>
              </div>
              <div className="kh-wxb__chips">
                {d0 && (
                  <span className="kh-wx__chip">
                    {t('wx_max')} <b style={{ color: tempInk(d0.max) }}>{deg(d0.max, unit)}</b>
                    {t('wx_min')} <b style={{ color: tempInk(d0.min) }}>{deg(d0.min, unit)}</b>
                  </span>
                )}
                <span className="kh-wx__chip kh-wxb__opt">
                  <Ico d={ICON.wind} size={12} />
                  <b>{now!.wind}</b>km/h
                </span>
                {warnChip}
              </div>
            </>
          )}
        </div>
        {wx && (
          <div className="kh-wxb__right">
            <div className="kh-wxb__hours" aria-hidden="true">
              {wx.hours.slice(0, 6).map((h, i) => (
                <span key={h.time}>
                  <small>{i === 0 ? t('wx_now') : hourLabel(h.time, lang, wx.tz)}</small>
                  <WxIcon cond={h.cond} day={h.day} size={26} />
                  <b style={{ color: tempInk(h.t) }}>{deg(h.t, unit)}</b>
                  <i>{h.pop !== null && h.pop >= 20 ? `${h.pop}%` : ''}</i>
                </span>
              ))}
            </div>
            <div className="kh-wxb__hint">
              <Ico d={ICON.umbrella} size={13} />
              <span className="kh-wx__ell">{rainLine(wx.hours, wx.tz, t, lang)}</span>
              <span className="kh-wxb__more">
                {t('wx_full')}
                <Ico d={ICON.right} size={12} sw={2.4} />
              </span>
            </div>
          </div>
        )}
      </div>
      {full &&
        (phone ? (
          <Sheet
            open
            onClose={close}
            title={t('wx_title')}
            closeLabel={t('ui_close')}
            className="kh-wxm kh-wxm--sheet"
          >
            {detail}
          </Sheet>
        ) : (
          <Modal
            open
            onClose={close}
            title={t('wx_title')}
            closeLabel={t('ui_close')}
            size="lg"
            className="kh-wxm"
          >
            {detail}
          </Modal>
        ))}
      {picker && (
        <WeatherPicker
          anchor={pickerAt === 'full' ? fullPlaceRef : bannerPlaceRef}
          current={loc}
          recent={recent}
          unit={unit}
          onUnit={setUnit}
          onPick={pick}
          onClose={() => setPicker(false)}
        />
      )}
    </section>
  );
}

function Skeleton({ label }: { label: string }) {
  return (
    <div className="kh-wx__main" aria-busy="true" aria-label={label}>
      <div className="kh-wx__now">
        <div className="kh-wx__sk" style={{ width: 240, height: 72 }} />
        <div className="kh-wx__sk" style={{ width: 180, height: 16 }} />
      </div>
      <div style={{ gridArea: 'hours' }} className="kh-wx__sk">
        <div style={{ height: 170 }} />
      </div>
      <div style={{ gridArea: 'week' }} className="kh-wx__sk">
        <div style={{ height: 250 }} />
      </div>
    </div>
  );
}

function WarnChips({ warns, open, onToggle }: { warns: WxWarning[]; open: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  // one chip per type, at its highest level (the list is sorted by severity)
  const top = warns.filter((w, i) => warns.findIndex((x) => x.type === w.type && x.name === w.name) === i);
  return (
    <>
      {top.slice(0, 3).map((w) => (
        <button
          key={`${w.type}${w.name}`}
          type="button"
          className="kh-wx__chip"
          data-level={w.level}
          data-each={warns.length > 1 ? '' : undefined}
          aria-expanded={open}
          onClick={onToggle}
        >
          <span className="kh-wx__dot" style={{ color: LEVEL_COLOR[w.level] }} />
          {w.type === 'other' ? w.name : t(`wx_w_${w.type}`)} · {t(`wx_lvl_${w.level}`)}
        </button>
      ))}
      {warns.length > 1 && (
        <button
          type="button"
          className="kh-wx__chip"
          data-sum=""
          data-sumlevel={warns[0]!.level}
          aria-expanded={open}
          onClick={onToggle}
        >
          <Ico d={ICON.warn} size={12} sw={2.2} />
          {fill(t('wx_warnN'), { n: warns.length })}
          <Ico d={ICON.chevron} size={10} sw={2.6} />
        </button>
      )}
    </>
  );
}

function WarnPanel({ warns, area, tz }: { warns: WxWarning[]; area: string | null; tz: string }) {
  const { t, lang } = useI18n();
  return (
    <div className="kh-wx__warns">
      <h3>{fill(t('wx_warnTitle'), { a: area ?? '' })}</h3>
      {warns.map((w, i) => (
        <div key={i} className="kh-wx__warn" style={{ '--lvl': LEVEL_COLOR[w.level] } as React.CSSProperties}>
          <span>
            <b>{w.type === 'other' ? w.name : t(`wx_w_${w.type}`)}</b> · {t(`wx_lvl_${w.level}`)} ·{' '}
            {dayTime(w.start, lang, tz)} – {dayTime(w.end, lang, tz)}
          </span>
          {w.text && <span>{w.text}</span>}
        </div>
      ))}
    </div>
  );
}

function Week({
  wx,
  unit,
  openDay,
  inline,
  name: longName,
  onOpen,
}: {
  wx: Wx;
  unit: TempUnit;
  openDay: string | null;
  /** open the day's hours inside the list (narrow card) */
  inline: boolean;
  name: (d: WxDay, i: number) => string;
  onOpen: (date: string) => void;
}) {
  const { t, lang } = useI18n();
  const lo = Math.min(...wx.days.map((d) => d.min), wx.now.t);
  const hi = Math.max(...wx.days.map((d) => d.max), wx.now.t);
  const sp = Math.max(1, hi - lo);
  const pc = (v: number) => `${(((v - lo) / sp) * 100).toFixed(1)}%`;
  const name = (d: WxDay, i: number) =>
    i === 0 ? t('wx_today') : i === 1 ? t('wx_tomorrow') : weekday(d.date, lang);
  return (
    <div className="kh-wx__week">
      <h3 className="kh-wx__label">{fill(t('wx_days'), { n: wx.days.length })}</h3>
      <div className="kh-wx__days">
        {wx.days.map((d, i) => {
          const open = openDay === d.date;
          return (
            <Fragment key={d.date}>
              <button
                type="button"
                className="kh-wx__day"
                aria-expanded={open}
                aria-label={`${name(d, i)}: ${t(`wx_k_${d.cond}`)}, ${deg(d.min, unit)} – ${deg(d.max, unit)}${d.pop !== null ? `, ${d.pop}%` : ''}`}
                onClick={() => onOpen(d.date)}
              >
                <span className="kh-wx__dname">{name(d, i)}</span>
                <WxIcon cond={d.cond} size={28} />
                <span className="kh-wx__dpop">{d.pop !== null && d.pop >= 20 ? `${d.pop}%` : ''}</span>
                <span className="kh-wx__dmin">{deg(d.min, unit)}</span>
                <span className="kh-wx__range">
                  <span
                    style={{
                      left: pc(d.min),
                      width: `max(8px, ${pc(lo + d.max - d.min)})`,
                      background: tempGradient(d.min, d.max),
                    }}
                  />
                  {i === 0 && <i style={{ left: pc(Math.min(Math.max(wx.now.t, d.min), d.max)) }} />}
                </span>
                <span className="kh-wx__dmax" style={{ color: tempInk(d.max) }}>
                  {deg(d.max, unit)}
                </span>
              </button>
              {open && inline && <DayPanel day={d} tz={wx.tz} unit={unit} label={longName(d, i)} />}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function DayPanel({
  day,
  tz,
  unit,
  label,
  onClose,
}: {
  day: WxDay;
  tz: string;
  unit: TempUnit;
  label: string;
  onClose?: () => void;
}) {
  const { t, lang } = useI18n();
  const sun = [
    ...(day.sunrise ? [{ time: day.sunrise, rise: true }] : []),
    ...(day.sunset ? [{ time: day.sunset, rise: false }] : []),
  ];
  return (
    <div
      className="kh-wx__dpanel"
      data-wide={onClose ? '' : undefined}
      role="region"
      aria-label={fill(t('wx_dayHours'), { d: label })}
    >
      {onClose && (
        <h3 className="kh-wx__label">
          {fill(t('wx_dayHours'), { d: label })}
          <button type="button" className="kh-wx__close" onClick={onClose} aria-label={t('wx_closeDay')}>
            ×
          </button>
        </h3>
      )}
      <WeatherHours
        hours={day.hours}
        tz={tz}
        unit={unit}
        sun={sun}
        label={fill(t('wx_dayHours'), { d: label })}
      />
      <div className="kh-wx__dstats">
        <span>
          <Ico d={ICON.umbrella} size={12} /> <b>{day.mm} mm</b>
          {day.pop !== null ? ` · ${day.pop}%` : ''}
        </span>
        <span>
          <Ico d={ICON.wind} size={12} /> <b>{day.wind} km/h</b>
          {day.gust !== null ? ` · ${fill(t('wx_gusts'), { n: `${day.gust} km/h` })}` : ''}
        </span>
        {day.uv !== null && (
          <span>
            UV <b>{Math.round(day.uv)}</b> · {t(`wx_uv${uvBand(day.uv)}`)}
          </span>
        )}
        {day.sunrise && day.sunset && (
          <span>
            <Ico d={ICON.sun} size={12} /> <b>{hm(day.sunrise, lang, tz)}</b> –{' '}
            <b>{hm(day.sunset, lang, tz)}</b>
          </span>
        )}
      </div>
    </div>
  );
}

function Tiles({ wx, unit }: { wx: Wx; unit: TempUnit }) {
  const { t, lang } = useI18n();
  const n: WxNow = wx.now;
  const d0 = wx.days[0];
  const tz = wx.tz;
  const later = wx.hours.find((h) => Date.parse(h.time) >= Date.parse(n.time) + 3 * 3600_000);
  const trend =
    n.pres === null || later?.pres == null
      ? null
      : later.pres - n.pres > 1
        ? 'wx_presUp'
        : later.pres - n.pres < -1
          ? 'wx_presDown'
          : 'wx_presSteady';
  const mm24 = Math.round(wx.hours.slice(0, 24).reduce((s, h) => s + h.mm, 0) * 10) / 10;
  const strong = (n.gust ?? n.wind) >= 50;
  const rise = d0?.sunrise ? Date.parse(d0.sunrise) : null;
  const set = d0?.sunset ? Date.parse(d0.sunset) : null;
  const nowMs = Date.parse(wx.fetchedAt);
  const sunPos = rise && set ? Math.min(1, Math.max(0, (nowMs - rise) / (set - rise))) : null;
  const uv = d0?.uv ?? null;
  return (
    <div className="kh-wx__tiles">
      <div className="kh-wx__tile">
        <span>
          <Ico d={ICON.wind} size={12} />
          {t('wx_windTile')}
        </span>
        <div className="kh-wx__tilerow">
          <b style={strong ? { color: 'oklch(calc(.86 * var(--lk)) .14 70)' } : undefined}>
            {n.wind}
            <small>km/h</small>
          </b>
          {n.dir !== null && <Compass dir={n.dir} />}
        </div>
        <span>
          {n.dir !== null ? fill(t('wx_windFrom'), { d: compass(n.dir, lang) }) : ''}
          {n.gust !== null ? ` · ${fill(t('wx_gusts'), { n: n.gust })}` : ''}
        </span>
      </div>
      {n.hum !== null && (
        <div className="kh-wx__tile">
          <span>
            <Ico d={ICON.hum} size={12} />
            {t('wx_humTile')}
          </span>
          <b>
            {n.hum}
            <small>%</small>
          </b>
          {n.dew !== null && <span>{fill(t('wx_dew'), { n: deg(n.dew, unit) })}</span>}
          <span className="kh-wx__meter">
            <span style={{ width: `${n.hum}%`, background: 'oklch(0.72 0.12 235)' }} />
          </span>
        </div>
      )}
      {uv !== null && (
        <div className="kh-wx__tile">
          <span>
            <Ico d={ICON.uv} size={12} />
            {t('wx_uv')}
          </span>
          <b>
            {Math.round(uv)}
            <small>{t(`wx_uv${uvBand(uv)}`)}</small>
          </b>
          <span>{t('wx_uvPeak')}</span>
          <span className="kh-wx__meter" style={{ background: UV_SCALE }}>
            <i style={{ left: `${Math.min(100, (uv / 11) * 100)}%` }} />
          </span>
        </div>
      )}
      {n.pres !== null && (
        <div className="kh-wx__tile">
          <span>
            <Ico d={ICON.gauge} size={12} />
            {t('wx_pres')}
          </span>
          <b>
            {n.pres}
            <small>hPa</small>
          </b>
          {trend && <span>{t(trend)}</span>}
        </div>
      )}
      {d0?.sunrise && d0.sunset && (
        <div className="kh-wx__tile">
          <span>
            <Ico d={ICON.sun} size={12} />
            {t('wx_sun')}
          </span>
          <div className="kh-wx__tilerow">
            <b style={{ fontSize: 18 }}>
              {hm(d0.sunrise, lang, tz)}
              <small>↑</small>
            </b>
            <b style={{ fontSize: 18 }}>
              {hm(d0.sunset, lang, tz)}
              <small>↓</small>
            </b>
          </div>
          <SunArc pos={sunPos} />
          <span>{fill(t('wx_daylight'), { n: duration(set! - rise!) })}</span>
        </div>
      )}
      {d0 && (
        <div className="kh-wx__tile">
          <span>
            <Ico d={ICON.umbrella} size={12} />
            {t('wx_precip')}
          </span>
          <b style={{ color: d0.mm > 0 ? 'oklch(calc(.84 * var(--lk)) .11 235)' : undefined }}>
            {d0.mm}
            <small>mm</small>
          </b>
          <span>{fill(t('wx_precip24'), { n: mm24 })}</span>
          {d0.pop !== null && d0.pop >= 10 && <span>{fill(t('wx_popMax'), { n: d0.pop })}</span>}
        </div>
      )}
    </div>
  );
}

function Compass({ dir }: { dir: number }) {
  return (
    <span
      style={{
        position: 'relative',
        width: 40,
        height: 40,
        flex: 'none',
        borderRadius: '50%',
        border: '1px solid rgb(var(--w) / .3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--ink-hi)',
      }}
      aria-hidden="true"
    >
      <span style={{ position: 'absolute', top: 1, fontSize: 8, fontWeight: 700, opacity: 0.7 }}>N</span>
      <WindArrow dir={dir} size={18} />
    </span>
  );
}

function SunArc({ pos }: { pos: number | null }) {
  const W = 120;
  const H = 30;
  // half-ellipse from sunrise (left) to sunset (right); the dot is the sun now
  const x = pos === null ? null : 6 + pos * (W - 12);
  const y = pos === null ? null : H - 2 - Math.sin(pos * Math.PI) * (H - 8);
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path
        d={`M6 ${H - 2} Q ${W / 2} ${-H + 12} ${W - 6} ${H - 2}`}
        fill="none"
        stroke="rgb(var(--w) / .35)"
        strokeDasharray="3 3"
      />
      <line x1="0" x2={W} y1={H - 2} y2={H - 2} stroke="rgb(var(--w) / .25)" />
      {x !== null && y !== null && pos! > 0 && pos! < 1 && <circle cx={x} cy={y} r="4" fill="#ffc861" />}
    </svg>
  );
}
