import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { issues, ISSUE_PRIORITIES, ISSUE_STATUSES } from '@/db/schema';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { checkProject } from './mg';
import { asUser } from './tenant';

// Project issues (prototype isIssues): one table, two views (table / Kanban).

export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];
export type Issue = {
  id: string;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  projectId: string | null;
  dueOn: string | null;
  waiting: string;
  description: string;
  notes: string;
  doneAt: string | null;
  createdAt: string;
};

const cols = {
  id: issues.id,
  title: issues.title,
  status: issues.status,
  priority: issues.priority,
  projectId: issues.projectId,
  dueOn: issues.dueOn,
  waiting: issues.waiting,
  description: issues.description,
  notes: issues.notes,
  doneAt: issues.doneAt,
  createdAt: issues.createdAt,
};
type Row = Omit<Issue, 'doneAt' | 'createdAt'> & { doneAt: Date | null; createdAt: Date };
const toIssue = (r: Row): Issue => ({
  ...r,
  doneAt: r.doneAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
});

export async function listIssues(auth: AuthContext): Promise<Issue[]> {
  return asUser(auth, async (tx) => {
    const rows = await tx
      .select(cols)
      .from(issues)
      .where(isNull(issues.deletedAt))
      .orderBy(desc(issues.createdAt))
      .limit(5000);
    return rows.map(toIssue);
  });
}

export async function createIssue(
  auth: AuthContext,
  input: { title: string; status?: IssueStatus; dueOn?: string | null },
): Promise<Issue> {
  return asUser(auth, async (tx) => {
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(issues)
      .where(isNull(issues.deletedAt))) as [{ n: number }];
    if (n >= 5000) throw new ApiError(400, 'too_many_items');
    const status = input.status ?? 'open';
    const [r] = await tx
      .insert(issues)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        title: input.title,
        status,
        dueOn: input.dueOn ?? null,
        doneAt: status === 'done' ? new Date() : null,
      })
      .returning(cols);
    return toIssue(r!);
  });
}

export type IssuePatch = Partial<{
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  projectId: string | null;
  dueOn: string | null;
  waiting: string;
  description: string;
  notes: string;
}>;

export async function updateIssue(auth: AuthContext, id: string, patch: IssuePatch): Promise<Issue> {
  return asUser(auth, async (tx) => {
    if (patch.projectId !== undefined)
      patch = { ...patch, projectId: await checkProject(tx, patch.projectId) };
    const [r] = await tx
      .update(issues)
      .set({
        ...patch,
        // the completion date is kept while it stays done, cleared when reopened
        ...(patch.status
          ? { doneAt: patch.status === 'done' ? sql`coalesce(${issues.doneAt}, now())` : null }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(issues.id, id), isNull(issues.deletedAt)))
      .returning(cols);
    if (!r) throw new ApiError(404, 'not_found');
    return toIssue(r);
  });
}

export async function trashIssue(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(issues)
      .set({ deletedAt: new Date() })
      .where(and(eq(issues.id, id), isNull(issues.deletedAt)))
      .returning({ id: issues.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}
