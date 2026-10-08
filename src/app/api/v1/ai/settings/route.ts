import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { AI_PROVIDER_IDS } from '@/lib/ai';
import { aiStatus, deleteAiSettings, saveAiSettings } from '@/server/ai/settings';

/** GET /ai/settings — the caller's provider, model and the key's last 4 characters (never the key). */
export const GET = handler(async () => {
  const auth = await requireContent('ai');
  return json({ ai: await aiStatus(auth) });
});

/** PUT /ai/settings { provider, apiKey?, model, enabled } — a new key is checked with the provider first. */
export const PUT = handler(async (req) => {
  const auth = await requireContent('ai');
  const input = await body(
    req,
    z
      .object({
        provider: z.enum(AI_PROVIDER_IDS),
        apiKey: z.string().trim().min(8).max(400).optional(),
        model: z.string().trim().min(1).max(200),
        enabled: z.boolean(),
      })
      .strict(),
  );
  return json({ ai: await saveAiSettings(auth, input) });
});

/** DELETE /ai/settings — removes the key. */
export const DELETE = handler(async () => {
  const auth = await requireContent('ai');
  await deleteAiSettings(auth);
  return json({ ok: true });
});
