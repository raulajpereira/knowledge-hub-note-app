import { z } from 'zod';

const time = z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal('')]);
const items = z.array(z.object({ t: z.string().max(2000), done: z.boolean() })).max(200);

export const MeetingCreate = z.object({
  title: z.string().trim().min(1).max(300),
  heldOn: z.iso.date(),
  startTime: time.optional(),
  endTime: time.optional(),
  folderId: z.uuid().nullable().optional(),
});

export const MeetingPatch = z.object({
  folderId: z.uuid().nullable().optional(),
  title: z.string().trim().min(1).max(300).optional(),
  heldOn: z.iso.date().optional(),
  startTime: time.optional(),
  endTime: time.optional(),
  participants: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  topics: z.string().max(100_000).optional(),
  review: items.optional(),
  todos: items.optional(),
});
