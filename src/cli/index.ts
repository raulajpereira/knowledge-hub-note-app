// Operator CLI until the Admin Console exists (Phase 10). On the VPS:
//   docker compose run --rm migrate node dist/cli.mjs <command> [--flags]
//
//   codes:create --type license|invite [--plan PRO] [--seats 5]
//                [--expires 2027-12-31] [--client "Empresa X"] [--tenant <uuid>]
//   codes:list [--all]
//   codes:pause|codes:resume|codes:revoke|codes:restore <KH-…-######>
//   users:list
//   superadmin:resend-setup
import { desc, eq, isNull } from 'drizzle-orm';
import { db, sqlClient } from '@/db/client';
import { codes, plans, tenants, users } from '@/db/schema';
import { env } from '@/lib/env';
import { createCode, pauseCode, restoreCode, resumeCode, revokeCode } from '@/server/licensing/codes';
import { sendSetupLink } from '@/server/auth/service';
import { normalizeCode } from '@/server/licensing/codeFormat';

function flags(argv: string[]) {
  const out: Record<string, string | true> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[a.slice(2)] = next;
        i++;
      } else out[a.slice(2)] = true;
    } else rest.push(a);
  }
  return { f: out, rest };
}

const str = (v: string | true | undefined) => (typeof v === 'string' ? v : undefined);

async function main() {
  env();
  const [cmd, ...args] = process.argv.slice(2);
  const { f, rest } = flags(args);
  switch (cmd) {
    case 'codes:create': {
      const type = str(f.type);
      if (type !== 'license' && type !== 'invite') throw new Error('--type license|invite is required');
      const expires = str(f.expires);
      const c = await createCode({
        type,
        planCode: str(f.plan)?.toUpperCase() ?? (type === 'license' ? 'PRO' : undefined),
        maxUses: Number(str(f.seats) ?? 1),
        expiresAt: expires ? new Date(`${expires}T23:59:59Z`) : null,
        clientName: str(f.client) ?? null,
        tenantId: str(f.tenant) ?? null,
      });
      console.log(
        `\n  ${c.code}   (${c.type}, ${c.maxUses} lugar(es), ${c.expiresAt ? `expira ${c.expiresAt.toISOString().slice(0, 10)}` : 'vitalício'})\n`,
      );
      break;
    }
    case 'codes:list': {
      const rows = await db()
        .select({
          code: codes.code,
          type: codes.type,
          status: codes.status,
          uses: codes.uses,
          max: codes.maxUses,
          plan: plans.code,
          expires: codes.expiresAt,
          client: codes.clientName,
        })
        .from(codes)
        .leftJoin(plans, eq(plans.id, codes.planId))
        .orderBy(desc(codes.createdAt));
      console.table(
        rows
          .filter((r) => f.all || r.status !== 'revoked')
          .map((r) => ({ ...r, expires: r.expires?.toISOString().slice(0, 10) ?? '—' })),
      );
      break;
    }
    case 'codes:pause':
    case 'codes:resume':
    case 'codes:revoke':
    case 'codes:restore': {
      const code = normalizeCode(rest[0] ?? '');
      const fn = {
        'codes:pause': pauseCode,
        'codes:resume': resumeCode,
        'codes:revoke': revokeCode,
        'codes:restore': restoreCode,
      }[cmd];
      await fn(code, null);
      console.log(`${cmd.split(':')[1]}: ${code} ✓`);
      break;
    }
    case 'users:list': {
      const rows = await db()
        .select({
          email: users.email,
          name: users.name,
          role: users.roleInTenant,
          status: users.status,
          verified: users.emailVerifiedAt,
          tenant: tenants.name,
          plan: plans.code,
        })
        .from(users)
        .innerJoin(tenants, eq(tenants.id, users.tenantId))
        .leftJoin(plans, eq(plans.id, tenants.planId))
        .where(isNull(tenants.deletedAt));
      console.table(rows.map((r) => ({ ...r, verified: r.verified ? 'sim' : 'não' })));
      break;
    }
    case 'superadmin:resend-setup': {
      const email = env().SUPERADMIN_EMAIL?.toLowerCase();
      const [u] = email ? await db().select().from(users).where(eq(users.email, email)).limit(1) : [];
      if (!u) throw new Error('Super admin not found (SUPERADMIN_EMAIL / seed)');
      await sendSetupLink(u.id, u.email, u.lang);
      console.log(`Setup link sent to ${u.email} (see worker logs while SMTP isn't configured).`);
      break;
    }
    default:
      console.log(
        'Commands: codes:create, codes:list, codes:pause, codes:resume, codes:revoke, codes:restore, users:list, superadmin:resend-setup',
      );
  }
}

main()
  .then(() => sqlClient().end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
