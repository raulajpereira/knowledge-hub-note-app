import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { MG_MODULES, requireAnyContent, requireContent } from '@/server/content/guard';
import { listTemplates, saveTemplate } from '@/server/content/templates';
import { TPL_KINDS, tplModule, type TplKind } from '@/lib/templates';

const Kind = z.enum(TPL_KINDS);
const TplCreate = z.object({
  kind: Kind,
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[^\r\n]*$/),
  body: z.unknown(),
});
/** A template fills the data of one module: the person needs that module (Projetos: any Management page). */
const gate = (kind: TplKind) =>
  kind === 'project' ? requireAnyContent(MG_MODULES) : requireContent(tplModule(kind));

/** GET /templates?kind= — the caller's own templates of that kind · POST saves one. */
export const GET = handler(async (req) => {
  const kind = Kind.parse(new URL(req.url).searchParams.get('kind'));
  const auth = await gate(kind);
  return json({ templates: await listTemplates(auth, kind) });
});

export const POST = handler(async (req) => {
  const input = await body(req, TplCreate);
  const auth = await gate(input.kind);
  return json({ template: await saveTemplate(auth, input) }, { status: 201 });
});
