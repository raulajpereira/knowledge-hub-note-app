import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { accentRegex } from '@/lib/search/fold';

// Accent- and case-insensitive "contains" in SQL, the same fold as the
// browser's (src/lib/search/fold.ts): "reuniao" finds "Reunião" and back.

/** `x` contains `text`, accents and case aside */
export const foldMatch = (x: SQL | AnyPgColumn, text: string) => sql`${x} ~* ${accentRegex(text)}`;
