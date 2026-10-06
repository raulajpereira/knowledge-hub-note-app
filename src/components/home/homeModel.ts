import { HOME_SPAN, type HomePrefs, type HomeType } from '@/lib/prefs';

// Início model (prototype HOME_DEF, HOME_ICONS, QUICK_DEF, QUICK_TINT, SC_DEF, hPack).
export type Widget = HomePrefs['widgets'][number];

export const HOME_DEF: Array<{ type: HomeType; size: Widget['size'] }> = [
  { type: 'today', size: 'L' },
  { type: 'capture', size: 'S' },
  { type: 'shortcuts', size: 'M' },
  { type: 'tcodes', size: 'M' },
  { type: 'tasks', size: 'M' },
  { type: 'deadlines', size: 'M' },
  { type: 'notes', size: 'S' },
  { type: 'favs', size: 'S' },
  { type: 'focus', size: 'S' },
  { type: 'transports', size: 'M' },
  { type: 'issues', size: 'M' },
  { type: 'qnotes', size: 'S' },
  { type: 'systems', size: 'S' },
  { type: 'emails', size: 'S' },
];

/** Card → module that must be in the plan (null = always available). */
export const WIDGET_MODULE: Record<HomeType, string | null> = {
  today: null,
  capture: null,
  shortcuts: null,
  tcodes: 'tcodes',
  tasks: 'tasks',
  deadlines: 'tasks',
  notes: 'notes',
  favs: null,
  focus: null,
  transports: 'transports',
  issues: 'issues',
  systems: 'systems',
  qnotes: 'notes',
  emails: 'emails',
};

export const widgetAllowed = (type: HomeType, modules: ReadonlySet<string>) => {
  const m = WIDGET_MODULE[type];
  return m === null || modules.has(m);
};

export function defaultWidgets(modules: ReadonlySet<string>): Widget[] {
  return HOME_DEF.filter((w) => widgetAllowed(w.type, modules)).map((w, i) => ({ id: `w${i}`, ...w }));
}

export const HOME_ICONS: Record<HomeType, string> = {
  tcodes:
    '<rect x="3" y="5" width="18" height="14" rx="2.5"></rect><path d="M7 10l3 2-3 2"></path><line x1="12" y1="15" x2="16" y2="15"></line>',
  shortcuts:
    '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"></path><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"></path>',
  today:
    '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>',
  capture: '<path d="M13 3L4 14h7l-1 7 9-11h-7z"></path>',
  tasks: '<rect x="4" y="4" width="16" height="16" rx="3"></rect><path d="M8.5 12l2.5 2.5 4.5-5"></path>',
  deadlines:
    '<rect x="4" y="5" width="16" height="15" rx="2.5"></rect><line x1="4" y1="10" x2="20" y2="10"></line><line x1="9" y1="3" x2="9" y2="7"></line><line x1="15" y1="3" x2="15" y2="7"></line>',
  notes:
    '<path d="M7 3h7l5 5v13H7z"></path><line x1="10" y1="13" x2="16" y2="13"></line><line x1="10" y1="17" x2="16" y2="17"></line>',
  favs: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"></path>',
  focus: '<circle cx="12" cy="13" r="8"></circle><path d="M12 9v4l2.5 2"></path><path d="M10 2h4"></path>',
  transports:
    '<path d="M2 7h11v9H2z"></path><path d="M13 10h4l3 3v3h-7"></path><circle cx="6" cy="17.5" r="1.8"></circle><circle cx="17" cy="17.5" r="1.8"></circle>',
  issues:
    '<rect x="4" y="4" width="16" height="5" rx="1.5"></rect><path d="M5 9v10h14V9"></path><line x1="10" y1="13" x2="14" y2="13"></line>',
  systems:
    '<rect x="4" y="4" width="16" height="7" rx="2"></rect><rect x="4" y="13" width="16" height="7" rx="2"></rect>',
  qnotes: '<path d="M5 4h14v11l-5 5H5z"></path><path d="M14 20v-5h5"></path>',
  emails: '<rect x="3" y="5" width="18" height="14" rx="2.5"></rect><path d="M4 7l8 6 8-6"></path>',
};

export const QUICK_DEF = ['tasks', 'notes', 'issues', 'voice', 'emails', 'artifacts'];
export const QUICK_TINT: Record<string, string> = {
  tasks: 'oklch(0.8 0.13 30 / .28)',
  notes: 'oklch(0.86 0.1 85 / .26)',
  issues: 'oklch(0.78 0.11 240 / .28)',
  voice: 'oklch(0.76 0.12 300 / .28)',
  emails: 'oklch(0.82 0.11 210 / .26)',
  artifacts: 'oklch(0.8 0.1 160 / .24)',
  api: 'oklch(0.8 0.12 130 / .24)',
  transports: 'oklch(0.85 0.12 75 / .26)',
  systems: 'oklch(0.72 0.14 260 / .26)',
};
export const SC_DEF = [
  { id: 'sc1', title: 'SAP Help Portal', url: 'https://help.sap.com' },
  { id: 'sc2', title: 'SAP Community', url: 'https://community.sap.com' },
  { id: 'sc3', title: 'SAP for Me', url: 'https://me.sap.com' },
  {
    id: 'sc4',
    title: 'ABAP Keyword Docs',
    url: 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/index.htm',
  },
];

/** Default page for each card's "Ver Tudo →". */
export const WIDGET_PAGE: Partial<Record<HomeType, string>> = {
  tcodes: 'tcodes',
  tasks: 'tasks',
  notes: 'notes',
  transports: 'transports',
  issues: 'issues',
  systems: 'systems',
  emails: 'emails',
};

export type PackedRow = { items: Array<{ w: Widget; index: number; f: number }> };

/** prototype hPack: fill 12-column rows by size, then use each card's saved fraction (fr) inside its row. */
export function pack(widgets: Widget[]): PackedRow[] {
  const rows: number[][] = [];
  let cur: number[] = [];
  let acc = 0;
  widgets.forEach((w, i) => {
    const sp = HOME_SPAN[w.size];
    if (acc + sp > 12 && cur.length) {
      rows.push(cur);
      cur = [];
      acc = 0;
    }
    cur.push(i);
    acc += sp;
  });
  if (cur.length) rows.push(cur);
  return rows.map((idx) => {
    const raw = idx.map((i) => widgets[i]!.fr ?? HOME_SPAN[widgets[i]!.size]);
    const sum = raw.reduce((a, b) => a + b, 0) || 1;
    return { items: idx.map((i, j) => ({ w: widgets[i]!, index: i, f: raw[j]! / sum })) };
  });
}

/** prototype resize: card j of a row gets fraction fn, the others share the rest proportionally (each ≥ minF). */
export function resizeRow(f: number[], j: number, fn: number, minF: number): number[] {
  const n = f.length;
  const clamped = Math.max(minF, Math.min(1 - minF * (n - 1), fn));
  const oth = f.reduce((a, x, k) => (k === j ? a : a + x), 0) || 1;
  const rem = 1 - clamped;
  let nf = f.map((x, k) => (k === j ? clamped : (x / oth) * rem));
  if (nf.some((x) => x < minF - 1e-6)) {
    nf = nf.map((x, k) => (k === j ? clamped : Math.max(minF, x)));
    const s = nf.reduce((a, b) => a + b, 0);
    nf = nf.map((x) => x / s);
  }
  return nf.map((x) => +x.toFixed(4));
}
