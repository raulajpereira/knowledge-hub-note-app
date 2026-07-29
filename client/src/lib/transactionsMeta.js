export const MODULE_HUES = {
  'ABAP': 250,
  'Basis': 220,
  'HCM · PA': 290,
  'HCM · PT': 290,
  'HCM · PY': 290,
  'HCM · OM': 290,
  'SuccessFactors · EC': 145,
  'SuccessFactors · RBP': 145,
  'SuccessFactors · MDF': 145,
  'FI': 20,
  'MM': 70,
  'Outros': 10,
};

export const MODULE_GROUPS = ['Todos', 'ABAP', 'Basis', 'HCM', 'SuccessFactors', 'Outros'];

export const TYPE_OPTIONS = ['Transação Standard', 'Report / Query', 'Customizing (SPRO)', 'BAPI / Function Module', 'Fiori App', 'Admin Tool (SF)', 'Custom (Z)'];

export function hueForModule(module) {
  return MODULE_HUES[module] || 220;
}
