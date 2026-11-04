'use client';

import { api } from './api';

// Web Push in this browser: the service worker (public/kh-sw.js) and the
// subscription the server sends to (src/server/notify/push.ts).

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const pushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/** iPhone / iPad: Web Push only for the app added to the home screen. */
export const needsHomeScreen = () =>
  typeof window !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !(
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone
  );

async function registration() {
  return navigator.serviceWorker.register(`${BASE}/kh-sw.js`, { scope: `${BASE}/` });
}

/** This browser's subscription (null when off). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration(`${BASE}/`);
  return (await reg?.pushManager.getSubscription()) ?? null;
}

function keyBytes(b64: string) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

/** "Chrome · Windows" */
export function deviceName(): string {
  const ua = navigator.userAgent;
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
            : 'Browser';
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iOS'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return [browser, os].filter(Boolean).join(' · ');
}

export type PushOn = { ok: true } | { ok: false; reason: 'denied' | 'unsupported' | 'failed' };

/** Asks for permission (if needed), subscribes and tells the server. */
export async function enablePush(publicKey: string): Promise<PushOn> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: 'denied' };
  try {
    const reg = await registration();
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    // keys changed on the server: start again
    const want = keyBytes(publicKey);
    const have = sub?.options.applicationServerKey;
    if (sub && have && new Uint8Array(have).join() !== want.join()) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want });
    const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    await api('/notifications/push', { endpoint: j.endpoint, keys: j.keys, device: deviceName() });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await api('/notifications/push', { endpoint: sub.endpoint }, 'DELETE').catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}
