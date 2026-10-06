import { z } from 'zod';

// Shapes of what the browser sends to the vault API. Only sizes and formats
// can be checked: the contents are ciphertext by design.
const b64 = (max: number) =>
  z
    .string()
    .max(max)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/);

export const KdfParams = z.object({
  alg: z.literal('argon2id'),
  m: z.number().int().min(19_456).max(262_144), // KiB (OWASP minimum 19 MiB)
  t: z.number().int().min(2).max(10),
  p: z.number().int().min(1).max(4),
});
export const Salt = b64(64);
export const Wrapped = b64(512);
export const Fingerprint = z.string().regex(/^[0-9A-F]{4}( [0-9A-F]{4}){3}$/);
export const Ciphertext = b64(90_000);
