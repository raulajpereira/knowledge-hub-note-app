import { PREF_SCHEMAS, type Prefs } from './prefs';

// Text and interface size are per device (a phone and a desktop want different
// sizes): kept in a cookie instead of user_prefs, so the server renders the
// right size on the first paint. A device without the cookie still uses the
// value saved on the account before sizes were per device.

export const SIZE_COOKIE = 'kh_size';
export const DEVICE_KEYS = ['fontScale', 'uiScale'] as const;
type DeviceKey = (typeof DEVICE_KEYS)[number];

export const isDeviceKey = (k: string): k is DeviceKey => (DEVICE_KEYS as readonly string[]).includes(k);

/** Cookie value "fontScale:1.1,uiScale:0.95" → the valid entries only. */
export function parseSizeCookie(raw: string | undefined): Partial<Pick<Prefs, DeviceKey>> {
  const out: Record<string, number> = {};
  for (const part of (raw ?? '').split(',')) {
    const [k, v] = part.split(':');
    if (!k || !isDeviceKey(k)) continue;
    const r = PREF_SCHEMAS[k].safeParse(Number(v));
    if (r.success) out[k] = r.data;
  }
  return out;
}

export const withDeviceSize = (prefs: Prefs, raw: string | undefined): Prefs => ({
  ...prefs,
  ...parseSizeCookie(raw),
});

export function writeSizeCookie(values: Partial<Record<DeviceKey, number>>) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const value = DEVICE_KEYS.filter((k) => values[k] !== undefined)
    .map((k) => `${k}:${values[k]}`)
    .join(',');
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${SIZE_COOKIE}=${value}; Path=${base || '/'}; Max-Age=63072000; SameSite=Lax${secure}`;
}
