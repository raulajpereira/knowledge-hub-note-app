// Identity, tenants and licensing (DATA_MODEL.md §2, adjusted by
// DECISIONS_AND_INFRA.md §7: no Stripe fields, no `hosting`, revocation keeps
// data 30 days via deleted_at). `past_due` is set by hand in the Admin Console
// (sales happen outside the app).
//
// These tables are global (not tenant content): they are read before a
// tenant is known (login by email, code redemption) and only ever touched by
// the auth / licensing services. Row Level Security protects tenant content
// tables (Phase 3+), which reference tenants.id.
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  customType,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const citext = customType<{ data: string }>({ dataType: () => 'citext' });
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v7()`);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// ── Licensing catalogue ─────────────────────────────────────────────────────
export const plans = pgTable('plans', {
  id: id(),
  code: text('code').notNull().unique(), // FREE, PRO, DEVELOPER, SAP, MANAGEMENT, ULTRA, CUSTOM
  priceMonthPerUser: numeric('price_month_per_user', { precision: 10, scale: 2 }).notNull().default('0'),
  annualDiscountPct: integer('annual_discount_pct').notNull().default(0),
  trialEnabled: boolean('trial_enabled').notNull().default(false),
  trialDays: integer('trial_days').notNull().default(30),
  isPopular: boolean('is_popular').notNull().default(false),
  color: text('color'),
  sort: integer('sort').notNull().default(0),
});

export const modules = pgTable('modules', {
  id: text('id').primaryKey(), // notes, tasks, passwords, mg_alloc, codelib, brand…
  grp: text('grp').notNull(), // base, pro, mgmt, dev, sap, feat, custom
  labelPt: text('label_pt').notNull(),
  labelEn: text('label_en').notNull(),
  addonPriceMonth: numeric('addon_price_month', { precision: 10, scale: 2 }),
  sort: integer('sort').notNull().default(0),
});

export const planModules = pgTable(
  'plan_modules',
  {
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    moduleId: text('module_id')
      .notNull()
      .references(() => modules.id),
  },
  (t) => [primaryKey({ columns: [t.planId, t.moduleId] })],
);

export const planLimits = pgTable(
  'plan_limits',
  {
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    resource: text('resource').notNull(), // notes, tasks, artifacts, whiteboards, snippets, voice
    max: integer('max').notNull(),
  },
  (t) => [primaryKey({ columns: [t.planId, t.resource] })],
);

// ── Tenants ─────────────────────────────────────────────────────────────────
export const TENANT_STATUSES = ['trial', 'active', 'past_due', 'suspended', 'canceled'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];
export const tenants = pgTable(
  'tenants',
  {
    id: id(),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['pack', 'individual'] }).notNull(),
    status: text('status', { enum: TENANT_STATUSES }).notNull().default('active'),
    planId: uuid('plan_id').references(() => plans.id),
    /** CUSTOM plan ("pacote individual"): the module groups bought (their modules go to tenant_modules) */
    addonGroups: text('addon_groups')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** the client's contact (Admin Console "Admin do cliente"), before anyone registers */
    contactName: text('contact_name'),
    contactEmail: citext('contact_email'),
    billingCycle: text('billing_cycle', { enum: ['monthly', 'annual'] })
      .notNull()
      .default('monthly'),
    seats: integer('seats').notNull().default(1),
    renewAt: timestamp('renew_at', { withTimezone: true }),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    salesNotes: text('sales_notes'), // sales are handled outside the app
    deletedAt: timestamp('deleted_at', { withTimezone: true }), // revoked: purged after 30 days
    createdAt: createdAt(),
  },
  (t) => [check('tenants_seats_positive', sql`${t.seats} > 0`)],
);

export const tenantModules = pgTable(
  'tenant_modules',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    moduleId: text('module_id')
      .notNull()
      .references(() => modules.id),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.moduleId] })],
);

// ── Users & sessions ────────────────────────────────────────────────────────
export const users = pgTable(
  'users',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: citext('email').notNull().unique(),
    // NULL until the user sets one (e.g. the seeded super admin).
    passwordHash: text('password_hash'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    roleInTenant: text('role_in_tenant', { enum: ['admin', 'member'] })
      .notNull()
      .default('member'),
    status: text('status', { enum: ['active', 'invited', 'paused', 'disabled'] })
      .notNull()
      .default('active'),
    lang: text('lang', { enum: ['pt', 'en'] })
      .notNull()
      .default('pt'),
    photoKey: text('photo_key'),
    totpSecretEnc: text('totp_secret_enc'), // AES-256-GCM with ENCRYPTION_KEY
    totpEnabledAt: timestamp('totp_enabled_at', { withTimezone: true }),
    registeredWithCodeId: uuid('registered_with_code_id'),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('users_tenant_idx').on(t.tenantId)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // SHA-256 of the cookie token; the token itself is never stored.
    tokenHash: bytea('token_hash').notNull(),
    remember: boolean('remember').notNull().default(false),
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    reauthAt: timestamp('reauth_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('sessions_token_idx').on(t.tokenHash), index('sessions_user_idx').on(t.userId)],
);

// Single-use tokens sent by email (verify email, reset password, first
// password of the seeded super admin). Only the SHA-256 hash is stored.
export const authTokens = pgTable(
  'auth_tokens',
  {
    tokenHash: bytea('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose', { enum: ['verify', 'reset', 'setup'] }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('auth_tokens_user_idx').on(t.userId, t.purpose)],
);

export const recoveryCodes = pgTable(
  'recovery_codes',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: bytea('code_hash').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (t) => [index('recovery_codes_user_idx').on(t.userId)],
);

// ── Activation codes (KH-LIC-###### / KH-INV-######) ─────────────────────────
export const codes = pgTable(
  'codes',
  {
    id: id(),
    code: text('code').notNull().unique(),
    type: text('type', { enum: ['invite', 'license'] }).notNull(),
    // Set for invites into an existing tenant, and on a license once its
    // first redemption has created the tenant.
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').references(() => plans.id),
    clientName: text('client_name'), // name for the tenant a license creates
    maxUses: integer('max_uses').notNull().default(1),
    uses: integer('uses').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }), // null = lifetime
    status: text('status', { enum: ['active', 'paused', 'revoked', 'expired'] })
      .notNull()
      .default('active'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    check('codes_format', sql`${t.code} ~ '^KH-(INV|LIC)-[0-9]{6}$'`),
    check('codes_type_prefix', sql`(${t.type} = 'invite') = (${t.code} LIKE 'KH-INV-%')`),
    check('codes_uses', sql`${t.uses} >= 0 AND ${t.maxUses} > 0`),
  ],
);

export const codeRedemptions = pgTable(
  'code_redemptions',
  {
    codeId: uuid('code_id')
      .notNull()
      .references(() => codes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.codeId, t.userId] })],
);

// ── Console admins & audit ──────────────────────────────────────────────────
export const admins = pgTable('admins', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'admin', 'billing', 'support', 'readonly'] }).notNull(),
  status: text('status', { enum: ['active', 'paused'] })
    .notNull()
    .default('active'),
  createdAt: createdAt(),
});

// Append-only (UPDATE/DELETE revoked from kh_app in the migration).
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid('actor_user_id'),
    actorKind: text('actor_kind', { enum: ['user', 'system'] })
      .notNull()
      .default('user'),
    tenantId: uuid('tenant_id'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    details: jsonb('details'),
    ip: inet('ip'),
  },
  (t) => [index('audit_at_idx').on(t.at), index('audit_tenant_idx').on(t.tenantId, t.at)],
);

export const userPrefs = pgTable('user_prefs', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  data: jsonb('data').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Images a user uploaded for their own UI (profile photo, background photo,
// brand logo). Stored in the private MinIO bucket; the app streams them back
// to their owner only. One per kind — a new upload replaces the old one.
export const userAssets = pgTable(
  'user_assets',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['avatar', 'background', 'logo'] }).notNull(),
    storageKey: text('storage_key').notNull(),
    contentType: text('content_type').notNull(),
    bytes: integer('bytes').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.kind] }),
    check('user_assets_kind_chk', sql`${t.kind} in ('avatar','background','logo')`),
    check('user_assets_type_chk', sql`${t.contentType} in ('image/png','image/jpeg','image/webp')`),
  ],
);

// ── Admin Console: plan requests and settings ───────────────────────────────
/**
 * "Pedir este plano / Pedir mudança para X" and custom packages (Pricing):
 * shown in the console's Pedidos, approved (applied to the tenant) or rejected.
 */
export const planRequests = pgTable(
  'plan_requests',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind', { enum: ['plan', 'custom'] }).notNull(),
    planId: uuid('plan_id').references(() => plans.id),
    /** custom package: module groups */
    groups: text('groups')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    seats: integer('seats').notNull().default(1),
    cycle: text('cycle', { enum: ['monthly', 'annual'] })
      .notNull()
      .default('monthly'),
    notes: text('notes').notNull().default(''),
    status: text('status', { enum: ['new', 'approved', 'rejected'] })
      .notNull()
      .default('new'),
    handledBy: uuid('handled_by').references(() => users.id, { onDelete: 'set null' }),
    handledAt: timestamp('handled_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('plan_requests_status_idx').on(t.status, t.createdAt),
    check('plan_requests_kind_chk', sql`${t.kind} in ('plan','custom')`),
    check('plan_requests_status_chk', sql`${t.status} in ('new','approved','rejected')`),
    check('plan_requests_cycle_chk', sql`${t.cycle} in ('monthly','annual')`),
    check('plan_requests_seats_chk', sql`${t.seats} between 1 and 9999`),
  ],
);

/** Console-wide settings (CUSTOM package prices per module group, its annual discount). */
export const consoleSettings = pgTable('console_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
