// Idempotent: upserts every compiled DocTemplate (server/src/lib/docTemplates/)
// by name, so re-running on every deploy just keeps definitions in sync
// instead of creating duplicates.
import { PrismaClient } from '@prisma/client';
import { IT0291405_TEMPLATE } from '../src/lib/docTemplates/it0291405.js';
import { IT0881503_TEMPLATE } from '../src/lib/docTemplates/it0881503.js';
import { IT0911503_TEMPLATE } from '../src/lib/docTemplates/it0911503.js';

const prisma = new PrismaClient();

const TEMPLATES = [IT0291405_TEMPLATE, IT0881503_TEMPLATE, IT0911503_TEMPLATE];

async function main() {
  for (const t of TEMPLATES) {
    const existing = await prisma.docTemplate.findFirst({ where: { name: t.name } });
    const data = { name: t.name, description: t.description, fields: t.fields, sourceDocx: t.sourceDocx };
    if (existing) {
      await prisma.docTemplate.update({ where: { id: existing.id }, data });
    } else {
      await prisma.docTemplate.create({ data });
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
