import 'server-only';
import type { NextRequest } from 'next/server';
import { requireContent } from '@/server/content/guard';
import { entitlementsFor } from '@/server/workspaces';

/** The browser's time zone (?tz= or x-kh-tz), for the timesheet day; Lisbon otherwise. */
export function tzOf(req: NextRequest): string {
  const tz = new URL(req.url).searchParams.get('tz') ?? req.headers.get('x-kh-tz') ?? '';
  try {
    if (tz) {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return tz;
    }
  } catch {
    /* unknown zone */
  }
  return 'Europe/Lisbon';
}

/** The person (with "Registo de Tempos") and their modules. */
export async function timelogAuth() {
  const auth = await requireContent('timelog');
  const { modules } = await entitlementsFor(auth);
  return { auth, mods: new Set(modules) as ReadonlySet<string> };
}
