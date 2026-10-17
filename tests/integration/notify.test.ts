import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// Notification centre + "Email para a app" through the real services, as
// kh_app under RLS: the generator job, dedupe, mark read, settings, share
// acceptance, emails, and inbound messages from a fake mailbox.
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && appUrl);
const outbox = process.env.MAIL_OUTBOX_DIR!;
const meta = { ip: '203.0.113.9', userAgent: 'vitest', lang: 'pt' as const };
// the inbound mailbox is "configured" for this file (nothing connects to it: the tests use a fake)
process.env.INBOUND_IMAP_HOST = 'imap.invalid';
process.env.INBOUND_IMAP_USER = 'entrada@kh.test';
process.env.INBOUND_IMAP_PASSWORD = 'not-a-real-password';
process.env.INBOUND_ADDRESS = 'entrada@kh.test';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function eml(o: {
  to: string;
  from: string;
  subject: string;
  text: string;
  id: string;
  auth?: string;
  image?: boolean;
}) {
  const head = [
    ...(o.auth ? [`Authentication-Results: mx.kh.test; ${o.auth}`] : []),
    `From: Remetente <${o.from}>`,
    `To: ${o.to}`,
    `Subject: ${o.subject}`,
    `Message-ID: <${o.id}@test>`,
    'Date: Fri, 16 Oct 2026 10:00:00 +0000',
    'MIME-Version: 1.0',
  ];
  if (!o.image)
    return Buffer.from([...head, 'Content-Type: text/plain; charset=utf-8', '', o.text, ''].join('\r\n'));
  return Buffer.from(
    [
      ...head,
      'Content-Type: multipart/mixed; boundary="b1"',
      '',
      '--b1',
      'Content-Type: text/plain; charset=utf-8',
      '',
      o.text,
      '--b1',
      'Content-Type: image/png; name="ecra.png"',
      'Content-Disposition: attachment; filename="ecra.png"',
      'Content-Transfer-Encoding: base64',
      '',
      PNG.toString('base64'),
      '--b1',
      'Content-Type: application/pdf; name="fatura.pdf"',
      'Content-Disposition: attachment; filename="fatura.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from('%PDF-1.4 x').toString('base64'),
      '--b1--',
      '',
    ].join('\r\n'),
  );
}

describe.skipIf(!enabled)('notifications', () => {
  let svc: typeof import('@/server/auth/service');
  let codesSvc: typeof import('@/server/licensing/codes');
  let session: typeof import('@/server/auth/session');
  let seed: typeof import('@/db/seed/index');
  let tasksSvc: typeof import('@/server/content/tasks');
  let notesSvc: typeof import('@/server/content/notes');
  let meet: typeof import('@/server/content/meetings');
  let sh: typeof import('@/server/share/folders');
  let ns: typeof import('@/server/notify/service');
  let gen: typeof import('@/server/notify/generate');
  let inbound: typeof import('@/server/inbound/process');
  let lib: typeof import('@/lib/notify');
  let dbm: typeof import('@/db/client');
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [svc, codesSvc, session, seed, tasksSvc, notesSvc, meet, sh, ns, gen, inbound, lib, dbm] =
      await Promise.all([
        import('@/server/auth/service'),
        import('@/server/licensing/codes'),
        import('@/server/auth/session'),
        import('@/db/seed/index'),
        import('@/server/content/tasks'),
        import('@/server/content/notes'),
        import('@/server/content/meetings'),
        import('@/server/share/folders'),
        import('@/server/notify/service'),
        import('@/server/notify/generate'),
        import('@/server/inbound/process'),
        import('@/lib/notify'),
        import('@/db/client'),
      ]);
  });

  beforeEach(async () => {
    await admin.unsafe(
      'TRUNCATE notifications, notify_settings, share_members, share_people, shared_folders, meetings, task_subtasks, tasks, note_attachments, notes, folders, code_redemptions, auth_tokens, sessions, user_prefs, users, codes, tenant_modules, tenants, plan_limits, plan_modules, plans, modules RESTART IDENTITY CASCADE',
    );
    await fs.rm(outbox, { recursive: true, force: true });
    const { redis } = await import('@/lib/redis');
    const keys = await redis().keys('kh:*');
    if (keys.length) await redis().del(...keys);
    await seed.seedCatalogue();
  });

  afterAll(async () => {
    await admin?.end();
    await dbm?.sqlClient().end();
    const { redis } = await import('@/lib/redis');
    redis().disconnect();
  });

  async function signedIn(email: string, password = 'Correct-Horse-9') {
    const c = await codesSvc.createCode({ type: 'license', planCode: 'PRO', maxUses: 1 });
    await svc.register({ name: email.split('@')[0]!, email, password, code: c.code }, meta);
    const safe = email.replace(/[^a-z0-9@.]/gi, '_');
    const files = (await fs.readdir(outbox)).filter((f) => f.includes('-verify-') && f.includes(safe));
    const mail = JSON.parse(await fs.readFile(path.join(outbox, files.at(-1)!), 'utf8')) as { text: string };
    await svc.verifyEmail(/token=([A-Za-z0-9_-]+)/.exec(mail.text)![1]!);
    const a = await svc.login({ email, password, remember: true }, meta);
    if (!('token' in a)) throw new Error('2FA not expected');
    return (await session.resolveSession(a.token))!;
  }
  const mails = async (kind: string) =>
    (await fs.readdir(outbox).catch(() => [] as string[])).filter((f) => f.includes(`-${kind}-`));
  const kinds = async (a: Awaited<ReturnType<typeof signedIn>>) =>
    (await ns.listNotifications(a)).items.map((n) => n.kind).sort();

  const tz = 'Europe/Lisbon';
  const dayOf = (d: Date) => lib.localParts(d, tz).day;
  const shift = (day: string, n: number) =>
    new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

  it('the job writes due, overdue, reminder, meeting and invite notifications once, per person', async () => {
    const ana = await signedIn('ana@notify.pt');
    const rui = await signedIn('rui@notify.pt');
    const day = dayOf(new Date());
    const now = lib.zonedInstant(day, '10:00', tz);

    const due = await tasksSvc.createTask(ana, { title: 'Fechar SM37', dueOn: day });
    const late = await tasksSvc.createTask(ana, { title: 'Relatório', dueOn: shift(day, -2) });
    const done = await tasksSvc.createTask(ana, { title: 'Feita', dueOn: day });
    await tasksSvc.updateTask(ana, done.id, { done: true });
    const rem = await tasksSvc.createTask(ana, { title: 'Ligar ao cliente' });
    await tasksSvc.updateTask(ana, rem.id, {
      remind: 'custom',
      remindAt: new Date(now.getTime() - 5 * 60_000).toISOString(),
    });
    // a custom reminder needs its time
    const noTime = await tasksSvc.createTask(ana, { title: 'x' });
    await expect(tasksSvc.updateTask(ana, noTime.id, { remind: 'custom' })).rejects.toMatchObject({
      code: 'remind_at_required',
    });
    await meet.createMeeting(ana, { title: 'Daily', heldOn: day, startTime: '10:10' });
    await meet.createMeeting(ana, { title: 'Steering', heldOn: day, startTime: '16:00' });
    const sf = await sh.createSharedFolder(rui, { kind: 'tasks', name: 'Projeto Atlas' });
    await sh.addMember(rui, sf, 'ana@notify.pt', { lang: 'pt' });

    const r1 = await gen.runNotify(now);
    expect(r1.failed).toBe(0);
    expect(await kinds(ana)).toEqual([
      'meeting',
      'share_invite',
      'task_due',
      'task_overdue',
      'task_reminder',
    ]);
    const list = await ns.listNotifications(ana);
    expect(list.unread).toBe(5);
    expect(list.items.find((n) => n.kind === 'task_due')).toMatchObject({ itemType: 'task', itemId: due.id });
    expect(list.items.find((n) => n.kind === 'task_overdue')?.itemId).toBe(late.id);
    expect(list.items.find((n) => n.kind === 'meeting')?.title).toBe('Daily');
    expect(list.items.find((n) => n.kind === 'share_invite')).toMatchObject({
      title: 'Projeto Atlas',
      meta: { who: 'rui' },
    });

    // again (a restart, a second worker): nothing new
    await gen.runNotify(now);
    await Promise.all([gen.runNotify(now), gen.runNotify(now)]);
    expect((await ns.listNotifications(ana)).items).toHaveLength(5);
    // Rui sees none of it (RLS)
    expect((await ns.listNotifications(rui)).items).toEqual([]);
    expect(await ns.markRead(rui, { all: true })).toBe(0);
    expect((await ns.listNotifications(ana)).unread).toBe(5);

    // mark one, then all
    expect(await ns.markRead(ana, { ids: [list.items[0]!.id] })).toBe(4);
    expect(await ns.markRead(ana, { all: true })).toBe(0);

    // the next day: the overdue ones again (once a day), the due one is now overdue
    const tomorrow = lib.zonedInstant(shift(day, 1), '10:00', tz);
    await gen.runNotify(tomorrow);
    const next = (await ns.listNotifications(ana)).items.filter((n) => !n.readAt).map((n) => n.title);
    expect(next.sort()).toEqual(['Fechar SM37', 'Relatório']);

    // retention: read ones after 30 days, all after 90
    await admin.unsafe(
      `update notifications set read_at = now() - interval '31 days' where title = 'Daily';
       update notifications set created_at = now() - interval '91 days', read_at = null where title = 'Projeto Atlas'`,
    );
    expect(await gen.pruneNotifications()).toBe(2);
    expect((await ns.listNotifications(ana)).items.map((n) => n.title)).not.toContain('Daily');

    // turned off: no more of that kind
    await ns.updateNotifySettings(ana, { prefs: { taskOverdue: false } });
    await gen.runNotify(lib.zonedInstant(shift(day, 2), '10:00', tz));
    // (the invitation, still pending, comes back after its notification was pruned)
    expect((await ns.listNotifications(ana)).items.filter((n) => !n.readAt).map((n) => n.kind)).toEqual([
      'share_invite',
      'task_overdue',
      'task_overdue',
    ]);
  });

  it('accepting an invitation tells the owner; reminders and the daily summary go by email', async () => {
    const ana = await signedIn('ana@mail.pt');
    const rui = await signedIn('rui@mail.pt');
    const sf = await sh.createSharedFolder(rui, { kind: 'tasks', name: 'Equipa' });
    await sh.addMember(rui, sf, 'ana@mail.pt', { lang: 'pt' });
    const inv = (await sh.listInvites(ana)).find((i) => i.folderId === sf)!;
    await sh.answerInvite(ana, inv.id, true);
    expect((await ns.listNotifications(rui)).items).toMatchObject([
      { kind: 'share_accepted', title: 'Equipa', meta: { who: 'ana' } },
    ]);

    const day = dayOf(new Date());
    const now = lib.zonedInstant(day, '08:05', tz);
    await ns.updateNotifySettings(ana, {
      tz,
      prefs: { email: true, summary: true, summaryTime: '08:00' },
    });
    const t = await tasksSvc.createTask(ana, { title: 'Enviar proposta', dueOn: day });
    await tasksSvc.updateTask(ana, t.id, { remind: 'due' }); // 09:00 → not yet at 08:05
    await gen.runNotify(now);
    expect(await mails('notify')).toHaveLength(0);
    expect(await mails('dailySummary')).toHaveLength(1);
    const sum = JSON.parse(
      await fs.readFile(path.join(outbox, (await mails('dailySummary'))[0]!), 'utf8'),
    ) as { to: string; text: string };
    expect(sum.to).toBe('ana@mail.pt');
    expect(sum.text).toContain('Enviar proposta');
    await gen.runNotify(lib.zonedInstant(day, '09:01', tz));
    expect(await mails('dailySummary')).toHaveLength(1); // once a day
    expect(await mails('notify')).toHaveLength(1); // the reminder
    // Rui has the summary on but nothing to do today: no email
    await ns.updateNotifySettings(rui, { tz, prefs: { summary: true, summaryTime: '09:00' } });
    await gen.runNotify(lib.zonedInstant(day, '09:02', tz));
    expect(await mails('dailySummary')).toHaveLength(1);
  });

  it('settings: validated, own row only, inbound address regenerates', async () => {
    const ana = await signedIn('ana@set.pt');
    const def = await ns.getNotifySettings(ana);
    expect(def.prefs.meetingLead).toBe(15);
    expect(def.inbound).toMatchObject({ address: null, enabled: false, senders: ['ana@set.pt'] });
    await expect(ns.updateNotifySettings(ana, { tz: 'Mars/Base' })).rejects.toMatchObject({
      code: 'invalid_tz',
    });
    await expect(ns.updateNotifySettings(ana, { prefs: { meetingLead: 7 as 5 } })).rejects.toBeTruthy();
    const on = await ns.updateNotifySettings(ana, { inbound: { enabled: true } });
    expect(on.inbound!.address).toMatch(/^entrada\+[a-z2-7]{20}@kh\.test$/);
    const again = await ns.regenerateInboundToken(ana);
    expect(again.inbound!.address).not.toBe(on.inbound!.address);
    // someone else's notebook can't be the target
    const rui = await signedIn('rui@set.pt');
    const f = await notesSvc.createFolder(rui, 'Dele');
    await expect(ns.updateNotifySettings(ana, { inbound: { folderId: f.id } })).rejects.toMatchObject({
      code: 'folder_not_found',
    });
  });

  it('inbound: a fake mailbox → notes and tasks; spoofs, strangers and unknown tokens discarded', async () => {
    const ana = await signedIn('ana@in.pt');
    const rui = await signedIn('rui@in.pt');
    const book = await notesSvc.createFolder(ana, 'Caixa de entrada');
    const sa = await ns.updateNotifySettings(ana, { inbound: { enabled: true, folderId: book.id } });
    const sr = await ns.updateNotifySettings(rui, {
      inbound: { enabled: true, target: 'task', taskType: 'mgmt', senders: ['@empresa.pt'] },
    });
    const anaTo = sa.inbound!.address!;
    const ruiTo = sr.inbound!.address!.toUpperCase();

    const box = new Map<number, Buffer>([
      [
        1,
        eml({
          to: `Caixa <${anaTo}>`,
          from: 'ana@in.pt',
          subject: 'Notas da reunião',
          text: 'Ponto 1\nPonto 2\n\nFim',
          id: 'a1',
          auth: 'spf=pass; dkim=pass',
          image: true,
        }),
      ],
      [
        2,
        eml({ to: ruiTo, from: 'chefe@empresa.pt', subject: 'Rever orçamento', text: 'Até sexta', id: 'r1' }),
      ],
      [
        3,
        eml({
          to: anaTo,
          from: 'ana@in.pt',
          subject: 'Falso',
          text: 'x',
          id: 'a2',
          auth: 'spf=fail; dkim=none',
        }),
      ],
      [4, eml({ to: anaTo, from: 'intruso@mau.pt', subject: 'Estranho', text: 'x', id: 'a3' })],
      [
        5,
        eml({
          to: 'entrada+aaaaaaaaaaaaaaaaaaaa@kh.test',
          from: 'ana@in.pt',
          subject: '?',
          text: 'x',
          id: 'a4',
        }),
      ],
      // the same message delivered twice
      [6, eml({ to: anaTo, from: 'ana@in.pt', subject: 'Notas da reunião', text: 'x', id: 'a1' })],
    ]);
    const removed: Array<string | number> = [];
    const source: import('@/server/inbound/process').MailboxSource = {
      async *messages() {
        for (const [id, raw] of box) yield { id, raw };
      },
      async remove(id) {
        removed.push(id);
      },
    };
    const out = await inbound.pollMailbox(source, 'entrada@kh.test');
    expect(out).toEqual({ created: 2, spoof: 1, sender: 1, unknown: 1, duplicate: 1 });
    expect(removed).toEqual([1, 2, 3, 4, 5, 6]);

    const notes = await notesSvc.listNotes(ana, {});
    expect(notes.map((n) => [n.title, n.folderId])).toEqual([['Notas da reunião', book.id]]);
    const note = await notesSvc.getNote(ana, notes[0]!.id);
    const doc = JSON.stringify(note.content);
    expect(doc).toContain('Ponto 1');
    expect(doc).toContain('fatura.pdf'); // listed, not imported
    const img = /\/api\/v1\/files\/([0-9a-f-]{36})/.exec(doc)![1]!;
    expect((await notesSvc.readFile(ana, img))?.mime).toBe('image/png');
    expect((await ns.listNotifications(ana)).items).toMatchObject([
      { kind: 'inbound_note', itemType: 'note', itemId: note.id, title: 'Notas da reunião' },
    ]);

    const tasks = await tasksSvc.listTasks(rui);
    expect(tasks.map((t) => [t.title, t.type])).toEqual([['Rever orçamento', 'mgmt']]);
    expect(tasks[0]!.notes).toContain('Até sexta');
    expect(tasks[0]!.notes).toContain('chefe@empresa.pt');
    expect((await ns.listNotifications(rui)).items.map((n) => n.kind)).toEqual(['inbound_task']);
    // nothing landed with the wrong person
    expect(await notesSvc.listNotes(rui, {})).toEqual([]);
    expect(await tasksSvc.listTasks(ana)).toEqual([]);

    // disabled, or an old address after regenerating: discarded
    await ns.updateNotifySettings(rui, { inbound: { enabled: false } });
    const r2 = await inbound.processMessage(
      eml({ to: ruiTo, from: 'chefe@empresa.pt', subject: 's', text: 'x', id: 'r2' }),
      'entrada@kh.test',
    );
    expect(r2.status).toBe('disabled');
    await ns.regenerateInboundToken(ana);
    const a5 = await inbound.processMessage(
      eml({ to: anaTo, from: 'ana@in.pt', subject: 's', text: 'x', id: 'a5' }),
      'entrada@kh.test',
    );
    expect(a5.status).toBe('unknown');
  });

  it('inbound: 50 a day per person', async () => {
    const ana = await signedIn('ana@rate.pt');
    const s = await ns.updateNotifySettings(ana, { inbound: { enabled: true, target: 'task' } });
    const to = s.inbound!.address!;
    const st: string[] = [];
    for (let i = 0; i < 52; i++)
      st.push(
        (
          await inbound.processMessage(
            eml({ to, from: 'ana@rate.pt', subject: `n${i}`, text: 'x', id: `rate${i}` }),
            'entrada@kh.test',
          )
        ).status,
      );
    expect(st.filter((x) => x === 'created')).toHaveLength(50);
    expect(st.slice(-2)).toEqual(['rate', 'rate']);
  });
});
