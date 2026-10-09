'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Modal, useConfirm } from '@/components/ui';
import { StrengthMeter } from '@/components/auth/PasswordMeter';
import { authErrorMessage } from '@/components/auth/authErrors';
import { api, isApiFailure, type ApiFailure } from '@/lib/client/api';
import { MIN_PASSWORD } from '@/lib/passwordStrength';
import { useI18n } from '@/i18n/client';
import { Icon } from './icons';
import { LIC_FAMILIES, tierGradient, tierOf } from './plan';
import { AvatarFace } from './Avatar';
import { removeImage, uploadImage } from './uploadImage';
import { useShell } from './ShellContext';
import { useReauth } from './useReauth';

type Session = {
  id: string;
  current: boolean;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
};

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** "Chrome · macOS" from a User-Agent (good enough for recognising one's own devices). */
export function deviceLabel(ua: string | null): { label: string; phone: boolean } | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  const label = [browser, os].filter(Boolean).join(' · ');
  return label ? { label, phone: /iPhone|Android.*Mobile/.test(ua) } : null;
}

function since(iso: string, lang: string, nowLabel: string): string {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return nowLabel;
  const rtf = new Intl.RelativeTimeFormat(lang === 'en' ? 'en' : 'pt', { numeric: 'auto' });
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86400), 'day');
}

export function AccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const confirm = useConfirm();
  const { me } = useShell();
  const { withReauth, dialog } = useReauth();
  const [delErr, setDelErr] = useState('');
  const tier = tierOf(me.tenant.planCode);
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-PT');

  // ── Profile ──
  const [name, setName] = useState(me.user.name);
  const [savedName, setSavedName] = useState(me.user.name);
  const [nameOk, setNameOk] = useState(false);
  const saveName = async () => {
    const v = name.trim();
    if (!v || v === savedName) return;
    await api('/me', { name: v }, 'PATCH');
    setSavedName(v);
    setNameOk(true);
    setTimeout(() => setNameOk(false), 1600);
    router.refresh();
  };

  // ── Photo ──
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState('');
  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setPhotoBusy(true);
    setPhotoMsg('');
    try {
      await uploadImage('avatar', f);
      router.refresh();
    } catch (x) {
      setPhotoMsg(isApiFailure(x) && x.code === 'file_too_large' ? t('set_imgTooBig') : t('set_imgBad'));
    } finally {
      setPhotoBusy(false);
    }
  };
  const removePhoto = async () => {
    await removeImage('avatar');
    router.refresh();
  };

  // ── Password ──
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [conf, setConf] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const mismatch = Boolean(conf) && conf !== next;
  const pwReady = Boolean(cur) && next.length >= MIN_PASSWORD && next === conf;
  const changePw = async () => {
    if (!pwReady) {
      setPwMsg(
        mismatch
          ? { ok: false, text: t('acc_pwMismatch') }
          : next && next.length < MIN_PASSWORD
            ? { ok: false, text: t('reg_ePw') }
            : null,
      );
      return;
    }
    setPwBusy(true);
    try {
      await api('/me/password', { current: cur, next });
      setCur('');
      setNext('');
      setConf('');
      setPwMsg({ ok: true, text: t('acc_pwOk') });
      loadSessions();
    } catch (e) {
      const f = e as ApiFailure;
      setPwMsg({
        ok: false,
        text: f.code === 'bad_credentials' ? t('acc_pwCurBad') : authErrorMessage(f, t),
      });
    } finally {
      setPwBusy(false);
    }
  };

  // ── 2FA ──
  const [totpOn, setTotpOn] = useState(me.user.totpEnabled);
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState(false);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [offOpen, setOffOpen] = useState(false);
  const [offPass, setOffPass] = useState('');
  const [offCode, setOffCode] = useState('');
  const [offErr, setOffErr] = useState('');

  const toggle2fa = async () => {
    if (totpOn) {
      setOffPass('');
      setOffCode('');
      setOffErr('');
      setOffOpen(true);
      return;
    }
    if (setup) return setSetup(null);
    const r = await withReauth(() => api<{ secret: string; qrSvg: string }>('/auth/2fa/setup', {}));
    if (r) {
      setSetup(r);
      setCode('');
      setCodeErr(false);
      setRecovery(null);
    }
  };
  const verify2fa = async () => {
    try {
      const r = await withReauth(() => api<{ recoveryCodes: string[] }>('/auth/2fa/enable', { code }));
      if (!r) return;
      setTotpOn(true);
      setSetup(null);
      setRecovery(r.recoveryCodes);
    } catch {
      setCodeErr(true);
    }
  };
  const disable2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/auth/2fa/disable', { password: offPass, code: offCode });
      setTotpOn(false);
      setRecovery(null);
      setOffOpen(false);
    } catch (x) {
      setOffErr(
        isApiFailure(x) && x.code === 'locked'
          ? t('lock_wait').replace('{s}', String(x.retryAfter ?? 30))
          : t('acc_2faBad'),
      );
    }
  };

  // ── Sessions ──
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const loadSessions = useCallback(() => {
    api<{ sessions: Session[] }>('/me/sessions')
      .then((r) => setSessions(r.sessions))
      .catch(() => setSessions([]));
  }, []);
  useEffect(() => {
    if (open) loadSessions();
  }, [open, loadSessions]);

  const endOne = async (s: Session, label: string) => {
    const ok = await confirm({
      title: t('acc_endT'),
      body: t('acc_endB').replace('{x}', label),
      confirmLabel: t('acc_endSess'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    await api(`/me/sessions/${s.id}`, undefined, 'DELETE');
    loadSessions();
  };
  const endOthers = async () => {
    const ok = await confirm({
      title: t('acc_endT'),
      body: t('acc_endAllB'),
      confirmLabel: t('acc_endOthers'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    await api('/me/sessions', undefined, 'DELETE');
    loadSessions();
  };

  const logout = async () => {
    const ok = await confirm({
      title: t('acc_logoutT'),
      body: t('acc_logoutB'),
      confirmLabel: t('acc_logout'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    await api('/auth/logout', {}).catch(() => {});
    router.replace('/login');
    router.refresh();
  };

  const renew = me.tenant.renewAt ?? me.tenant.trialEndsAt;
  const licValid = [
    tier === 'ULTRA' ? t('lic_all') : '',
    renew ? t('lic_valid').replace('{d}', fmtDate(renew)) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Modal open={open} onClose={onClose} title={t('acc_title')} closeLabel={t('i_close')} className="kh-acc">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <label
            title={t('acc_changePhoto')}
            style={{
              position: 'relative',
              width: 96,
              height: 96,
              flex: 'none',
              borderRadius: '50%',
              cursor: 'pointer',
              background: 'linear-gradient(135deg,rgba(255,255,255,.2),rgba(255,255,255,.06))',
              border: me.assets.avatar ? '0' : '1.5px dashed rgba(255,255,255,.4)',
              boxSizing: 'border-box',
            }}
          >
            <input
              type="file"
              accept="image/*"
              onChange={onPhoto}
              style={{ display: 'none' }}
              disabled={photoBusy}
            />
            {me.assets.avatar ? (
              <AvatarFace name={savedName} photoV={me.assets.avatar} size={96} fontSize={30} ring="none" />
            ) : (
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  fontSize: 11,
                  color: 'rgba(255,248,240,.8)',
                  textAlign: 'center',
                }}
              >
                <Icon name="camera" size={22} sw={1.7} />
                {t('acc_addPhoto')}
              </span>
            )}
            <span
              style={{
                position: 'absolute',
                right: 4,
                bottom: 4,
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#fbf8f5',
                color: '#2a211c',
                boxShadow: '0 4px 12px rgba(0,0,0,.25)',
              }}
            >
              <Icon name="pencil" size={13} sw={2.2} />
            </span>
          </label>
          <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="kh-in"
                style={{ fontWeight: 600 }}
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
                aria-label={t('reg_name')}
              />
              <button
                type="button"
                className="kh-btn-solid"
                onClick={saveName}
                disabled={!nameOk && (!name.trim() || name.trim() === savedName)}
                style={nameOk ? { background: 'oklch(0.8 0.12 155)', color: '#1e2a22' } : undefined}
              >
                {nameOk ? `✓ ${t('acc_saved')}` : t('acc_save')}
              </button>
            </div>
            <span style={{ fontSize: 13.5, color: 'rgba(255,248,240,.8)', paddingLeft: 2 }}>
              {me.user.email}
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,248,240,.65)' }}>
                {t('acc_since')} {fmtDate(me.user.createdAt)}
              </span>
              {me.assets.avatar && (
                <button
                  type="button"
                  onClick={removePhoto}
                  style={{
                    height: 26,
                    padding: '0 10px',
                    borderRadius: 999,
                    border: 0,
                    background: 'transparent',
                    color: 'rgba(255,248,240,.75)',
                    font: 'inherit',
                    fontSize: 12,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {t('acc_removePhoto')}
                </button>
              )}
              {photoMsg && <span style={{ fontSize: 12, color: '#ffc9b8' }}>{photoMsg}</span>}
            </div>
          </div>
        </div>

        {/* License */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            padding: 18,
            borderRadius: 22,
            background: 'linear-gradient(135deg,oklch(0.78 0.14 300 / .16),oklch(0.76 0.14 245 / .12))',
            border: '1px solid rgba(255,255,255,.18)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                height: 30,
                padding: '0 12px',
                borderRadius: 9,
                display: 'flex',
                alignItems: 'center',
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: '.12em',
                color: '#1a1530',
                background: tierGradient(tier),
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.45),0 6px 18px rgba(0,0,0,.18)',
              }}
            >
              {tier}
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>
                {t('lic_title').replace('{tier}', tier.charAt(0) + tier.slice(1).toLowerCase())}
              </span>
              {licValid && <span style={{ fontSize: 12.5, color: 'rgba(255,248,240,.7)' }}>{licValid}</span>}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8 }}>
            {LIC_FAMILIES.map(([fam, probe]) => {
              const ok = me.modules.includes(probe);
              return (
                <div
                  key={fam}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 14,
                    background: 'rgba(18,12,9,.16)',
                    border: '1px solid rgba(255,255,255,.08)',
                    opacity: ok ? 1 : 0.5,
                  }}
                >
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      flex: 'none',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 1,
                      background: ok ? 'oklch(0.8 0.14 150)' : 'rgba(255,255,255,.12)',
                      color: ok ? '#0f2418' : 'rgba(255,248,240,.6)',
                    }}
                  >
                    <Icon name={ok ? 'check' : 'dash'} size={11} sw={3} />
                  </span>
                  <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em' }}>{fam}</span>
                    <span style={{ fontSize: 12, lineHeight: 1.4, color: 'rgba(255,248,240,.7)' }}>
                      {t(`lic_${fam}`)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px 12px 16px',
            borderRadius: 18,
            background: 'rgba(255,255,255,.06)',
            border: '1px solid rgba(255,255,255,.14)',
          }}
        >
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>
              {t('acc_plan')} · {me.tenant.planCode ?? tier}
            </span>
            <span style={{ fontSize: 12.5, color: 'rgba(255,248,240,.7)' }}>{t('acc_planSub')}</span>
          </span>
          <Link
            scroll={false}
            href="/app/pricing"
            onClick={onClose}
            className="kh-acc__wide"
            style={{ flex: 'none', padding: '0 18px', height: 40 }}
          >
            {t('acc_planBtn')}
          </Link>
        </div>

        {me.admin && (
          <Link
            href="/admin"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 16px',
              borderRadius: 18,
              textDecoration: 'none',
              color: 'var(--text)',
              background: 'linear-gradient(135deg,rgba(120,170,255,.22),rgba(255,255,255,.06))',
              border: '1px solid rgba(255,255,255,.2)',
            }}
          >
            <span
              style={{
                width: 38,
                height: 38,
                flex: 'none',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,.14)',
              }}
            >
              <Icon name="shield" size={18} sw={1.9} />
            </span>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>{t('shell_adminLbl')}</span>
              <span style={{ fontSize: 12.5, color: 'rgba(255,248,240,.78)' }}>{t('shell_adminSub')}</span>
            </span>
            <span style={{ fontSize: 18 }}>→</span>
          </Link>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
          <a href={`${BASE}/api/v1/me/export`} download className="kh-acc__wide">
            <Icon name="download" size={15} sw={2} />
            {t('acc_export')}
          </a>
          <button type="button" className="kh-acc__wide kh-acc__wide--danger" onClick={logout}>
            <Icon name="logout" size={15} sw={2} />
            {t('acc_logout')}
          </button>
        </div>
        <button
          type="button"
          className="kh-acc__del"
          onClick={async () => {
            const ok = await confirm({
              title: t('acc_deleteT'),
              body: t('acc_deleteB'),
              confirmLabel: t('acc_delete'),
              cancelLabel: t('tr_cancel'),
              danger: true,
            });
            if (!ok) return;
            try {
              const r = await withReauth(() => api('/me', {}, 'DELETE'));
              if (r !== undefined) window.location.assign(`${BASE}/login`);
            } catch (e) {
              setDelErr(
                isApiFailure(e) && e.code === 'manager_account'
                  ? t('acc_deleteManager')
                  : t('acc_deleteFail'),
              );
            }
          }}
        >
          {t('acc_delete')}
        </button>
        {delErr && (
          <span role="alert" style={{ fontSize: 12.5, color: 'oklch(0.8 0.14 25)', textAlign: 'center' }}>
            {delErr}
          </span>
        )}

        {/* Password */}
        <div className="kh-acc-card">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="kh-acc-card__title">{t('acc_pwTitle')}</span>
            <span className="kh-acc-card__sub">{t('acc_pwSub')}</span>
          </div>
          <input
            className="kh-in"
            type="password"
            value={cur}
            onChange={(e) => {
              setCur(e.target.value);
              setPwMsg(null);
            }}
            placeholder={t('acc_cur')}
            aria-label={t('acc_cur')}
            autoComplete="current-password"
          />
          <input
            className="kh-in"
            type="password"
            value={next}
            onChange={(e) => {
              setNext(e.target.value);
              setPwMsg(null);
            }}
            placeholder={t('acc_new')}
            aria-label={t('acc_new')}
            autoComplete="new-password"
          />
          {next && (
            <div style={{ marginTop: 8 }}>
              <StrengthMeter password={next} />
            </div>
          )}
          <input
            className="kh-in"
            type="password"
            value={conf}
            onChange={(e) => {
              setConf(e.target.value);
              setPwMsg(null);
            }}
            placeholder={t('acc_conf')}
            aria-label={t('acc_conf')}
            autoComplete="new-password"
            aria-invalid={mismatch || undefined}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="kh-btn-solid"
              style={{
                height: 40,
                ...(pwReady
                  ? null
                  : {
                      background: 'rgba(255,255,255,.14)',
                      color: 'rgba(255,248,240,.6)',
                      cursor: 'default',
                    }),
              }}
              onClick={changePw}
              aria-disabled={!pwReady || pwBusy}
            >
              {t('acc_changePw')}
            </button>
            {(pwMsg || mismatch) && (
              <span
                role="status"
                style={{ fontSize: 12.5, color: pwMsg?.ok ? 'oklch(0.88 0.1 155)' : '#ffc9b8' }}
              >
                {pwMsg?.text ?? t('acc_pwMismatch')}
              </span>
            )}
          </div>
        </div>

        {/* 2FA */}
        <div className="kh-acc-card">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="kh-acc-card__title">{t('acc_2faTitle')}</span>
              <span className="kh-acc-card__sub">{t('acc_2faSub')}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={totpOn || Boolean(setup)}
              aria-label={t('acc_2faTitle')}
              title={t('acc_2faTitle')}
              className="kh-switch"
              onClick={toggle2fa}
            />
          </div>
          {setup && !totpOn && (
            <div
              style={{
                display: 'flex',
                gap: 14,
                flexWrap: 'wrap',
                alignItems: 'flex-start',
                padding: 14,
                borderRadius: 16,
                background: 'rgba(18,12,9,.22)',
                border: '1px solid rgba(255,255,255,.12)',
              }}
            >
              <div
                aria-label={t('acc_qr')}
                role="img"
                style={{
                  width: 112,
                  height: 112,
                  flex: 'none',
                  borderRadius: 14,
                  overflow: 'hidden',
                  background: '#fff',
                  padding: 4,
                  boxSizing: 'border-box',
                }}
                // Generated by our own server from the otpauth URI.
                dangerouslySetInnerHTML={{ __html: setup.qrSvg }}
              />
              <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 12.5, lineHeight: 1.45, color: 'rgba(255,248,240,.85)' }}>
                  {t('acc_2faHelp')}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    fontWeight: 600,
                    letterSpacing: '.08em',
                    padding: '8px 10px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,.1)',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {setup.secret.replace(/(.{4})/g, '$1 ').trim()}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="kh-in"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                      setCodeErr(false);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && verify2fa()}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    aria-label={t('acc_2faOffCode')}
                    style={{
                      width: 140,
                      flex: 'none',
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '.3em',
                      fontSize: 16,
                    }}
                  />
                  <button
                    type="button"
                    className="kh-btn-solid"
                    onClick={verify2fa}
                    disabled={code.length !== 6}
                  >
                    {t('acc_verify')}
                  </button>
                </div>
                {codeErr && <span style={{ fontSize: 12.5, color: '#ffc9b8' }}>{t('acc_2faBad')}</span>}
              </div>
            </div>
          )}
          {totpOn && (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: 'oklch(0.88 0.1 155)',
              }}
            >
              <Icon name="check" size={14} sw={2.4} />
              {t('acc_2faOnMsg')}
            </span>
          )}
          {recovery && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 12.5, lineHeight: 1.45, color: 'rgba(255,248,240,.85)' }}>
                {t('acc_2faCodes')}
              </span>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
                  gap: 6,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {recovery.map((c) => (
                  <span
                    key={c}
                    style={{ padding: '6px 10px', borderRadius: 10, background: 'rgba(255,255,255,.1)' }}
                  >
                    {c}
                  </span>
                ))}
              </div>
              <button
                type="button"
                className="kh-chip-sm"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => navigator.clipboard?.writeText(recovery.join('\n'))}
              >
                {t('copy')}
              </button>
            </div>
          )}
        </div>

        {/* Sessions */}
        <div className="kh-acc-card">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="kh-acc-card__title">{t('acc_sessTitle')}</span>
              <span className="kh-acc-card__sub">{t('acc_sessSub')}</span>
            </div>
            {sessions?.some((s) => !s.current) && (
              <button type="button" className="kh-chip-sm" onClick={endOthers}>
                {t('acc_endOthers')}
              </button>
            )}
          </div>
          {sessions?.map((s) => {
            const dev = deviceLabel(s.userAgent);
            const label = dev?.label ?? t('acc_unknownDevice');
            return (
              <div key={s.id} className="kh-sess" data-current={s.current}>
                <span className="kh-sess__icon">
                  <Icon name={dev?.phone ? 'phone' : 'laptop'} size={18} />
                </span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {label}
                    </span>
                    {s.current && (
                      <span
                        style={{
                          flex: 'none',
                          height: 20,
                          padding: '0 8px',
                          borderRadius: 6,
                          display: 'flex',
                          alignItems: 'center',
                          fontSize: 10.5,
                          fontWeight: 700,
                          background: 'oklch(0.8 0.12 155 / .25)',
                          color: 'oklch(0.92 0.08 155)',
                        }}
                      >
                        {t('acc_thisSess')}
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: 'rgba(255,248,240,.68)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {[s.ip, since(s.lastSeenAt, lang, t('acc_now'))].filter(Boolean).join(' · ')}
                  </span>
                </div>
                {!s.current && (
                  <button
                    type="button"
                    className="kh-sess__end"
                    title={t('acc_endSess')}
                    aria-label={t('acc_endSess')}
                    onClick={() => endOne(s, label)}
                  >
                    <Icon name="logout" size={15} sw={2} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Modal
        open={offOpen}
        onClose={() => setOffOpen(false)}
        size="sm"
        layer="confirm"
        title={t('acc_2faOffT')}
        subtitle={t('acc_2faOffB')}
        closeLabel={t('tr_cancel')}
      >
        <form onSubmit={disable2fa} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            className="kh-in"
            type="password"
            value={offPass}
            onChange={(e) => setOffPass(e.target.value)}
            placeholder={t('acc_cur')}
            aria-label={t('acc_cur')}
            autoComplete="current-password"
            data-autofocus=""
          />
          <input
            className="kh-in"
            value={offCode}
            onChange={(e) => setOffCode(e.target.value.replace(/\s/g, '').slice(0, 8))}
            placeholder={t('acc_2faOffCode')}
            aria-label={t('acc_2faOffCode')}
            inputMode="numeric"
            style={{ fontFamily: 'var(--font-mono)', letterSpacing: '.2em' }}
          />
          {offErr && <span style={{ fontSize: 12.5, color: '#ffc9b8' }}>{offErr}</span>}
          <div className="kh-modal__foot">
            <button
              type="button"
              className="kh-chip-sm"
              style={{ height: 42, padding: '0 18px' }}
              onClick={() => setOffOpen(false)}
            >
              {t('tr_cancel')}
            </button>
            <button
              type="submit"
              className="kh-btn-solid"
              style={{ background: 'var(--kh-danger-solid)', color: '#fff', borderRadius: 999 }}
              disabled={!offPass || offCode.length < 6}
            >
              {t('acc_2faOff')}
            </button>
          </div>
        </form>
      </Modal>
      {dialog}
    </Modal>
  );
}
