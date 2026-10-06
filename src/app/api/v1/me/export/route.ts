import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { exportData } from '@/server/account';

export const GET = handler(async () => {
  const auth = await requireAuth();
  const data = await exportData(auth);
  const day = new Date().toISOString().slice(0, 10);
  return json(data, {
    headers: { 'Content-Disposition': `attachment; filename="knowledgehub-${day}.json"` },
  });
});
