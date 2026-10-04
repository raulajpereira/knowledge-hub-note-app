import { z } from 'zod';

// Server-side environment, validated once on first use. Every variable is
// documented in .env.example; nothing secret ever has a default here.
const bool = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

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
  DATABASE_ADMIN_URL: z.url().optional(),
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

  // Serves the component catalogue (/ui) in production builds too.
  KH_UI_CATALOG: bool.default(false),

  SUPERADMIN_EMAIL: z.email().optional(),
  SUPERADMIN_NAME: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

export function env(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
