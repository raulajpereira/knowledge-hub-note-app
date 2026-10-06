import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { isMsg, parseEmailFile, sanitizeEmailHtml } from '@/server/content/emailParse';

// Phase 5.2: .eml / .msg parsing on the server and the HTML allow-list.
import { EML, PNG_B64 } from '../fixtures/sample-eml';

describe('email parsing', () => {
  it('.eml: headers, sanitized HTML with the inline image embedded, real attachments only', async () => {
    const p = await parseEmailFile(new TextEncoder().encode(EML));
    expect(p.subject).toBe('Plano de cutover — S/4HANA');
    expect([p.fromName, p.fromEmail]).toEqual(['Ana Silva', 'ana.silva@cliente.pt']);
    expect(p.to).toBe('Raul Pereira <raul@example.pt>');
    expect(p.cc).toBe('Equipa SAP <sap@example.pt>');
    expect(p.date?.toISOString()).toBe('2026-10-06T08:30:00.000Z');
    expect(p.html).toContain('<b>Raul</b>');
    expect(p.html).toContain(`src="data:image/png;base64,${PNG_B64}"`);
    expect(p.html).not.toMatch(/script|onclick|iframe|javascript:|url\(/i);
    expect(p.html).toContain('target="_blank"');
    expect(p.attachments.map((a) => a.name)).toEqual(['plano.pdf']);
  });

  it('.msg (Outlook): recognised by its bytes, fields, recipients, HTML and attachments', async () => {
    const buf = new Uint8Array(fs.readFileSync('tests/fixtures/sample.msg'));
    expect(isMsg(buf)).toBe(true);
    const p = await parseEmailFile(buf);
    expect(p.subject).toBe('Plano de cutover — SAP S/4HANA');
    expect([p.fromName, p.fromEmail]).toEqual(['Ana Silva', 'ana.silva@cliente.pt']);
    expect(p.to).toBe('Raul Pereira <raul@example.pt>');
    expect(p.cc).toBe('Equipa SAP <sap@example.pt>');
    expect(p.text).toContain('segue o plano');
    expect(p.html).toContain('<b>Raul</b>');
    expect(p.html).toContain('data:image/png;base64,');
    expect(p.html).not.toMatch(/<script|<form|<title/i);
    expect(p.attachments.map((a) => [a.name, a.mime])).toEqual([['plano.pdf', 'application/pdf']]);
  });

  it('sanitizer: only data: images survive besides http(s); no event handlers or CSS escapes', () => {
    const out = sanitizeEmailHtml(
      '<img src="data:text/html;base64,PHNjcmlwdD4="><img src="cid:none"><p style="color:\\72 ed">a</p><svg onload="x"></svg>',
      new Map(),
    );
    expect(out).not.toMatch(/text\/html|cid:|onload|<svg|\\72/);
  });

  it('garbage is rejected', async () => {
    await expect(parseEmailFile(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3, 4, 5]))).rejects.toThrow();
  });
});
