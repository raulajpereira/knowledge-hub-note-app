import { z } from 'zod';

// Server-side environment, validated once on first use. Every variable is
// documented in .env.example; nothing secret ever has a default here.
const bool = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

export function isLoopback(url: string) {
  try {
    const h = new URL(url).hostname.replace(/^\[|\]$/g, '');
    return h === 'localhost' || h === '::1' || /^127\.\d+\.\d+\.\d+$/.test(h);
  } catch {
    return false;
  }
}

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url(),
  NEXT_PUBLIC_BASE_PATH: z
    .string()
    .regex(/^(\/[a-z0-9-]+)*$/, 'must be empty or like "/v2" (no trailing slash)')
    .default(''),

  // Runtime connection: the unprivileged kh_app role, so Row Level Security
  // applies. Migrations use DATABASE_ADMIN_URL (table owner) instead.
  DATABASE_URL: z.url(),
  // empty in the web and worker containers (docker-compose.yml): only `migrate` has it
  DATABASE_ADMIN_URL: z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()),
  REDIS_URL: z.url(),

  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY: z.string().min(3),
  S3_SECRET_KEY: z.string().min(8),
  S3_FORCE_PATH_STYLE: bool.default(true),

  // 32-byte hex key for app-level encryption at rest (TOTP secrets, API
  // Playground credentials). Never used for the password vault (E2E).
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, 'must be 64 hex chars (openssl rand -hex 32)'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_SECURE: bool.default(true),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  // Without SMTP, emails are written to the logs (and to this folder if set,
  // one JSON file per message — used by the E2E tests).
  MAIL_OUTBOX_DIR: z.string().optional(),
  // Send in the request instead of via the worker queue (tests).
  MAIL_DIRECT: bool.default(false),

  // Have I Been Pwned check on new passwords (k-anonymity; off in tests).
  HIBP_CHECK: bool.default(true),

  // Cloudflare Turnstile after repeated failed sign-ins (both or neither).
  TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),

  // Who runs the service (Termos / Privacidade / landing). Until LEGAL_REVIEWED
  // is true the legal pages say they are a provisional version.
  LEGAL_ENTITY_NAME: z.string().optional(),
  LEGAL_ENTITY_NIF: z.string().optional(),
  LEGAL_ENTITY_ADDRESS: z.string().optional(),
  LEGAL_CONTACT_EMAIL: z.string().optional(),
  LEGAL_UPDATED_AT: z.string().optional(),
  LEGAL_REVIEWED: bool.default(false),

  // Admin Console only from these client IPs/CIDRs (comma separated; empty = any).
  ADMIN_IP_ALLOWLIST: z.string().optional(),

  // Serves the component catalogue (/ui) in production builds too.
  KH_UI_CATALOG: bool.default(false),

  SUPERADMIN_EMAIL: z.email().optional(),
  SUPERADMIN_NAME: z.string().optional(),

  // Storage sweep only reports what it would delete (first days after a move).
  STORAGE_SWEEP_DRY_RUN: bool.default(false),

  // Tests only: every OpenAI-compatible AI call goes to this local fake.
  // Never set in production — and only a loopback address is accepted, so a
  // stray value can't send people's AI keys anywhere.
  AI_TEST_BASE_URL: z
    .url()
    .refine((u) => isLoopback(u), 'must be a loopback address (tests only)')
    .optional(),
});

/** APP_URL's path differs from the base path the app is built for (email links would break). */
export function basePathMismatch(e: { APP_URL: string; NEXT_PUBLIC_BASE_PATH: string }): string | null {
  const path = new URL(e.APP_URL).pathname.replace(/\/+$/, '');
  return path === e.NEXT_PUBLIC_BASE_PATH
    ? null
    : `APP_URL path "${path || '/'}" differs from NEXT_PUBLIC_BASE_PATH "${e.NEXT_PUBLIC_BASE_PATH || '/'}"`;
}

/** .env.example placeholders left in a production configuration (warned at start-up). */
export function placeholderVars(e: Record<string, unknown>): string[] {
  return Object.entries(e)
    .filter(([, v]) => typeof v === 'string' && /change-me/i.test(v))
    .map(([k]) => k);
}

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  // the placeholders of .env.example must not stay in production: loud warning
  // (not a refusal to start, so an old .env can't take the site down on deploy)
  const mismatch = basePathMismatch(result.data);
  if (mismatch) console.error(`[env] WARNING: ${mismatch} — email links would point elsewhere`);
  if (result.data.NODE_ENV === 'production') {
    const weak = placeholderVars(result.data);
    if (weak.length) console.error(`[env] WARNING: ${weak.join(', ')} still use a "change-me" placeholder`);
  }
  return result.data;
}

export function env(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
