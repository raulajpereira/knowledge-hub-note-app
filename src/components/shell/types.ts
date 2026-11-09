import type { Workspace } from '@/lib/workspaces';

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
  /** Ambientes: the person's workspaces and the one active on this device */
  workspaces: {
    list: Workspace[];
    active: string;
    /** the modules of the plan (each workspace shows some of them) */
    planModules: string[];
    /** this device's workspace cookie as the page was rendered with it (null: none) */
    device: string | null;
    /** the combined view ("Todos os ambientes"): read-only */
    combined: boolean;
  };
};
