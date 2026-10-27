import { AI_SOURCE_HREF } from '@/lib/ai';

// The header's global search (GET /api/v1/search): what the server answers and
// where each kind of result opens. Shared by the route and the browser.

export type SearchItem = {
  id: string;
  title: string;
  /** text around the match when the title alone does not explain it ('' otherwise) */
  snippet: string;
  at: string;
};
export type SearchGroup = {
  type: string;
  /** plan module of the group: its sidebar label and icon (nav_<module>) */
  module: string;
  /** every match of the group (the items are the best few) */
  count: number;
  items: SearchItem[];
};
export type SearchResponse = { q: string; groups: SearchGroup[] };

/** Items shown per group in the header dropdown / on the results page. */
export const DROPDOWN_PER_GROUP = 4;
export const PAGE_PER_GROUP = 20;
export const MAX_PER_GROUP = 100;

const EXTRA_HREF: Record<string, (id: string) => string> = {
  system: (id) => `/app/systems?s=${id}`,
  tcode: (id) => `/app/tcodes?x=${id}`,
  sapnote: (id) => `/app/sapnotes?n=${id}`,
};

/** Where a result opens (null: a kind without a page to open it in). */
export function searchHref(type: string, id: string): string | null {
  const f = EXTRA_HREF[type] ?? AI_SOURCE_HREF[type];
  return f ? f(encodeURIComponent(id)) : null;
}

/** The full results page for a query. */
export const searchPageHref = (q: string) => `/app/search?q=${encodeURIComponent(q.trim())}`;
