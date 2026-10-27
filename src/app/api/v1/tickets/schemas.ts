import { z } from 'zod';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '@/lib/tickets';

const number = z.string().trim().min(1).max(40);
const summary = z.string().trim().min(1).max(300);
const name = z.string().trim().max(120);
const when = z.iso.datetime({ offset: true });

export const TicketCreate = z.object({
  number,
  summary,
  folderId: z.uuid().nullable().optional(),
  sharedFolderId: z.uuid().nullable().optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  typeId: z.uuid().nullable().optional(),
  clientId: z.uuid().nullable().optional(),
  clientName: name.optional(),
  responsibleId: z.uuid().nullable().optional(),
  responsibleName: name.optional(),
  parentNumber: z.string().trim().max(40).optional(),
  parentSummary: z.string().trim().max(300).optional(),
  openedAt: when.optional(),
  dueOn: z.iso.date().nullable().optional(),
});

export const TicketPatch = TicketCreate.partial().extend({
  resolvedAt: when.nullable().optional(),
  // the notes as a document (checked by validateDoc, ≤ 1 MB)
  notesDoc: z.record(z.string(), z.unknown()).optional(),
});

export const TypeName = z.object({ name: z.string().trim().min(1).max(60) });
