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

// Failures for one account from every address together (a guess spread over
// many IPs): past ACCT_FAILS in ACCT_WINDOW_S the account asks for the captcha,
// or — without Turnstile — waits until the window ends.
const ACCT_WINDOW_S = 900;
export const ACCT_FAILS = 20;
const acctKey = (email: string) => `kh:rl:loginfail-acct:${email}`;

export async function noteAccountFailure(email: string) {
  const n = await redis().incr(acctKey(email));
  if (n === 1) await redis().expire(acctKey(email), ACCT_WINDOW_S);
  return n;
}

/** Failures for the account in the current window and the seconds left in it. */
export async function accountFailures(email: string) {
  const [n, ttl] = await Promise.all([redis().get(acctKey(email)), redis().ttl(acctKey(email))]);
  return { fails: Number(n ?? 0), retryAfter: Math.max(1, ttl) };
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
