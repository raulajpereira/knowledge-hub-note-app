// SAP landscape helpers shared by the client and the server (ZNotes.dc.html
// isSystems / isTcodes): environment colours, transaction modules and types,
// the prototype's transaction catalogue and the SAP GUI shortcut file.

export const SAP_ENVS = ['DEV', 'QAS', 'PRD'] as const;
export type SapEnv = (typeof SAP_ENVS)[number];
export const ENV_C: Record<SapEnv, string> = {
  DEV: 'oklch(0.82 0.11 210)',
  QAS: 'oklch(0.85 0.12 75)',
  PRD: 'oklch(0.72 0.17 25)',
};
export const envColor = (e: string) => ENV_C[e as SapEnv] ?? 'oklch(0.8 0 0)';

export const TX_MODS: Record<string, string> = {
  BC: 'oklch(0.8 0.08 250)',
  ABAP: 'oklch(0.83 0.11 205)',
  FI: 'oklch(0.82 0.12 150)',
  CO: 'oklch(0.82 0.1 180)',
  SD: 'oklch(0.82 0.12 60)',
  MM: 'oklch(0.8 0.12 30)',
  HCM: 'oklch(0.78 0.12 320)',
  PP: 'oklch(0.82 0.11 100)',
  WM: 'oklch(0.8 0.1 210)',
  PM: 'oklch(0.78 0.1 280)',
};
export const TX_MOD_IDS = Object.keys(TX_MODS);
export const TX_TYPES = ['dialog', 'report', 'param', 'variant', 'oo', 'area'] as const;
export type TxType = (typeof TX_TYPES)[number];
export const modColor = (m: string) => TX_MODS[m] ?? 'oklch(0.8 0.02 60)';

/** The catalogue a tenant starts with: [code, description, module, program, type]. */
export { TX_CATALOG as TX_SEED } from './sapTcodeCatalog';

export type GuiSystem = {
  sid: string;
  name: string;
  mandt: string;
  router: string;
  host: string;
  inst: string;
  sapUser: string;
  lang: string;
};

/** Prototype `gui()`: the .sap shortcut SAP GUI opens on that system. */
export function sapShortcut(x: GuiSystem, opts: { lang?: string; tx?: string } = {}) {
  const clean = (s: string) => s.replace(/[\r\n]/g, '');
  const body = [
    '[System]',
    `Name=${clean(x.sid)}`,
    `Description=${clean(x.name)}`,
    `Client=${clean(x.mandt || '')}`,
    `GuiParm=${clean(x.router || '')}/H/${clean(x.host)}/S/32${clean(x.inst || '00')}`,
    '[User]',
    `Name=${clean(x.sapUser || '')}`,
    `Language=${clean(opts.lang || x.lang || 'PT')}`,
    '[Function]',
    `Command=${clean((opts.tx || '').trim().toUpperCase() || 'SMEN')}`,
    '[Configuration]',
    'WorkDir=',
    '[Options]',
    'Reuse=1',
  ].join('\r\n');
  const file = `${(x.sid || 'SAP').replace(/[^\w-]/g, '')}_${(x.mandt || '000').replace(/[^\w-]/g, '')}.sap`;
  return { file, body };
}

/** Prototype `copy()`: connection parameters as text. */
export const connectionText = (
  x: { name: string; sid: string; host: string; inst: string; mandt: string; router: string },
  L: { host: string; inst: string; mandt: string },
) =>
  `${x.name}\nSID: ${x.sid}\n${L.host}: ${x.host}\n${L.inst}: ${x.inst}\n${L.mandt}: ${x.mandt}` +
  (x.router ? `\nSAProuter: ${x.router}` : '');
