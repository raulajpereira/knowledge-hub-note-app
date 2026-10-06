'use client';

/* eslint-disable @next/next/no-img-element -- the user's own images, streamed by our API */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AMBIENTS } from '@/components/ui';
import { usePref } from '@/components/shell/PrefsProvider';
import { useShell } from '@/components/shell/ShellContext';
import { assetUrl } from '@/components/shell/assetUrl';
import { fontCss, type FontName } from '@/components/shell/fonts';
import { removeImage, uploadImage } from '@/components/shell/uploadImage';
import { api, isApiFailure } from '@/lib/client/api';
import {
  ACCENT_SWATCHES,
  AMBIENT_NAMES,
  BG_DEFAULTS,
  DEFAULT_ACCENT,
  FONTS,
  type KnownPrefs,
} from '@/lib/prefs';
import { useI18n } from '@/i18n/client';
import type { Lang } from '@/i18n';

type Bg = NonNullable<KnownPrefs['bg']>;

export function imageError(e: unknown, t: (k: string) => string): string {
  if (isApiFailure(e) && e.code === 'file_too_large') return t('set_imgTooBig');
  return t('set_imgBad');
}

export function Card({
  title,
  desc,
  action,
  children,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="kh-set__card">
      <div className="kh-set__head">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div className="kh-set__title">{title}</div>
          {desc && <div className="kh-set__desc">{desc}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function LookTab() {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const { me, modules } = useShell();
  const [bg, setBg] = usePref<Bg>('bg', BG_DEFAULTS);
  const [font, setFont] = usePref<FontName>('font', 'Geist');
  const [fontScale, setFontScale] = usePref<number>('fontScale', 1);
  const [uiScale, setUiScale] = usePref<number>('uiScale', 1);
  const [glass, setGlass] = usePref<number | undefined>('glassBlur', undefined);
  const [accent, setAccent] = usePref<string>('accent', DEFAULT_ACCENT);
  const [hover, setHover] = useState<FontName | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const photoV = me.assets.background;
  const canPhoto = modules.has('bgphoto');
  const isPhoto = bg.mode === 'photo' && Boolean(photoV) && canPhoto;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    setMsg(t('set_uploading'));
    try {
      await uploadImage('background', f);
      setBg({ ...bg, mode: 'photo' });
      setMsg('');
      router.refresh();
    } catch (x) {
      setMsg(imageError(x, t));
    } finally {
      setBusy(false);
    }
  };
  const removePhoto = async () => {
    await removeImage('background');
    if (bg.mode === 'photo') setBg({ ...bg, mode: 'Areia' });
    router.refresh();
  };
  const pickLang = (l: Lang) => {
    if (l === lang) return;
    setLang(l);
    void api('/me', { lang: l }, 'PATCH').catch(() => {});
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card title={t('bgTitle')} desc={t('bgDesc')}>
        <div className="kh-set__tiles">
          {AMBIENT_NAMES.map((name) => {
            const a = AMBIENTS[name];
            return (
              <button
                key={name}
                type="button"
                className="kh-set__tile"
                aria-pressed={!isPhoto && bg.mode === name}
                onClick={() => setBg({ ...bg, mode: name })}
              >
                <div className="kh-set__swatch" style={{ background: a.base }}>
                  <div
                    style={{
                      position: 'absolute',
                      width: '70%',
                      height: '90%',
                      left: '-15%',
                      top: '-30%',
                      borderRadius: '50%',
                      background: a.b1,
                      filter: 'blur(18px)',
                      opacity: 0.9,
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      width: '60%',
                      height: '80%',
                      right: '-10%',
                      bottom: '-30%',
                      borderRadius: '50%',
                      background: a.b3,
                      filter: 'blur(18px)',
                      opacity: 0.7,
                    }}
                  />
                </div>
                <div className="kh-set__tileFoot">
                  <span>{name}</span>
                  <span className="kh-set__dot" />
                </div>
              </button>
            );
          })}
          <div
            className="kh-set__tile"
            role="button"
            tabIndex={0}
            aria-pressed={isPhoto}
            onClick={() => photoV && canPhoto && setBg({ ...bg, mode: 'photo' })}
            onKeyDown={(e) => e.key === 'Enter' && photoV && canPhoto && setBg({ ...bg, mode: 'photo' })}
          >
            {photoV ? (
              <img
                src={assetUrl('background', photoV)}
                alt={t('yourPhoto')}
                style={{
                  display: 'block',
                  width: '100%',
                  aspectRatio: '16/10',
                  borderRadius: 16,
                  objectFit: 'cover',
                }}
              />
            ) : canPhoto ? (
              <label className="kh-set__drop" onClick={(e) => e.stopPropagation()}>
                <span className="kh-set__plus">+</span>
                {t('uploadPhoto')}
                <input
                  type="file"
                  accept="image/*"
                  onChange={onFile}
                  style={{ display: 'none' }}
                  disabled={busy}
                />
              </label>
            ) : (
              <div className="kh-set__drop" style={{ opacity: 0.5, cursor: 'default' }}>
                {t('soon_notInPlan')}
              </div>
            )}
            <div className="kh-set__tileFoot">
              <span>{t('yourPhoto')}</span>
              <span className="kh-set__dot" />
            </div>
          </div>
        </div>

        {canPhoto && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <label className="kh-set__solid">
              {t('choosePhoto')}
              <input
                type="file"
                accept="image/*"
                onChange={onFile}
                style={{ display: 'none' }}
                disabled={busy}
              />
            </label>
            {photoV && (
              <button type="button" className="kh-set__soft" onClick={removePhoto}>
                {t('removePhoto')}
              </button>
            )}
            <span role="status" style={{ fontSize: 13, color: 'rgba(255,248,240,.6)' }}>
              {msg}
            </span>
          </div>
        )}

        {isPhoto && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 14 }}>
            <div className="kh-set__range">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span>{t('blur')}</span>
                <span className="kh-mono" style={{ color: 'rgba(255,248,240,.75)' }}>
                  {bg.blur}px
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={80}
                step={1}
                value={bg.blur}
                aria-label={t('blur')}
                onChange={(e) => setBg({ ...bg, blur: +e.target.value })}
              />
            </div>
            <div className="kh-set__range">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span>{t('dim')}</span>
                <span className="kh-mono" style={{ color: 'rgba(255,248,240,.75)' }}>
                  {bg.dim}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={80}
                step={1}
                value={bg.dim}
                aria-label={t('dim')}
                onChange={(e) => setBg({ ...bg, dim: +e.target.value })}
              />
            </div>
          </div>
        )}
      </Card>

      {modules.has('typeface') && (
        <Card title={t('fontTitle')} desc={t('fontDesc')}>
          <div className="kh-set__fonts" onMouseLeave={() => setHover(null)}>
            {FONTS.map((f) => (
              <button
                key={f}
                type="button"
                className="kh-set__font"
                aria-pressed={font === f}
                style={{ fontFamily: fontCss(f) }}
                onClick={() => setFont(f)}
                onMouseEnter={() => setHover(f)}
                onFocus={() => setHover(f)}
              >
                <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1 }}>
                  Aa
                </span>
                <span
                  style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {f}
                </span>
              </button>
            ))}
          </div>
          <div className="kh-set__preview" style={{ fontFamily: fontCss(hover ?? font) }}>
            <div
              className="kh-mono"
              style={{
                fontSize: 12,
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                color: 'rgba(255,248,240,.55)',
              }}
            >
              {t('preview')} · {hover ?? font}
            </div>
            <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.15 }}>
              {t('previewTitle')}
            </div>
            <div
              style={{ fontSize: 15, lineHeight: 1.6, color: 'rgba(255,248,240,.85)', textWrap: 'pretty' }}
            >
              {t('previewBody')}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span
                style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  background: '#fbf8f5',
                  color: '#2a211c',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {t('share')}
              </span>
              <span
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,.12)',
                  fontSize: 13,
                }}
              >
                Performance
              </span>
            </div>
          </div>
        </Card>
      )}

      <Card
        title={t('sizeTitle')}
        desc={t('sizeDesc')}
        action={
          <button
            type="button"
            className="kh-set__ghost"
            onClick={() => {
              setFontScale(null);
              setUiScale(null);
            }}
          >
            {t('sizeReset')}
          </button>
        }
      >
        <div className="kh-set__rows">
          <div className="kh-set__row">
            <span style={{ fontSize: 14 }}>{t('sizeFont')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,248,240,.6)' }}>A</span>
              <input
                type="range"
                min={0.85}
                max={1.25}
                step={0.05}
                value={fontScale}
                aria-label={t('sizeFont')}
                onChange={(e) => setFontScale(+(+e.target.value).toFixed(2))}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 18, color: 'rgba(255,248,240,.8)' }}>A</span>
            </div>
            <span>{Math.round(fontScale * 100)}%</span>
          </div>
          <div className="kh-set__row">
            <span style={{ fontSize: 14 }}>{t('sizeUi')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{ width: 10, height: 10, borderRadius: 3, border: '1.5px solid rgba(255,248,240,.6)' }}
              />
              <input
                type="range"
                min={0.8}
                max={1.2}
                step={0.05}
                value={uiScale}
                aria-label={t('sizeUi')}
                onChange={(e) => setUiScale(+(+e.target.value).toFixed(2))}
                style={{ flex: 1 }}
              />
              <span
                style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid rgba(255,248,240,.8)' }}
              />
            </div>
            <span>{Math.round(uiScale * 100)}%</span>
          </div>
        </div>
      </Card>

      {modules.has('glass') && (
        <Card
          title={t('glassTitle')}
          desc={t('glassDesc')}
          action={
            <button type="button" className="kh-set__ghost" onClick={() => setGlass(null)}>
              {t('sizeReset')}
            </button>
          }
        >
          <div className="kh-set__rows">
            <div className="kh-set__row">
              <span style={{ fontSize: 14 }}>{t('glassBlur')}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,248,240,.6)' }}>{t('glassLess')}</span>
                <input
                  type="range"
                  min={0}
                  max={80}
                  step={2}
                  value={glass ?? 34}
                  aria-label={t('glassBlur')}
                  onChange={(e) => setGlass(+e.target.value)}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 12, color: 'rgba(255,248,240,.8)' }}>{t('glassMore')}</span>
              </div>
              <span>{glass === undefined ? t('set_glassOriginal') : `${glass}px`}</span>
            </div>
          </div>
        </Card>
      )}

      {modules.has('accent') && (
        <div className="kh-set__card" style={{ gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="kh-set__title">{t('set_accTitle')}</div>
              <div className="kh-set__desc">{t('set_accDesc')}</div>
            </div>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', whiteSpace: 'nowrap' }}>
              <span>Knowledge</span>
              <span style={{ color: 'var(--accent)' }}>Hub</span>
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            {ACCENT_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                aria-label={c}
                aria-pressed={c === accent}
                onClick={() => setAccent(c)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  border: 0,
                  padding: 0,
                  cursor: 'pointer',
                  background: c,
                  boxShadow:
                    c === accent
                      ? '0 0 0 2px rgba(30,24,20,.9),0 0 0 4px #fbf8f5'
                      : '0 0 0 1px rgba(255,255,255,.2)',
                }}
              />
            ))}
            <label
              title={t('set_accCustom')}
              style={{
                position: 'relative',
                width: 34,
                height: 34,
                borderRadius: '50%',
                cursor: 'pointer',
                background: 'conic-gradient(from 0deg,#f55,#fd5,#5f8,#5df,#58f,#c5f,#f55)',
                boxShadow: accent.startsWith('#')
                  ? '0 0 0 2px rgba(30,24,20,.9),0 0 0 4px #fbf8f5'
                  : '0 0 0 1px rgba(255,255,255,.25)',
                overflow: 'hidden',
              }}
            >
              <input
                type="color"
                aria-label={t('set_accCustom')}
                value={accent.startsWith('#') ? accent : '#4a9cff'}
                onChange={(e) => setAccent(e.target.value)}
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
              />
            </label>
            <button
              type="button"
              className="kh-set__ghost"
              style={{ height: 32, fontSize: 12.5, marginLeft: 'auto' }}
              onClick={() => setAccent(null)}
            >
              {t('set_reset')}
            </button>
          </div>
        </div>
      )}

      <Card
        title={t('langTitle')}
        desc={t('langDesc')}
        action={
          <div className="kh-set__seg">
            {(
              [
                ['pt', 'PT', 'Português'],
                ['en', 'EN', 'English'],
              ] as const
            ).map(([id, code, name]) => (
              <button key={id} type="button" aria-pressed={lang === id} onClick={() => pickLang(id)}>
                <span className="kh-mono" style={{ fontSize: 12 }}>
                  {code}
                </span>
                <span style={{ fontWeight: 500 }}>{name}</span>
              </button>
            ))}
          </div>
        }
      />
    </div>
  );
}
