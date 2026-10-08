export type ShellMe = {
  user: { id: string; name: string; email: string; totpEnabled: boolean; createdAt: string };
  tenant: {
    name: string;
    planCode: string | null;
    renewAt: string | null;
    trialEndsAt: string | null;
    status: 'trial' | 'active' | 'past_due' | 'suspended' | 'canceled';
  };
  modules: string[];
  admin: { role: string } | null;
  /** Uploaded images → version (ms) for cache-busting URLs. */
  assets: Partial<Record<'avatar' | 'background' | 'logo', number>>;
};
