// Idempotent backfill: gives every existing user who has zero SAP
// transactions the default starter catalog. Safe to run on every deploy —
// users who already have entries (default or their own) are left untouched.
import { PrismaClient } from '@prisma/client';
import { DEFAULT_TRANSACTIONS } from '../src/lib/defaultTransactions.js';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ select: { id: true } });
  let seeded = 0;
  for (const user of users) {
    const count = await prisma.sapTransaction.count({ where: { userId: user.id } });
    if (count > 0) continue;
    await prisma.sapTransaction.createMany({
      data: DEFAULT_TRANSACTIONS.map((t) => ({ ...t, userId: user.id })),
    });
    seeded += 1;
  }
  console.log(`Seeded default SAP transactions for ${seeded} user(s) (${users.length} total).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
