import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { createMeeting, listMeetings } from '@/server/content/meetings';
import { MeetingCreate } from './schemas';

/** GET /meetings — the caller's meeting minutes, newest first · POST creates one. */
export const GET = handler(async () => {
  const auth = await requireContent('meetings');
  return json({ meetings: await listMeetings(auth) });
});

export const POST = handler(async (req) => {
  const auth = await requireContent('meetings');
  const input = await body(req, MeetingCreate);
  return json({ meeting: await createMeeting(auth, input) }, { status: 201 });
});
