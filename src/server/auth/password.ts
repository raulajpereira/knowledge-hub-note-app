import { hash, verify } from '@node-rs/argon2';
import { createHash } from 'node:crypto';
import { MAX_PASSWORD, MIN_PASSWORD } from '@/lib/passwordStrength';
import { env } from '@/lib/env';

// SECURITY.md §2: Argon2id, m = 64 MiB, t = 3, p = 1.
const ARGON = { memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON);
}

export async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  if (!stored) return false;
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

// A valid hash to verify against when the email is unknown, so response
// time doesn't reveal whether an account exists.
let dummy: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hashPassword('kh-timing-equaliser');
  await verifyPassword(await dummy, password);
}

export type PasswordProblem = 'too_short' | 'too_long' | 'pwned';

/**
 * Length policy + Have I Been Pwned k-anonymity check (only the first 5 hex
 * chars of the SHA-1 leave the server). Fails open if the API is
 * unreachable: availability of sign-up beats this extra check.
 */
export async function checkPasswordPolicy(
  password: string,
  fetchImpl: typeof fetch = fetch,
  hibp: boolean = env().HIBP_CHECK,
): Promise<PasswordProblem | null> {
  if (password.length < MIN_PASSWORD) return 'too_short';
  if (password.length > MAX_PASSWORD) return 'too_long';
  if (!hibp) return null;
  const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'KnowledgeHub' },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const body = await res.text();
    for (const line of body.split('\n')) {
      const [s, count] = line.trim().split(':');
      if (s === suffix && Number(count) > 0) return 'pwned';
    }
  } catch {
    // network error / timeout → fail open
  }
  return null;
}
