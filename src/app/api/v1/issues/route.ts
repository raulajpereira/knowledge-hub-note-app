import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { createIssue, listIssues } from '@/server/content/issues';
import { ISSUE_STATUSES } from '@/db/schema';

export const GET = handler(async () => {
  const auth = await requireContent('issues');
  return json({ issues: await listIssues(auth) });
});

export const POST = handler(async (req) => {
  const auth = await requireContent('issues');
  const input = await body(
    req,
    z.object({
      title: z.string().trim().min(1).max(300),
      status: z.enum(ISSUE_STATUSES).optional(),
      dueOn: z.iso.date().nullable().optional(),
    }),
  );
  return json({ issue: await createIssue(auth, input) }, { status: 201 });
});
