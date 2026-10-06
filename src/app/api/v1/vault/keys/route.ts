import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { requireContent } from '@/server/content/guard';
import { updateVaultKeys } from '@/server/content/vault';
import { Fingerprint, KdfParams, Salt, Wrapped } from '@/server/content/vaultSchemas';

/**
 * PUT /vault/keys — re-wrapped DEK after "change master password", recovery,
 * or a new recovery key. { reason } is recorded in the audit log.
 */
export const PUT = handler(async (req) => {
  const auth = await requireContent('passwords');
  if (!(await allow(`vault-keys:${auth.user.id}`, 20, 3600))) throw new ApiError(429, 'too_many_requests');
  const { reason, ...input } = await body(
    req,
    z
      .object({
        reason: z.enum(['master', 'recovered', 'new_key']),
        kdfSalt: Salt.optional(),
        kdfParams: KdfParams.optional(),
        dekWrappedMp: Wrapped.optional(),
        dekWrappedRk: Wrapped.optional(),
        rkFingerprint: Fingerprint.optional(),
      })
      .refine((x) => (x.dekWrappedMp ? x.kdfSalt && x.kdfParams : true), { path: ['kdfSalt'] })
      .refine((x) => !!x.dekWrappedRk === !!x.rkFingerprint, { path: ['rkFingerprint'] })
      .refine((x) => x.dekWrappedMp || x.dekWrappedRk, { path: ['dekWrappedMp'] }),
  );
  const action =
    reason === 'master'
      ? 'vault.master_changed'
      : reason === 'recovered'
        ? 'vault.recovered'
        : 'vault.recovery_key_regenerated';
  await updateVaultKeys(auth, input, action);
  return json({ ok: true });
});
