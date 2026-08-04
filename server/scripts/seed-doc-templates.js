// Idempotent: upserts every compiled DocTemplate (server/src/lib/docTemplates/)
// by sourceDocx (a stable per-template path, unlike name which admins can
// rename in Settings — matching on name would treat a renamed template as
// missing and re-create a duplicate under its original name on every deploy).
import { PrismaClient } from '@prisma/client';
import { IT0291405_TEMPLATE } from '../src/lib/docTemplates/it0291405.js';
import { IT0881503_TEMPLATE } from '../src/lib/docTemplates/it0881503.js';
import { IT0911503_TEMPLATE } from '../src/lib/docTemplates/it0911503.js';

const prisma = new PrismaClient();

const TEMPLATES = [IT0291405_TEMPLATE, IT0881503_TEMPLATE, IT0911503_TEMPLATE];

async function main() {
  for (const t of TEMPLATES) {
    const existing = await prisma.docTemplate.findFirst({ where: { sourceDocx: t.sourceDocx } });
    if (existing) {
      // Admin-managed fields (name/description) are intentionally left alone
      // once the template exists — only the schema/source sync from code.
      await prisma.docTemplate.update({ where: { id: existing.id }, data: { fields: t.fields, sourceDocx: t.sourceDocx } });
    } else {
      await prisma.docTemplate.create({ data: { name: t.name, description: t.description, fields: t.fields, sourceDocx: t.sourceDocx } });
    }
  }
  console.log(`Synced ${TEMPLATES.length} doc template(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
