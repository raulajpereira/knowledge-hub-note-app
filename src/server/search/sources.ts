import { isNull, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import {
  artifacts,
  driveFiles,
  emails,
  issues,
  meetings,
  notes,
  sapObjects,
  sapTransports,
  snippets,
  tasks,
  voiceNotes,
} from '@/db/schema';

// What each kind of item contributes to search: the AI assistant's keyword
// search, the embeddings the worker makes, and the excerpts shown for meaning
// matches all read the SAME text, so a chunk number always maps back to the
// same piece of text. Text recognised in an item's images / scanned PDFs (OCR)
// is part of it.

export const ITEM_TYPES = [
  'note',
  'meeting',
  'task',
  'issue',
  'voice',
  'artifact',
  'email',
  'snippet',
  'code',
  'transport',
  'file',
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export type Kind = {
  type: ItemType;
  table: PgTable;
  id: AnyPgColumn;
  title: SQL;
  /** searched by keyword and embedded */
  body: SQL;
  /** embedded only (too big or too slow for ILIKE scans), appended after body */
  extra?: SQL;
  at: AnyPgColumn;
  alive: SQL;
  /** the tenant-wide SAP library has no owner */
  owned: boolean;
};

/** Recognised text of an item's images / PDFs ('' when none). */
const ocr = (type: 'note' | 'meeting' | 'email' | 'file', id: AnyPgColumn) =>
  sql`coalesce((select string_agg(o.text, ' ') from ocr_texts o where o.parent_type = ${type} and o.parent_id = ${id} and o.status = 'done'), '')`;

export const KINDS: Kind[] = [
  {
    type: 'note',
    table: notes,
    id: notes.id,
    title: sql`${notes.title}`,
    body: sql`${notes.title} || ' ' || ${notes.contentText} || ' ' || ${ocr('note', notes.id)}`,
    at: notes.updatedAt,
    alive: isNull(notes.deletedAt)!,
    owned: true,
  },
  {
    type: 'meeting',
    table: meetings,
    id: meetings.id,
    title: sql`${meetings.title} || ' (' || ${meetings.heldOn} || ')'`,
    body: sql`${meetings.title} || ' ' || ${meetings.heldOn} || ' ' || array_to_string(${meetings.participants}, ', ') || ' ' || ${meetings.topics} || ' ' || ${meetings.review}::text || ' ' || ${meetings.todos}::text || ' ' || ${ocr('meeting', meetings.id)}`,
    at: meetings.updatedAt,
    alive: isNull(meetings.deletedAt)!,
    owned: true,
  },
  {
    type: 'task',
    table: tasks,
    id: tasks.id,
    title: sql`${tasks.title}`,
    body: sql`${tasks.title} || ' ' || ${tasks.notes} || ' ' || coalesce(${tasks.dueOn}::text, '') || case when ${tasks.doneAt} is null then ' (aberta)' else ' (concluída)' end`,
    at: tasks.updatedAt,
    alive: isNull(tasks.deletedAt)!,
    owned: true,
  },
  {
    type: 'issue',
    table: issues,
    id: issues.id,
    title: sql`${issues.title}`,
    body: sql`${issues.title} || ' [' || ${issues.status} || '] ' || ${issues.description} || ' ' || ${issues.notes}`,
    at: issues.updatedAt,
    alive: isNull(issues.deletedAt)!,
    owned: true,
  },
  {
    type: 'voice',
    table: voiceNotes,
    id: voiceNotes.id,
    title: sql`${voiceNotes.title}`,
    body: sql`${voiceNotes.title} || ' ' || coalesce(${voiceNotes.transcript}, '') || ' ' || ${voiceNotes.notes}`,
    at: voiceNotes.updatedAt,
    alive: isNull(voiceNotes.deletedAt)!,
    owned: true,
  },
  {
    type: 'artifact',
    table: artifacts,
    id: artifacts.id,
    title: sql`${artifacts.title}`,
    body: sql`${artifacts.title} || ' ' || ${artifacts.description}`,
    // the page's visible text (scripts and styles out, tags out)
    extra: sql`left(regexp_replace(regexp_replace(${artifacts.html}, '<(script|style)[^>]*>.*?</\\1>', ' ', 'gi'), '<[^>]+>|&nbsp;', ' ', 'g'), 60000)`,
    at: artifacts.updatedAt,
    alive: isNull(artifacts.deletedAt)!,
    owned: true,
  },
  {
    type: 'email',
    table: emails,
    id: emails.id,
    title: sql`${emails.subject}`,
    body: sql`${emails.subject} || ' — ' || ${emails.fromName} || ' ' || ${emails.bodyText} || ' ' || ${emails.notes} || ' ' || ${ocr('email', emails.id)}`,
    at: emails.updatedAt,
    alive: isNull(emails.deletedAt)!,
    owned: true,
  },
  {
    type: 'snippet',
    table: snippets,
    id: snippets.id,
    title: sql`${snippets.title}`,
    body: sql`${snippets.title} || ' ' || ${snippets.description} || ' ' || ${snippets.files}::text`,
    at: snippets.updatedAt,
    alive: isNull(snippets.deletedAt)!,
    owned: true,
  },
  {
    type: 'code',
    table: sapObjects,
    id: sapObjects.id,
    title: sql`${sapObjects.type} || ' ' || ${sapObjects.name}`,
    body: sql`${sapObjects.type} || ' ' || ${sapObjects.name} || ' ' || ${sapObjects.description} || ' ' || ${sapObjects.nodes}::text`,
    at: sapObjects.updatedAt,
    alive: isNull(sapObjects.deletedAt)!,
    owned: false,
  },
  {
    type: 'transport',
    table: sapTransports,
    id: sapTransports.id,
    title: sql`${sapTransports.trkorr} || ' ' || ${sapTransports.description}`,
    body: sql`${sapTransports.trkorr} || ' ' || ${sapTransports.description} || ' ' || ${sapTransports.owner} || ' ' || ${sapTransports.notes}`,
    at: sapTransports.updatedAt,
    alive: isNull(sapTransports.deletedAt)!,
    owned: false,
  },
  {
    type: 'file',
    table: driveFiles,
    id: driveFiles.id,
    title: sql`${driveFiles.name}`,
    body: sql`${driveFiles.name} || ' ' || ${ocr('file', driveFiles.id)}`,
    at: driveFiles.updatedAt,
    alive: isNull(driveFiles.deletedAt)!,
    owned: true,
  },
];

export const kindOf = (type: string) => KINDS.find((k) => k.type === type);

/** The text embedded for an item: body, then the embed-only part. */
export const embedSelect = (k: Kind) => (k.extra ? sql`(${k.body}) || ' ' || (${k.extra})` : k.body);
