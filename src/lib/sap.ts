// SAP landscape helpers shared by the client and the server (ZNotes.dc.html
// isSystems / isTcodes): environment colours, transaction modules and types,
// the prototype's transaction catalogue and the SAP GUI shortcut file.

/** System role: DEV → QAS → PRD, plus sandbox and "other" (outside the transport route). */
export const SAP_ENVS = ['DEV', 'QAS', 'PRD', 'SBX', 'OTH'] as const;
export type SapEnv = (typeof SAP_ENVS)[number];
export const ENV_C: Record<SapEnv, string> = {
  DEV: 'oklch(0.82 0.11 210)',
  QAS: 'oklch(0.85 0.12 75)',
  PRD: 'oklch(0.72 0.17 25)',
  SBX: 'oklch(0.8 0.1 300)',
  OTH: 'oklch(0.8 0.02 250)',
};
/** Order of the roles in lists and in the landscape map. */
export const ENV_ORDER: Record<SapEnv, number> = { SBX: -1, DEV: 0, QAS: 1, PRD: 2, OTH: 3 };
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

/**
 * Transaction modules are open-ended: the built-in ones above plus any the
 * tenant types in (stored upper-case, single spaces, 1–20 letters, digits,
 * spaces, "-" or "_").
 */
export const TX_MOD_MAX = 20;
export const TX_MOD_RE = /^[\p{L}\p{N}_-](?:[\p{L}\p{N} _-]{0,18}[\p{L}\p{N}_-])?$/u;
export const normTxMod = (m: string) => m.trim().replace(/\s+/g, ' ').toUpperCase();
/** The typed text as a module name, or null when it is not a valid one. */
export const parseTxMod = (m: string) => {
  const v = normTxMod(m);
  return TX_MOD_RE.test(v) ? v : null;
};
/** The built-in modules first, then the tenant's own (alphabetical). */
export const txModules = (used: Iterable<string>) => {
  const extra = new Set<string>();
  for (const m of used) if (m && !(m in TX_MODS)) extra.add(m);
  return [...TX_MOD_IDS, ...[...extra].sort((a, b) => a.localeCompare(b))];
};
/** Built-ins keep their colour; any other module gets a stable hue from its name. */
export const modColor = (m: string) => {
  const c = TX_MODS[m];
  if (c) return c;
  if (!m) return 'oklch(0.8 0.02 60)';
  let h = 0x811c9dc5;
  for (let i = 0; i < m.length; i++) h = Math.imul(h ^ m.charCodeAt(i), 0x01000193) >>> 0;
  return `oklch(0.8 0.11 ${h % 360})`;
};

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
