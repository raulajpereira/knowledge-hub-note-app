// One-off, idempotent cleanup for the doc-template duplication bug fixed in
// seed-doc-templates.js: before that fix, the seed matched templates by name
// instead of sourceDocx, so an admin renaming a template (e.g. appending
// "(ITGest)") caused a fresh duplicate to be re-created under the original
// name on every deploy. Safe to leave running on every deploy going forward
// — once the duplicates are gone there's nothing left to match.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const targets = await prisma.docTemplate.findMany({
    where: { name: { endsWith: '(ITGest)' } },
    include: { _count: { select: { documents: true } } },
  });

  if (targets.length === 0) {
    console.log('No duplicate "(ITGest)" templates found.');
    return;
  }

  for (const tpl of targets) {
    if (tpl._count.documents > 0) {
      console.log(`Skipping "${tpl.name}" (${tpl.id}) — still has ${tpl._count.documents} document(s) using it.`);
      continue;
    }
    await prisma.docTemplate.delete({ where: { id: tpl.id } });
    console.log(`Deleted "${tpl.name}" (${tpl.id}).`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
