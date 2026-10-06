import 'server-only';
import { and, asc, eq, sql } from 'drizzle-orm';
import { vaultItems, vaultKeys } from '@/db/schema';
import { ApiError } from '@/server/errors';
import { audit } from '@/server/audit';
import type { AuthContext } from '@/server/auth/session';
import { asUser } from './tenant';

// Password vault (SECURITY.md §4, D9). Zero-knowledge: every value handled
// here was encrypted in the browser; the server only stores and returns it,
// scoped by RLS to its owner. Nothing here can decrypt anything.

export type VaultKeys = {
  kdfSalt: string;
  kdfParams: { alg: 'argon2id'; m: number; t: number; p: number };
  dekWrappedMp: string;
  dekWrappedRk: string | null;
  rkFingerprint: string | null;
  rkCreatedAt: string | null;
  metaCt: string | null;
};
export type VaultItem = { id: string; ciphertext: string; version: number; updatedAt: string };

const keyCols = {
  kdfSalt: vaultKeys.kdfSalt,
  kdfParams: vaultKeys.kdfParams,
  dekWrappedMp: vaultKeys.dekWrappedMp,
  dekWrappedRk: vaultKeys.dekWrappedRk,
  rkFingerprint: vaultKeys.rkFingerprint,
  rkCreatedAt: vaultKeys.rkCreatedAt,
  metaCt: vaultKeys.metaCt,
};
const itemCols = {
  id: vaultItems.id,
  ciphertext: vaultItems.ciphertext,
  version: vaultItems.version,
  updatedAt: vaultItems.updatedAt,
};
const toKeys = (r: Omit<VaultKeys, 'rkCreatedAt'> & { rkCreatedAt: Date | null }): VaultKeys => ({
  ...r,
  rkCreatedAt: r.rkCreatedAt?.toISOString() ?? null,
});
const toItem = (r: { id: string; ciphertext: string; version: number; updatedAt: Date }): VaultItem => ({
  ...r,
  updatedAt: r.updatedAt.toISOString(),
});

/** Keys (null before setup) + every encrypted item. */
export async function getVault(auth: AuthContext): Promise<{ keys: VaultKeys | null; items: VaultItem[] }> {
  return asUser(auth, async (tx) => {
    const [k] = await tx.select(keyCols).from(vaultKeys);
    if (!k) return { keys: null, items: [] };
    const items = await tx.select(itemCols).from(vaultItems).orderBy(asc(vaultItems.createdAt));
    return { keys: toKeys(k), items: items.map(toItem) };
  });
}

export async function setupVault(
  auth: AuthContext,
  input: Pick<VaultKeys, 'kdfSalt' | 'kdfParams' | 'dekWrappedMp'> & {
    dekWrappedRk: string;
    rkFingerprint: string;
  },
) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .insert(vaultKeys)
      .values({
        ownerId: auth.user.id,
        tenantId: auth.tenant.id,
        ...input,
        rkCreatedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: vaultKeys.ownerId });
    if (!r.length) throw new ApiError(409, 'vault_exists');
  });
  await audit({ action: 'vault.setup', actorUserId: auth.user.id, tenantId: auth.tenant.id });
}

/**
 * Re-wraps the DEK: new master password (change / recovery) and/or a new
 * recovery key. Items are never re-encrypted — the DEK stays the same.
 */
export async function updateVaultKeys(
  auth: AuthContext,
  input: Partial<Pick<VaultKeys, 'kdfSalt' | 'kdfParams' | 'dekWrappedMp'>> & {
    dekWrappedRk?: string;
    rkFingerprint?: string;
  },
  action: 'vault.master_changed' | 'vault.recovered' | 'vault.recovery_key_regenerated',
) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(vaultKeys)
      .set({
        ...input,
        ...(input.dekWrappedRk ? { rkCreatedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .returning({ id: vaultKeys.ownerId });
    if (!r.length) throw new ApiError(404, 'vault_missing');
  });
  await audit({ action, actorUserId: auth.user.id, tenantId: auth.tenant.id });
}

export async function saveVaultMeta(auth: AuthContext, metaCt: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(vaultKeys)
      .set({ metaCt, updatedAt: new Date() })
      .returning({ id: vaultKeys.ownerId });
    if (!r.length) throw new ApiError(404, 'vault_missing');
  });
}

async function hasVault(tx: Parameters<Parameters<typeof asUser>[1]>[0]) {
  const [k] = await tx.select({ id: vaultKeys.ownerId }).from(vaultKeys);
  if (!k) throw new ApiError(404, 'vault_missing');
}

export async function createVaultItem(auth: AuthContext, ciphertext: string): Promise<VaultItem> {
  return asUser(auth, async (tx) => {
    await hasVault(tx);
    const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(vaultItems)) as [{ n: number }];
    if (n >= 5000) throw new ApiError(400, 'too_many_items');
    const [r] = await tx
      .insert(vaultItems)
      .values({ tenantId: auth.tenant.id, ownerId: auth.user.id, ciphertext })
      .returning(itemCols);
    return toItem(r!);
  });
}

/** Optimistic concurrency: the browser sends the version it edited (two tabs, two devices). */
export async function updateVaultItem(auth: AuthContext, id: string, ciphertext: string, version: number) {
  return asUser(auth, async (tx) => {
    const [r] = await tx
      .update(vaultItems)
      .set({ ciphertext, version: sql`${vaultItems.version} + 1`, updatedAt: new Date() })
      .where(and(eq(vaultItems.id, id), eq(vaultItems.version, version)))
      .returning(itemCols);
    if (r) return toItem(r);
    const [cur] = await tx.select(itemCols).from(vaultItems).where(eq(vaultItems.id, id));
    if (!cur) throw new ApiError(404, 'not_found');
    throw new ApiError(409, 'version_conflict', undefined, { current: toItem(cur) });
  });
}

/** Vault items are deleted for good: their names are encrypted, so the Trash couldn't list them. */
export async function deleteVaultItem(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx.delete(vaultItems).where(eq(vaultItems.id, id)).returning({ id: vaultItems.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

/** "Repor e Apagar": without master password and recovery key the data is unreadable anyway. */
export async function wipeVault(auth: AuthContext) {
  await asUser(auth, async (tx) => {
    await tx.delete(vaultItems);
    await tx.delete(vaultKeys);
  });
  await audit({ action: 'vault.wiped', actorUserId: auth.user.id, tenantId: auth.tenant.id });
}
