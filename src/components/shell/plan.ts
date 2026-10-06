// License tier look (prototype `lic`): badge gradient per plan and the four
// module families shown in "Conta e Dados".

const GRAD: Record<string, string> = {
  PRO: 'linear-gradient(90deg,#fbf8f5,#e8dccf)',
  DEVELOPER: 'linear-gradient(90deg,oklch(0.84 0.13 150),oklch(0.8 0.12 180))',
  SAP: 'linear-gradient(90deg,oklch(0.8 0.14 245),oklch(0.76 0.14 225))',
  MANAGEMENT: 'linear-gradient(90deg,oklch(0.86 0.13 85),oklch(0.8 0.14 60))',
  ULTRA: 'linear-gradient(90deg,oklch(0.82 0.14 320),oklch(0.78 0.15 270),oklch(0.8 0.14 230))',
  // Not in the prototype's map (it fell back to ULTRA): a neutral badge for FREE.
  FREE: 'linear-gradient(90deg,rgba(255,255,255,.85),rgba(255,255,255,.62))',
};

export function tierOf(planCode: string | null): string {
  return planCode ?? 'FREE';
}

export function tierGradient(tier: string): string {
  return GRAD[tier] ?? GRAD.ULTRA!;
}

/** The four families and the module that proves each is included. */
export const LIC_FAMILIES: Array<[family: string, probe: string]> = [
  ['PRO', 'calendar'],
  ['DEVELOPER', 'devlib'],
  ['SAP', 'systems'],
  ['MANAGEMENT', 'mg_overview'],
];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}
