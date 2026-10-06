export type ShellMe = {
  user: { id: string; name: string; email: string; totpEnabled: boolean; createdAt: string };
  tenant: { name: string; planCode: string | null; renewAt: string | null; trialEndsAt: string | null };
  modules: string[];
  admin: { role: string } | null;
};
