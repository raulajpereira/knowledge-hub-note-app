import { cookies } from 'next/headers';
import { HomeView } from '@/components/home/HomeView';

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

// Início: weather + customisable cards (prototype isHome).
export default async function HomePage() {
  return <HomeView initialHour={await localHour()} />;
}
