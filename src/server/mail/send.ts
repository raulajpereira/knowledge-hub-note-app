import fs from 'node:fs/promises';
import path from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/lib/env';
import { QUEUES, queue } from '@/lib/queue';
import type { MailMessage } from './templates';

let transporter: Transporter | null | undefined;

function smtp(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const e = env();
  transporter =
    e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASS
      ? nodemailer.createTransport({
          host: e.SMTP_HOST,
          port: e.SMTP_PORT,
          secure: e.SMTP_SECURE,
          auth: { user: e.SMTP_USER, pass: e.SMTP_PASS },
        })
      : null;
  return transporter;
}

/** Delivers now: SMTP when configured, otherwise logs (+ outbox folder if set). */
export async function deliverMail(msg: MailMessage): Promise<void> {
  const e = env();
  const t = smtp();
  if (t) {
    await t.sendMail({
      from: e.MAIL_FROM || e.SMTP_USER,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    console.log(`[mail] sent ${msg.kind} to ${msg.to}`);
  } else {
    // No SMTP yet: the text part (with its link) goes to the logs so an
    // operator can still complete the flow: docker compose logs worker
    console.log(`[mail] SMTP not configured — ${msg.kind} for ${msg.to}:\n${msg.text}\n`);
  }
  if (e.MAIL_OUTBOX_DIR) {
    await fs.mkdir(e.MAIL_OUTBOX_DIR, { recursive: true });
    const file = path.join(
      e.MAIL_OUTBOX_DIR,
      `${Date.now()}-${msg.kind}-${msg.to.replace(/[^a-z0-9@.]/gi, '_')}.json`,
    );
    await fs.writeFile(file, JSON.stringify(msg, null, 2));
  }
}

/** Queues a message for the worker (retries with backoff); direct in tests. */
export async function sendMail(msg: MailMessage): Promise<void> {
  if (env().MAIL_DIRECT) return deliverMail(msg);
  await queue(QUEUES.mail).add('send', msg, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: 200,
    removeOnFail: 1000,
  });
}
