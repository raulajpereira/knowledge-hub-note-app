import 'server-only';
import { randomUUID } from 'node:crypto';
import { asc, eq, inArray, isNull } from 'drizzle-orm';
import {
  mgAllocs,
  mgClients,
  mgPeople,
  mgProjects,
  mgRequests,
  mgSettings,
  mgTeams,
  mgTimesheets,
} from '@/db/schema';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import {
  MgSchemas,
  mgSample,
  type MgAlloc,
  type MgClient,
  type MgCollection,
  type MgData,
  type MgOpT,
  type MgExpPart,
  type MgPerson,
  type MgProject,
  type MgReq,
  type MgSettings,
  type MgTeam,
  type MgTs,
} from '@/lib/mg';
import { asUser, type Tx } from './tenant';
import { photoVersion } from './mgPhoto';

// Management data of the tenant (D40). The screen loads everything once and
// sends its changes as a batch of puts/deletes (POST /mg/ops) applied in one
// transaction; every id a record points to must exist in the tenant (checked
// after the batch, under RLS). Concurrent edits: last write wins per record.

const n = (v: string | null | undefined) => v ?? '';
const nul = (v: string) => v || null;

export async function loadMg(auth: AuthContext): Promise<MgData> {
  return asUser(auth, async (tx) => {
    const [cl, tm, pp, pj, al, ts, rq, st] = await Promise.all([
      tx.select().from(mgClients).where(isNull(mgClients.deletedAt)).orderBy(asc(mgClients.createdAt)),
      tx.select().from(mgTeams).orderBy(asc(mgTeams.createdAt)),
      tx.select().from(mgPeople).orderBy(asc(mgPeople.createdAt)),
      tx.select().from(mgProjects).orderBy(asc(mgProjects.createdAt)),
      tx.select().from(mgAllocs).orderBy(asc(mgAllocs.createdAt)),
      tx.select().from(mgTimesheets),
      tx.select().from(mgRequests).orderBy(asc(mgRequests.createdAt)),
      tx.select().from(mgSettings),
    ]);
    return {
      clients: cl.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.kind === 'internal' ? 'Interno' : 'Externo',
        sector: c.sector,
        contact: c.contact,
        email: c.email,
      })),
      teams: tm.map((t) => ({
        id: t.id,
        name: t.name,
        areas: t.areas,
        desc: t.description,
        color: t.color,
        target: t.target ?? '',
        lead: n(t.leadId),
      })),
      people: pp.map((p) => ({
        id: p.id,
        team: n(p.teamId),
        name: p.name,
        area: p.area,
        role: p.role,
        level: p.level,
        cost: p.cost,
        rate: p.rate,
        cap: p.cap,
        loc: p.loc,
        status: p.status,
        statusNote: p.statusNote,
        hired: p.hired,
        expYears: p.expYears ?? '',
        expSplit: (p.expSplit as MgExpPart[]) ?? [],
        email: p.email,
        phone: p.phone,
        av: p.av,
        photo: photoVersion(p.photoKey),
        skills: p.skills as Record<string, number>,
      })),
      projects: pj.map((p) => ({
        id: p.id,
        team: n(p.teamId),
        code: p.code,
        name: p.name,
        client: n(p.clientId),
        budget: p.budget,
        from: p.fromDate,
        to: p.toDate,
        color: p.color,
        status: p.status,
        manager: n(p.managerId),
        phases: p.phases as MgProject['phases'],
      })),
      allocs: al.map((a) => ({
        id: a.id,
        person: a.personId,
        project: a.projectId,
        from: a.fromDate,
        to: a.toDate,
        hours: a.hours,
        ...(a.extra as Partial<MgAlloc>),
      })),
      ts: ts.map((t) => ({
        id: t.id,
        person: t.personId,
        week: t.week,
        status: t.status as MgTs['status'],
        rows: t.rows as MgTs['rows'],
      })),
      reqs: rq.map((r) => ({
        id: r.id,
        team: n(r.teamId),
        project: n(r.projectId),
        skills: r.skills as MgReq['skills'],
        hours: r.hours ?? '',
        maxCost: r.maxCost ?? '',
        from: r.fromDate,
        to: r.toDate,
        status: r.status,
        assigned: n(r.assignedId),
        note: r.note,
      })),
      settings: (st[0]?.data ?? {}) as MgSettings,
    };
  });
}

const TABLES = {
  clients: mgClients,
  teams: mgTeams,
  people: mgPeople,
  projects: mgProjects,
  allocs: mgAllocs,
  ts: mgTimesheets,
  reqs: mgRequests,
} as const;

/** Client shape → row (without tenant), and the ids it refers to. */
function toRow(c: MgCollection, v: unknown) {
  const now = new Date();
  const refs: Array<[MgCollection, string]> = [];
  const r = (t: MgCollection, id: string) => {
    if (id) refs.push([t, id]);
    return nul(id);
  };
  switch (c) {
    case 'clients': {
      const x = v as MgClient;
      return {
        refs,
        row: {
          id: x.id,
          name: x.name,
          kind: x.type === 'Interno' ? 'internal' : 'external',
          sector: x.sector,
          contact: x.contact,
          email: x.email,
          updatedAt: now,
        },
      };
    }
    case 'teams': {
      const x = v as MgTeam;
      return {
        refs,
        row: {
          id: x.id,
          name: x.name,
          areas: x.areas,
          description: x.desc,
          color: x.color,
          target: x.target === '' ? null : x.target,
          leadId: r('people', x.lead),
          updatedAt: now,
        },
      };
    }
    case 'people': {
      const x = v as MgPerson;
      // the photo is never written through ops (only its own route)
      const { id, team, expYears, photo: _photo, ...rest } = x;
      return {
        refs,
        row: {
          id,
          teamId: r('teams', team),
          ...rest,
          expYears: expYears === '' ? null : expYears,
          updatedAt: now,
        },
      };
    }
    case 'projects': {
      const x = v as MgProject;
      return {
        refs,
        row: {
          id: x.id,
          teamId: r('teams', x.team),
          code: x.code,
          name: x.name,
          clientId: r('clients', x.client),
          budget: x.budget,
          fromDate: x.from,
          toDate: x.to,
          color: x.color,
          status: x.status,
          managerId: r('people', x.manager),
          phases: x.phases,
          updatedAt: now,
        },
      };
    }
    case 'allocs': {
      const { id, person, project, from, to, hours, ...extra } = v as MgAlloc;
      r('people', person);
      r('projects', project);
      return {
        refs,
        row: {
          id,
          personId: person,
          projectId: project,
          fromDate: from,
          toDate: to,
          hours,
          extra,
          updatedAt: now,
        },
      };
    }
    case 'ts': {
      const x = v as MgTs;
      r('people', x.person);
      for (const p of Object.keys(x.rows)) r('projects', p);
      return {
        refs,
        row: { id: x.id, personId: x.person, week: x.week, status: x.status, rows: x.rows, updatedAt: now },
      };
    }
    case 'reqs': {
      const x = v as MgReq;
      return {
        refs,
        row: {
          id: x.id,
          teamId: r('teams', x.team),
          projectId: r('projects', x.project),
          skills: x.skills,
          hours: x.hours === '' ? null : x.hours,
          maxCost: x.maxCost === '' ? null : x.maxCost,
          fromDate: x.from,
          toDate: x.to,
          status: x.status,
          assignedId: r('people', x.assigned),
          note: x.note,
          updatedAt: now,
        },
      };
    }
  }
}

async function applyTx(tx: Tx, tenantId: string, ops: MgOpT[]) {
  const refs = new Map<MgCollection, Set<string>>();
  for (const o of ops) {
    if (o.op === 'del') {
      const t = TABLES[o.c];
      await tx.delete(t).where(eq(t.id, o.id));
      continue;
    }
    const parsed = MgSchemas[o.c].safeParse(o.v);
    if (!parsed.success) throw new ApiError(400, 'invalid_input', `invalid ${o.c}`);
    if (o.c === 'settings') {
      await tx
        .insert(mgSettings)
        .values({ tenantId, data: parsed.data })
        .onConflictDoUpdate({
          target: mgSettings.tenantId,
          set: { data: parsed.data, updatedAt: new Date() },
        });
      continue;
    }
    const { row, refs: rr } = toRow(o.c, parsed.data);
    for (const [t, id] of rr) {
      if (!refs.has(t)) refs.set(t, new Set());
      refs.get(t)!.add(id);
    }
    const t = TABLES[o.c] as typeof mgTeams;
    const { id: _id, ...set } = row as typeof mgTeams.$inferInsert;
    await tx
      .insert(t)
      .values({ ...(row as typeof mgTeams.$inferInsert), tenantId })
      .onConflictDoUpdate({ target: t.id, set });
  }
  // every id a record points to must be a row of this tenant (RLS hides the others)
  for (const [c, ids] of refs) {
    const t = TABLES[c] as typeof mgTeams;
    const list = [...ids];
    const found = await tx.select({ id: t.id }).from(t).where(inArray(t.id, list));
    if (found.length !== list.length) throw new ApiError(400, 'invalid_reference', `unknown ${c}`);
  }
}

export async function applyMgOps(auth: AuthContext, ops: MgOpT[]) {
  await asUser(auth, (tx) => applyTx(tx, auth.tenant.id, ops));
}

/** "Repor Dados": people, teams, projects, allocations, timesheets and requests become the sample; clients are added by name. */
export async function resetMgSample(auth: AuthContext) {
  const s = mgSample(randomUUID);
  await asUser(auth, async (tx) => {
    for (const t of [mgRequests, mgTimesheets, mgAllocs, mgProjects, mgPeople, mgTeams]) await tx.delete(t);
    await tx.delete(mgSettings);
    // keep existing clients (systems and transport requests point at them); reuse them by name
    const have = await tx
      .select({ id: mgClients.id, name: mgClients.name })
      .from(mgClients)
      .where(isNull(mgClients.deletedAt));
    const byName = new Map(have.map((c) => [c.name, c.id]));
    const remap = new Map<string, string>();
    const clients = s.clients.filter((c) => {
      const old = byName.get(c.name);
      if (old) remap.set(c.id, old);
      return !old;
    });
    for (const p of s.projects) p.client = remap.get(p.client) ?? p.client;
    const ops: MgOpT[] = [
      ...clients.map((v) => ({ op: 'put' as const, c: 'clients' as const, v })),
      ...s.teams.map((v) => ({ op: 'put' as const, c: 'teams' as const, v: { ...v, lead: '' } })),
      ...s.people.map((v) => ({ op: 'put' as const, c: 'people' as const, v })),
      ...s.teams.map((v) => ({ op: 'put' as const, c: 'teams' as const, v })),
      ...s.projects.map((v) => ({ op: 'put' as const, c: 'projects' as const, v })),
      ...s.allocs.map((v) => ({ op: 'put' as const, c: 'allocs' as const, v })),
      ...s.ts.map((v) => ({ op: 'put' as const, c: 'ts' as const, v })),
      ...s.reqs.map((v) => ({ op: 'put' as const, c: 'reqs' as const, v })),
    ];
    await applyTx(tx, auth.tenant.id, ops);
  });
}

/** A project id given by another screen (task, issue, transport) must be one of the tenant's projects. */
export async function checkProject(tx: Tx, id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const [r] = await tx.select({ id: mgProjects.id }).from(mgProjects).where(eq(mgProjects.id, id));
  if (!r) throw new ApiError(400, 'invalid_reference', 'unknown project');
  return r.id;
}

export type MgOptions = {
  projects: Array<{ id: string; code: string; name: string; color: string; client: string }>;
  people: Array<{ id: string; name: string }>;
};

/** Projects and people for the selects of other screens (tasks, issues, transports, functional). */
export async function mgOptions(auth: AuthContext): Promise<MgOptions> {
  return asUser(auth, async (tx) => {
    const [projects, people] = await Promise.all([
      tx
        .select({
          id: mgProjects.id,
          code: mgProjects.code,
          name: mgProjects.name,
          color: mgProjects.color,
          client: mgProjects.clientId,
        })
        .from(mgProjects)
        .orderBy(asc(mgProjects.code)),
      tx.select({ id: mgPeople.id, name: mgPeople.name }).from(mgPeople).orderBy(asc(mgPeople.name)),
    ]);
    return { projects: projects.map((p) => ({ ...p, client: n(p.client) })), people };
  });
}
