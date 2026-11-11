import { body, handler, json } from '@/server/http';
import { startEntry, TimeStart } from '@/server/content/timelog';
import { timelogAuth } from '@/server/content/timelogHttp';

/** POST /timelog/start { refKind?, refId?, refLabel?, clientId?, clientLabel?, projectId?, description? } */
export const POST = handler(async (req) => {
  const input = await body(req, TimeStart);
  const { auth } = await timelogAuth();
  return json({ entry: await startEntry(auth, input) }, { status: 201 });
});
