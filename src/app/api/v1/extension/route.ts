import { handler } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { env } from '@/lib/env';
import { extensionZip, EXTENSION_VERSION } from '@/server/extension';

/** GET /extension — the browser extension's zip, made for this server's address. */
export const GET = handler(async () => {
  await requireAuth();
  const zip = await extensionZip(env().APP_URL);
  return new Response(Buffer.from(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="knowledgehub-extension-${EXTENSION_VERSION}.zip"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
