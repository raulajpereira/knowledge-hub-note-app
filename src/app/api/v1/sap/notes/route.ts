import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { listSystems } from '@/server/content/sap';
import { listTransports } from '@/server/content/transports';
import { mgOptions } from '@/server/content/mg';
import { createSapNote, listSapNotes, usedComponents } from '@/server/content/sapNotes';
import { getEntitlements } from '@/server/licensing/entitlements';
import { SapNoteFields } from '@/lib/sapNotes';

/**
 * GET /sap/notes — the tenant's SAP notes with their status per system, plus
 * what the screen picks from: systems, transports (with the transports
 * module), projects and the application components already used.
 */
export const GET = handler(async () => {
  const auth = await requireContent('sapnotes');
  const { modules } = await getEntitlements(auth.tenant.id);
  const [notes, systems, transports, mg, components] = await Promise.all([
    listSapNotes(auth),
    listSystems(auth),
    modules.includes('transports') ? listTransports(auth) : Promise.resolve([]),
    mgOptions(auth),
    usedComponents(auth),
  ]);
  return json({
    notes,
    systems: systems.map(({ id, name, sid, env, clientId, mandt, track }) => ({
      id,
      name,
      sid,
      env,
      clientId,
      mandt,
      track,
    })),
    transports: transports.map((x) => ({
      id: x.id,
      trkorr: x.trkorr,
      description: x.description,
      systemId: x.systemId,
      releasedAt: x.releasedAt,
      qasAt: x.qasAt,
      prdAt: x.prdAt,
      junkAt: x.junkAt,
    })),
    projects: mg.projects,
    components,
  });
});

const Create = SapNoteFields.partial().required({ number: true });
export const POST = handler(async (req) => {
  const auth = await requireContent('sapnotes');
  return json({ note: await createSapNote(auth, await body(req, Create)) }, { status: 201 });
});
