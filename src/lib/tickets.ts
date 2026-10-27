// Tickets (SAP › Tickets): the rules shared by the server and the browser —
// statuses, priorities, which statuses count as open or resolved, the default
// types of a new list and the colours (status/priority chips, overdue dates).

export const TICKET_STATUSES = [
  'open',
  'progress',
  'pending_customer',
  'pending_vendor',
  'on_hold',
  'awaiting_info',
  'resolved',
  'closed',
  'cancelled',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['very_low', 'low', 'medium', 'high', 'very_high'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

/** Resolvido / Fechado: the resolution date is set when a ticket gets there and cleared when it is reopened. */
export const RESOLVED_STATUSES: readonly TicketStatus[] = ['resolved', 'closed'];
/** No longer open: neither overdue nor on the Home card. */
export const DONE_STATUSES: readonly TicketStatus[] = ['resolved', 'closed', 'cancelled'];
export const isDone = (s: TicketStatus) => DONE_STATUSES.includes(s);

/** The type list a person starts with (editable in the Tickets settings). */
export const DEFAULT_TYPES = {
  pt: ['Incidente', 'Pedido de Serviço', 'Alteração', 'Problema', 'Dúvida'],
  en: ['Incident', 'Service Request', 'Change', 'Problem', 'Question'],
} as const;

export const TICKET_LIMITS = {
  number: 40,
  summary: 300,
  name: 120,
  type: 60,
  comment: 20_000,
  types: 50,
  tickets: 20_000,
} as const;

// Colours: open/active blue, pending amber, on hold / awaiting grey-violet,
// resolved/closed green, cancelled red (muted).
export const STATUS_COLOR: Record<TicketStatus, string> = {
  open: 'oklch(0.78 0.12 240)',
  progress: 'oklch(0.74 0.14 262)',
  pending_customer: 'oklch(0.84 0.13 78)',
  pending_vendor: 'oklch(0.8 0.13 60)',
  on_hold: 'oklch(0.72 0.06 300)',
  awaiting_info: 'oklch(0.76 0.08 285)',
  resolved: 'oklch(0.8 0.14 150)',
  closed: 'oklch(0.72 0.09 160)',
  cancelled: 'oklch(0.66 0.12 25)',
};
export const PRIORITY_COLOR: Record<TicketPriority, string> = {
  very_low: 'oklch(0.74 0.05 230)',
  low: 'oklch(0.8 0.11 200)',
  medium: 'oklch(0.85 0.12 85)',
  high: 'oklch(0.77 0.15 50)',
  very_high: 'oklch(0.68 0.2 25)',
};
/** Sort order: Muito Alta first. */
export const PRIORITY_RANK: Record<TicketPriority, number> = {
  very_high: 0,
  high: 1,
  medium: 2,
  low: 3,
  very_low: 4,
};

/** "Nº Ticket" as typed, trimmed (compared case-insensitively). */
export const cleanNumber = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, TICKET_LIMITS.number);

/** The attachments of a ticket are served with a type only for what browsers show safely inline. */
export const TICKET_FILE_SRC = /^\/api\/v1\/tickets\/files\/[0-9a-f-]{36}$/;
