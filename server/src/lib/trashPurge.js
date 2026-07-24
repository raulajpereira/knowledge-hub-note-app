import { prisma } from './prisma.js';

export async function purgeExpiredTrash() {
  const settingsList = await prisma.settings.findMany({
    where: { trashRetentionDays: { gt: 0 } },
    select: { userId: true, trashRetentionDays: true },
  });

  for (const { userId, trashRetentionDays } of settingsList) {
    const threshold = new Date(Date.now() - trashRetentionDays * 24 * 60 * 60 * 1000);
    await Promise.all([
      prisma.note.deleteMany({ where: { userId, deletedAt: { lt: threshold } } }),
      prisma.task.deleteMany({ where: { userId, deletedAt: { lt: threshold } } }),
      prisma.voiceNote.deleteMany({ where: { userId, deletedAt: { lt: threshold } } }),
    ]);
  }
}
