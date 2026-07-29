// Exact overrides for modules that don't fit the HCM/SuccessFactors prefix
// rule below (e.g. a bare "FI"/"MM" module with no "HCM ·"/"SuccessFactors ·"
// prefix). Anything not listed here falls through to the prefix match.
const MODULE_HUE_OVERRIDES = {
  'ABAP': 250,
  'Basis': 220,
  'FI': 20,
  'MM': 70,
  'Outros': 10,
};

export const MODULE_GROUPS = ['Todos', 'ABAP', 'Basis', 'HCM', 'SuccessFactors', 'Outros'];

export const TYPE_OPTIONS = ['Transação Standard', 'Report / Query', 'Customizing (SPRO)', 'BAPI / Function Module', 'Fiori App', 'Admin Tool (SF)', 'Custom (Z)'];

// Prefix-matched so any new sub-module string (e.g. "HCM · Recrutamento",
// "SuccessFactors · LMS") automatically gets the right color family without
// needing a new dictionary entry every time the catalog grows.
export function hueForModule(module) {
  if (MODULE_HUE_OVERRIDES[module] !== undefined) return MODULE_HUE_OVERRIDES[module];
  if (module?.startsWith('HCM')) return 290;
  if (module?.startsWith('SuccessFactors')) return 145;
  return 220;
}
