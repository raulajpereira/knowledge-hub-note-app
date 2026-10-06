import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth/request';

export const dynamic = 'force-dynamic';

// Root: straight into the app when signed in, otherwise the login page.
export default async function Home() {
  redirect((await getAuth()) ? '/app' : '/login');
}
