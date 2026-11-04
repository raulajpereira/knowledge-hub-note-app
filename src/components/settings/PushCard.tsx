'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import {
  currentSubscription,
  disablePush,
  enablePush,
  needsHomeScreen,
  pushSupported,
} from '@/lib/client/push';
import { useToast } from '@/components/ui';
import { Row, Toggle } from './NotifyTab';

// Definições › Notificações › "Notificações push": the bell's notifications on
// this phone / computer (Web Push), the other devices where they are on, and a
// test. Hidden when the server has no VAPID keys (docs/DEPLOY.md §5e).

type Device = { id: string; device: string; createdAt: string; lastOkAt: string | null };

export function PushCard() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [devices, setDevices] = useState<Device[]>([]);
  const [here, setHere] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ key: string | null; devices: Device[] }>('/notifications/push').catch(() => null);
    setKey(r?.key ?? null);
    setDevices(r?.devices ?? []);
    setHere((await currentSubscription().catch(() => null))?.endpoint ?? null);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!key) return null;
  const supported = pushSupported();
  const homeScreen = needsHomeScreen();
  const denied = supported && Notification.permission === 'denied';
  const on = !!here;

  const toggle = async (v: boolean) => {
    setBusy(true);
    try {
      if (v) {
        const r = await enablePush(key);
        if (!r.ok)
          toast({
            message: t(
              r.reason === 'denied' ? 'pu_denied' : r.reason === 'unsupported' ? 'pu_unsupported' : 'pu_fail',
            ),
            tone: 'error',
          });
      } else await disablePush();
      await load();
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    try {
      const r = await api<{ sent: number; failed: number }>('/notifications/push?test=1', {});
      toast({
        message: r.sent ? t('pu_testSent').replace('{n}', String(r.sent)) : t('pu_testNone'),
        tone: r.sent ? 'success' : 'warning',
      });
      void load();
    } catch {
      toast({ message: t('pu_fail'), tone: 'error' });
    }
  };
  const remove = async (id: string) => {
    await api('/notifications/push', { id }, 'DELETE').catch(() => undefined);
    void load();
  };
  const when = (iso: string) =>
    new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'pt-PT', { dateStyle: 'medium' }).format(new Date(iso));

  return (
    <div className="kh-set__card" data-testid="push-card">
      <div className="kh-set__head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="kh-set__title">{t('pu_title')}</div>
          <div className="kh-set__desc">{t('pu_desc')}</div>
        </div>
      </div>
      <div className="kh-set__rows">
        <Row
          title={t('pu_here')}
          desc={
            !supported
              ? t(homeScreen ? 'pu_ios' : 'pu_unsupported')
              : denied
                ? t('pu_denied')
                : on
                  ? t('pu_hereOn')
                  : t('pu_hereOff')
          }
        >
          {on && (
            <button type="button" className="kh-set__ghost" onClick={() => void test()}>
              {t('pu_test')}
            </button>
          )}
          <Toggle
            on={on}
            label={t('pu_here')}
            onChange={(v) => {
              if (!busy && supported && !denied) void toggle(v);
            }}
          />
        </Row>
      </div>
      {devices.length > 0 && (
        <div className="kh-set__rows">
          {devices.map((d) => (
            <Row
              key={d.id}
              title={d.device || t('pu_device')}
              desc={`${t('pu_since').replace('{d}', when(d.createdAt))}${d.lastOkAt ? ` · ${t('pu_last').replace('{d}', when(d.lastOkAt))}` : ''}`}
            >
              <button type="button" className="kh-set__ghost" onClick={() => void remove(d.id)}>
                {t('pu_remove')}
              </button>
            </Row>
          ))}
        </div>
      )}
    </div>
  );
}
