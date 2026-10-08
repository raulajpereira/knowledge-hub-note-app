import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { meetings, type MeetingItem } from '@/db/schema';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { asUser } from './tenant';

// Meeting minutes ("Atas de Reunião"): date and time, subject, participants
// by name (they may be outside the app), and the minutes — topics discussed,
// points to review and things to do. Shown on the Calendar by date.

export type Meeting = {
  id: string;
  title: string;
  heldOn: string;
  startTime: string;
  endTime: string;
  participants: string[];
  topics: string;
  review: MeetingItem[];
  todos: MeetingItem[];
  createdAt: string;
  updatedAt: string;
};

const cols = {
  id: meetings.id,
  title: meetings.title,
  heldOn: meetings.heldOn,
  startTime: meetings.startTime,
  endTime: meetings.endTime,
  participants: meetings.participants,
  topics: meetings.topics,
  review: meetings.review,
  todos: meetings.todos,
  createdAt: meetings.createdAt,
  updatedAt: meetings.updatedAt,
};
type Row = Omit<Meeting, 'createdAt' | 'updatedAt'> & { createdAt: Date; updatedAt: Date };
const toMeeting = (r: Row): Meeting => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

export async function listMeetings(auth: AuthContext): Promise<Meeting[]> {
  return asUser(auth, async (tx) => {
    const rows = await tx
      .select(cols)
      .from(meetings)
      .where(isNull(meetings.deletedAt))
      .orderBy(desc(meetings.heldOn), desc(meetings.startTime), desc(meetings.createdAt))
      .limit(5000);
    return rows.map(toMeeting);
  });
}

export async function createMeeting(
  auth: AuthContext,
  input: { title: string; heldOn: string; startTime?: string; endTime?: string },
): Promise<Meeting> {
  return asUser(auth, async (tx) => {
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(meetings)
      .where(isNull(meetings.deletedAt))) as [{ n: number }];
    if (n >= 5000) throw new ApiError(400, 'too_many_items');
    const [r] = await tx
      .insert(meetings)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        title: input.title,
        heldOn: input.heldOn,
        startTime: input.startTime ?? '',
        endTime: input.endTime ?? '',
      })
      .returning(cols);
    return toMeeting(r!);
  });
}

export type MeetingPatch = Partial<
  Pick<Meeting, 'title' | 'heldOn' | 'startTime' | 'endTime' | 'participants' | 'topics' | 'review' | 'todos'>
>;

export async function updateMeeting(auth: AuthContext, id: string, patch: MeetingPatch): Promise<Meeting> {
  return asUser(auth, async (tx) => {
    const [r] = await tx
      .update(meetings)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(meetings.id, id), isNull(meetings.deletedAt)))
      .returning(cols);
    if (!r) throw new ApiError(404, 'not_found');
    return toMeeting(r);
  });
}

export async function trashMeeting(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(meetings)
      .set({ deletedAt: new Date() })
      .where(and(eq(meetings.id, id), isNull(meetings.deletedAt)))
      .returning({ id: meetings.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}
