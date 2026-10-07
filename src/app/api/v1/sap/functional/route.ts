import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { listClients } from '@/server/content/sap';
import { createRecord, listRecords } from '@/server/content/functional';
import { mgOptions } from '@/server/content/mg';
import { FnCreate, FnPageParam } from '../schemas';

/**
 * GET /sap/functional?page=fn_proc|fn_test|fn_mig|fn_cut — the page's records
 * and the options of its selects (clients; projects and people arrive with
 * the Management, Phase 8). Each page is its own module.
 */
export const GET = handler(async (req) => {
  const page = FnPageParam.parse(new URL(req.url).searchParams.get('page'));
  const auth = await requireContent(page);
  const [records, clients, mg] = await Promise.all([
    listRecords(auth, page),
    listClients(auth),
    mgOptions(auth),
  ]);
  return json({ records, clients, projects: mg.projects, people: mg.people });
});

export const POST = handler(async (req) => {
  const { page, title, f } = await body(req, FnCreate);
  const auth = await requireContent(page);
  return json({ record: await createRecord(auth, page, { title, f }) }, { status: 201 });
});
