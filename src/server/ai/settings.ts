import 'server-only';
import { eq } from 'drizzle-orm';
import { aiSettings } from '@/db/schema';
import { aiProvider, type AiProviderId, type AiStatus } from '@/lib/ai';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { asUser } from '@/server/content/tenant';
import { listModels, type AiCfg } from './provider';

// Each person's own provider and key (Definições › Assistente IA). The key is
// stored encrypted and only ever decrypted on the server for a call.

const none: AiStatus = {
  configured: false,
  enabled: false,
  provider: null,
  model: '',
  keyHint: '',
  audio: false,
};

async function row(auth: AuthContext) {
  const [r] = await asUser(auth, (tx) =>
    tx.select().from(aiSettings).where(eq(aiSettings.ownerId, auth.user.id)),
  );
  return r ?? null;
}

export async function aiStatus(auth: AuthContext): Promise<AiStatus> {
  const r = await row(auth);
  if (!r) return none;
  const p = aiProvider(r.provider);
  return {
    configured: !!p && !!r.model,
    enabled: r.enabled,
    provider: (p?.id ?? null) as AiProviderId | null,
    model: r.model,
    keyHint: r.keyHint,
    audio: !!p?.audio,
  };
}

/** The decrypted set-up for a call, or a clear error when it isn't usable. */
export async function aiConfig(auth: AuthContext): Promise<AiCfg> {
  const r = await row(auth);
  if (!r || !r.model || !aiProvider(r.provider)) throw new ApiError(400, 'ai_not_configured');
  if (!r.enabled) throw new ApiError(400, 'ai_disabled');
  return { provider: r.provider as AiProviderId, apiKey: decryptSecret(r.keyCt), model: r.model };
}

/** Models for a provider: with a new key, or with the stored one for the same provider. */
export async function aiModels(auth: AuthContext, provider: AiProviderId, apiKey?: string) {
  let key = apiKey?.trim();
  if (!key) {
    const r = await row(auth);
    if (!r || r.provider !== provider) throw new ApiError(400, 'ai_key_required');
    key = decryptSecret(r.keyCt);
  }
  return listModels(provider, key);
}

export async function saveAiSettings(
  auth: AuthContext,
  input: { provider: AiProviderId; apiKey?: string; model: string; enabled: boolean },
): Promise<AiStatus> {
  const cur = await row(auth);
  const key = input.apiKey?.trim();
  if (!key && (!cur || cur.provider !== input.provider)) throw new ApiError(400, 'ai_key_required');
  // a new key is checked against the provider before it is kept
  const models = key ? await listModels(input.provider, key) : null;
  if (models && input.model && models.length && !models.includes(input.model))
    throw new ApiError(400, 'ai_model_invalid');
  const values = {
    provider: input.provider,
    model: input.model,
    enabled: input.enabled,
    updatedAt: new Date(),
    ...(key ? { keyCt: encryptSecret(key), keyHint: key.slice(-4) } : {}),
  };
  await asUser(auth, (tx) =>
    tx
      .insert(aiSettings)
      .values({
        ownerId: auth.user.id,
        tenantId: auth.tenant.id,
        keyCt: '',
        ...values,
      })
      .onConflictDoUpdate({ target: aiSettings.ownerId, set: values }),
  );
  return aiStatus(auth);
}

export async function deleteAiSettings(auth: AuthContext) {
  await asUser(auth, (tx) => tx.delete(aiSettings).where(eq(aiSettings.ownerId, auth.user.id)));
}
