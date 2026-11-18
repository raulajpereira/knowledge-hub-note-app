// "Helpdesk" (SAP): the tickets of a helpdesk page (a table behind the person's
// own login) read by the browser extension every few minutes and kept here.
// The person maps the page's columns to these fields once; every column is
// also kept as read (cells) so nothing is lost.

export const HD_FIELDS = [
  'subject', // "#146975 Solicitação de …": the number and the summary
  'number',
  'summary',
  'parent',
  'assignee',
  'status',
  'priority',
  'type',
  'client',
  'reported', // "Jurema Makanda (16/11/2026 11:20)": who and when
  'comment', // "Último comentário": who and when
] as const;
export type HdField = (typeof HD_FIELDS)[number];
/** header (as on the page) → field; columns not listed are kept but not used */
export type HdMapping = Record<string, HdField>;

export const HD_INTERVALS = [5, 15, 30, 60] as const;
export const HD_ON_MISSING = ['notify', 'nothing'] as const;
export type HdOnMissing = (typeof HD_ON_MISSING)[number];

export const HD_MAX_ROWS = 500;
export const HD_MAX_COLS = 40;
export const HD_MAX_CELL = 600;

/** One ticket as read from a row, with the mapping applied. */
export type HdRow = {
  number: string;
  summary: string;
  parent: string;
  assignee: string;
  status: string;
  priority: string;
  type: string;
  client: string;
  reportedBy: string;
  reportedAt: string;
  commentBy: string;
  commentAt: string;
  /** the subject's link on the helpdesk, when the page has one */
  url: string;
  cells: Record<string, string>;
};

/** The fields whose changes are listed (the "modificações"). */
export const HD_TRACKED = ['status', 'priority', 'assignee', 'summary', 'type', 'client', 'parent'] as const;
export type HdTracked = (typeof HD_TRACKED)[number];

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const empty = (s: string) => (/^[-–—]?$/.test(clean(s)) ? '' : clean(s));

/** "#146975 Solicitação de …" → number + summary (also "146975 - …", "INC0012345 …"). */
export function splitSubject(s: string): { number: string; summary: string } {
  const t = clean(s);
  // "#1 …" (with #: any length) or "146975 …" / "INC0012345 …" (two digits or more)
  const m = /^(?:#\s*([A-Z]{0,6}\d+)|([A-Z]{0,6}\d{2,}))\s*[-–:·]?\s*(.*)$/i.exec(t);
  if (!m) return { number: '', summary: t };
  const number = (m[1] ?? m[2])!.toUpperCase();
  return { number, summary: m[3] || number };
}

/** "Jurema Makanda (16/11/2026 11:20)" → who + when (ISO-ish "2026-11-16 11:20", or the text). */
export function splitWhoWhen(s: string): { who: string; when: string } {
  const t = clean(s);
  const m = /^(.*?)\s*\(?\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ ,T]+(\d{1,2}):(\d{2}))?\s*\)?\s*$/.exec(
    t,
  );
  if (!m) return { who: t, when: '' };
  const p = (x: string | undefined) => (x ?? '').padStart(2, '0');
  const when = `${m[4]}-${p(m[3])}-${p(m[2])}${m[5] ? ` ${p(m[5])}:${m[6]}` : ''}`;
  return { who: clean(m[1]!), when };
}

/** A first mapping from the page's own headers (Portuguese / English). */
export function guessHdMapping(headers: readonly string[]): HdMapping {
  const out: HdMapping = {};
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const used = new Set<HdField>();
  const rules: Array<[RegExp, HdField]> = [
    [/^(assunto|subject|titulo|title)$/, 'subject'],
    [/^(n[ºo°.]?|numero|number|id|identificador|ticket|pedido)$/, 'number'],
    [/^(descricao|resumo|summary|description)$/, 'summary'],
    [/^(tarefa pai|pai|parent)/, 'parent'],
    [/^(atribuido a|responsavel|assignee|assigned to)/, 'assignee'],
    [/^(estado|status|situacao)$/, 'status'],
    [/^(prioridade|priority)$/, 'priority'],
    [/^(tipo|type)$/, 'type'],
    [/^(cliente|clientes|client|customer|empresa)$/, 'client'],
    [/^(reportado por|reported by|criado por|aberto por|requerente)/, 'reported'],
    [/^(ultimo comentario|last comment)/, 'comment'],
  ];
  for (const h of headers) {
    const n = norm(h);
    for (const [re, f] of rules)
      if (re.test(n) && !used.has(f)) {
        out[h] = f;
        used.add(f);
        break;
      }
  }
  return out;
}

/** A page row (cells in header order) as a ticket; null when it has no number. */
export function readRow(
  headers: readonly string[],
  cells: readonly string[],
  map: HdMapping,
  links?: readonly (string | null)[],
): HdRow | null {
  const r: HdRow = {
    number: '',
    summary: '',
    parent: '',
    assignee: '',
    status: '',
    priority: '',
    type: '',
    client: '',
    reportedBy: '',
    reportedAt: '',
    commentBy: '',
    commentAt: '',
    url: '',
    cells: {},
  };
  headers.forEach((h, i) => {
    const v = empty(String(cells[i] ?? '')).slice(0, HD_MAX_CELL);
    if (h) r.cells[h] = v;
    const f = map[h];
    if (!f) return;
    switch (f) {
      case 'subject': {
        const s = splitSubject(v);
        r.number ||= s.number;
        r.summary ||= s.summary;
        if (links?.[i]) r.url ||= links[i]!;
        break;
      }
      case 'number':
        r.number = clean(v).replace(/^#/, '').toUpperCase();
        if (links?.[i]) r.url ||= links[i]!;
        break;
      case 'summary':
        r.summary = v;
        break;
      case 'reported': {
        const w = splitWhoWhen(v);
        r.reportedBy = w.who;
        r.reportedAt = w.when;
        break;
      }
      case 'comment': {
        const w = splitWhoWhen(v);
        r.commentBy = w.who;
        r.commentAt = w.when;
        break;
      }
      default:
        r[f] = v;
    }
  });
  if (!/^[A-Z0-9][A-Z0-9_.-]{0,39}$/.test(r.number)) return null;
  r.summary = (r.summary || r.number).slice(0, 300);
  if (r.url && !/^https?:\/\//i.test(r.url)) r.url = '';
  return r;
}

/** The status's look and weight: Aberto, Reaberto and Em progresso come first (the ones to act on). */
export type HdStatusKind = 'open' | 'reopen' | 'progress' | 'pending' | 'done' | 'other';
export function hdStatusKind(status: string): HdStatusKind {
  const s = status.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (/^re-?abert|^reopen/.test(s)) return 'reopen';
  if (/^abert|^novo|^open|^new/.test(s)) return 'open';
  if (/progress|^em curso|^em tratamento|^in progress/.test(s)) return 'progress';
  if (/pendente|aguard|espera|pending|waiting|on hold/.test(s)) return 'pending';
  if (/resolvid|fechad|conclu|cancel|anulad|closed|resolved|done/.test(s)) return 'done';
  return 'other';
}
const RANK: Record<HdStatusKind, number> = { reopen: 0, open: 0, progress: 0, pending: 1, other: 1, done: 2 };
/** Sort key: the ones to act on first, then the rest, the ones that left the list last. */
export const hdRank = (status: string, inList: boolean) => (inList ? RANK[hdStatusKind(status)] : 3);

/** Where a Helpdesk notification opens: the ticket (one changed), that read's changes, or the page. */
export function hdNotifyHref(meta: Record<string, unknown> | null | undefined): string {
  const m = (meta ?? {}) as Record<string, string | undefined>;
  if (m.error) return '/app/helpdesk';
  if (m.item) return `/app/helpdesk?i=${encodeURIComponent(m.item)}`;
  if (m.at) return `/app/helpdesk?tab=changes&at=${encodeURIComponent(m.at)}`;
  return '/app/helpdesk?tab=changes';
}
