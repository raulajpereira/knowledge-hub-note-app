import type { NavEntry } from '@/lib/prefs';
import { NAV_DEFAULT, NAV_ICON_PATHS } from './navData';

// Sidebar model (prototype loadNav/sideRows) + plan gating (ROADMAP:
// "gating da barra lateral"): an item shows only when its module is in the
// tenant's entitlements; group headers and spacers left without visible
// items disappear. The server re-checks every page/API call anyway.

/** Items that aren't licensed modules: always on (home) or tied to another module. */
const ITEM_MODULE: Record<string, string | null> = {
  home: null,
  tags: 'notes',
};

export function moduleOf(id: string): string | null {
  return id in ITEM_MODULE ? ITEM_MODULE[id]! : id;
}

export const isKnownItem = (id: string) =>
  id in NAV_ICON_PATHS && id !== 'contacts' && !/^fn_(cfg|ricef|kb|glo)$/.test(id);

/** URL segment for a nav item: /app for home, /app/mg-overview for mg_overview… */
export function hrefOf(id: string): string {
  return id === 'home' ? '/app' : `/app/${id.replace(/_/g, '-')}`;
}

export function idFromSegment(seg: string): string {
  return seg.replace(/-/g, '_');
}

export function defaultNav(): NavEntry[] {
  return NAV_DEFAULT.map((x) => ({ ...x }) as NavEntry);
}

/** Saved layout, cleaned up: unknown ids dropped, items missing from it appended (prototype loadNav). */
export function normalizeNav(saved: NavEntry[] | undefined): NavEntry[] {
  if (!Array.isArray(saved) || !saved.length) return defaultNav();
  const seen = new Set<string>();
  const out: NavEntry[] = [];
  for (const e of saved) {
    if (e.type === 'item') {
      if (!isKnownItem(e.id) || seen.has(e.id)) continue;
      seen.add(e.id);
    }
    out.push({ ...e });
  }
  for (const d of NAV_DEFAULT) if (d.type === 'item' && !seen.has(d.id)) out.push({ ...d, nested: false });
  return out;
}

export type SideRow =
  | { kind: 'item'; id: string; label: string; href: string; nested: boolean; count?: number }
  | { kind: 'group'; index: number; name: string; open: boolean }
  | { kind: 'spacer' };

export function sideRows(
  layout: NavEntry[],
  modules: ReadonlySet<string>,
  label: (id: string) => string,
  counts: Record<string, number> = {},
): SideRow[] {
  // 1) which items are visible at all (licensed and not hidden by the user)
  const allowed = (id: string) => {
    const m = moduleOf(id);
    return m === null || modules.has(m);
  };
  const rows: SideRow[] = [];
  type Open = { open: boolean; rowAt: number; hasItems: boolean };
  let group: Open | null = null as Open | null;
  const closeGroup = () => {
    if (group && !group.hasItems) rows.splice(group.rowAt, 1);
    group = null;
  };
  for (const [index, e] of layout.entries()) {
    if (e.type === 'spacer') {
      closeGroup();
      rows.push({ kind: 'spacer' });
    } else if (e.type === 'group') {
      closeGroup();
      group = { open: e.open, rowAt: rows.length, hasItems: false };
      rows.push({ kind: 'group', index, name: e.name, open: e.open });
    } else {
      if (e.hidden || !allowed(e.id)) continue;
      const inGroup = Boolean(e.nested && group);
      if (inGroup) group!.hasItems = true;
      if (inGroup && !group!.open) continue;
      rows.push({
        kind: 'item',
        id: e.id,
        label: e.label || label(`nav_${e.id}`),
        href: hrefOf(e.id),
        nested: inGroup,
        count: counts[e.id] || undefined,
      });
    }
  }
  closeGroup();
  // 2) spacers: no leading/trailing ones, no doubles
  const out: SideRow[] = [];
  for (const r of rows) {
    if (r.kind === 'spacer' && (!out.length || out[out.length - 1]!.kind === 'spacer')) continue;
    out.push(r);
  }
  while (out.length && out[out.length - 1]!.kind === 'spacer') out.pop();
  return out;
}
