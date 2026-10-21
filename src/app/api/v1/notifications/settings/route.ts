import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { NotifyPrefs } from '@/lib/notify';
import { getNotifySettings, updateNotifySettings } from '@/server/notify/service';

/** GET|PUT /notifications/settings — Definições › Notificações (prefs, time zone, inbound email). */
export const GET = handler(async () => {
  const auth = await requireAuth();
  return json({ settings: await getNotifySettings(auth) });
});

export const PUT = handler(async (req) => {
  const auth = await requireAuth();
  const patch = await body(
    req,
    z.object({
      prefs: NotifyPrefs.partial().optional(),
      tz: z.string().max(64).optional(),
      inbound: z
        .object({
          enabled: z.boolean(),
          target: z.enum(['note', 'task', 'email']),
          folderId: z.uuid().nullable(),
          emailFolderId: z.uuid().nullable(),
          taskType: z.enum(['tech', 'mgmt']),
          senders: z
            .array(
              z.union([
                z.email().max(254),
                z
                  .string()
                  .regex(/^@[a-z0-9.-]+\.[a-z]{2,}$/i)
                  .max(254),
              ]),
            )
            .max(20),
        })
        .partial()
        .optional(),
    }),
  );
  return json({ settings: await updateNotifySettings(auth, patch) });
});
