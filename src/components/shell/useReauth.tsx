'use client';

import { useCallback, useRef, useState } from 'react';
import { Button, Modal, PasswordInput } from '@/components/ui';
import { api, isApiFailure } from '@/lib/client/api';
import { useI18n } from '@/i18n/client';

/**
 * Sensitive actions answer 403 reauth_required when the last password check
 * is older than 15 min. `withReauth(fn)` asks for the password, calls
 * /auth/reauth and retries once.
 */
export function useReauth() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const waiter = useRef<((ok: boolean) => void) | null>(null);

  const ask = () =>
    new Promise<boolean>((resolve) => {
      waiter.current = resolve;
      setPass('');
      setErr('');
      setOpen(true);
    });

  const done = (ok: boolean) => {
    setOpen(false);
    waiter.current?.(ok);
    waiter.current = null;
  };

  const withReauth = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn();
    } catch (e) {
      if (!isApiFailure(e) || e.code !== 'reauth_required') throw e;
      if (!(await ask())) return undefined;
      return fn();
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pass || busy) return;
    setBusy(true);
    try {
      await api('/auth/reauth', { password: pass });
      done(true);
    } catch (x) {
      setErr(
        isApiFailure(x) && x.code === 'locked'
          ? t('lock_wait').replace('{s}', String(x.retryAfter ?? 30))
          : t('lock_bad'),
      );
    } finally {
      setBusy(false);
    }
  };

  const dialog = (
    <Modal
      open={open}
      onClose={() => done(false)}
      size="sm"
      layer="confirm"
      title={t('acc_reauthT')}
      subtitle={t('acc_reauthB')}
      closeLabel={t('ui_cancel')}
    >
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PasswordInput
          value={pass}
          onChange={(e) => {
            setPass(e.target.value);
            setErr('');
          }}
          autoComplete="current-password"
          placeholder={t('login_password')}
          aria-label={t('login_password')}
          data-autofocus=""
          invalid={Boolean(err)}
          toggleLabel={t('login_eye')}
        />
        {err && <span style={{ fontSize: 12.5, color: 'var(--kh-error-text)' }}>{err}</span>}
        <div className="kh-modal__foot">
          <Button type="button" variant="glass" onClick={() => done(false)}>
            {t('ui_cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {t('ui_confirm')}
          </Button>
        </div>
      </form>
    </Modal>
  );

  return { withReauth, dialog };
}
