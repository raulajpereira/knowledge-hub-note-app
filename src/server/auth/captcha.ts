import { env } from '@/lib/env';
import { redis } from '@/lib/redis';

// Cloudflare Turnstile after repeated failed sign-ins (SECURITY.md §2). Only
// when both keys are set; otherwise the progressive lockout is the defence.

const IP_WINDOW_S = 3600;
const EMAIL_FAILS = 3;
const IP_FAILS = 10;

export const captchaSiteKey = () => {
  const e = env();
  return e.TURNSTILE_SITE_KEY && e.TURNSTILE_SECRET_KEY ? e.TURNSTILE_SITE_KEY : null;
};

const ipKey = (ip: string) => `kh:rl:loginfail-ip:${ip}`;

/** Counts a failed sign-in from this IP (any email). */
export async function noteLoginFailure(ip: string | null) {
  if (!ip) return;
  const n = await redis().incr(ipKey(ip));
  if (n === 1) await redis().expire(ipKey(ip), IP_WINDOW_S);
}

/** After 3 failures for the email from this IP (or a lockout today), or 10 from the IP. */
export async function captchaNeeded(emailFails: number, lockouts: number, ip: string | null) {
  if (!captchaSiteKey()) return false;
  if (emailFails >= EMAIL_FAILS || lockouts > 0) return true;
  return ip ? Number(await redis().get(ipKey(ip))) >= IP_FAILS : false;
}

export async function verifyCaptcha(token: string | undefined, ip: string | null): Promise<boolean> {
  const secret = env().TURNSTILE_SECRET_KEY;
  if (!token || !secret) return false;
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(5000),
    });
    return ((await r.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}
