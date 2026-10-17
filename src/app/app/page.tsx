import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { HomeView } from '@/components/home/HomeView';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { getPrefs } from '@/server/prefs';
import { LAST_PAGE_KEY } from '@/lib/prefs';
import { startPath } from '@/lib/startPage';

export const metadata = { title: 'KnowledgeHub' };

/** The hour where the person is (kh_tz cookie), so the greeting is in the server HTML. */
async function localHour(): Promise<number | null> {
  const tz = (await cookies()).get('kh_tz')?.value;
  if (!tz) return null;
  try {
    const h = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(
      new Date(),
    );
    const n = Number(h);
    return Number.isInteger(n) && n >= 0 && n < 24 ? n : null;
  } catch {
    return null; // unknown time zone
  }
}

/**
 * The start page chosen in Definições, when /app is *opened* — a full page
 * load (typed address, bookmark, reload, the login) — and not when Início is
 * clicked inside the app (a client navigation: a fetch).
 */
async function startPage(): Promise<string | null> {
  const h = await headers();
  // a document load (Sec-Fetch-Dest), not the router's fetch of an Início click
  const doc = h.get('sec-fetch-dest') ? h.get('sec-fetch-dest') === 'document' : !h.get('rsc');
  if (!doc) return null;
  const auth = await getAuth();
  if (!auth) return null;
  const [prefs, ent] = await Promise.all([getPrefs(auth.user.id), getEntitlements(auth.tenant.id)]);
  if (!prefs.startPage || prefs.startPage === 'home') return null;
  return startPath(prefs.startPage, prefs[LAST_PAGE_KEY], new Set(ent.modules));
}

// Início: weather + customisable cards (prototype isHome).
export default async function HomePage() {
  const to = await startPage();
  if (to) redirect(to);
  return <HomeView initialHour={await localHour()} />;
}
