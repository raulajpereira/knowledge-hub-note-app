import 'server-only';
import { simpleParser, type AddressObject } from 'mailparser';
import MsgReader from '@kenjiuno/msgreader';
import sanitizeHtml from 'sanitize-html';

// .eml / .msg parsing (SECURITY.md: parsed on the server, HTML sanitized).
// Inline images referenced by cid: are embedded as data: URIs so the body can
// be shown in a sandboxed iframe that may not load anything from the network.

export type ParsedAttachment = { name: string; mime: string; data: Uint8Array };
export type ParsedEmail = {
  subject: string;
  fromName: string;
  fromEmail: string;
  to: string;
  cc: string;
  date: Date | null;
  text: string;
  html: string;
  attachments: ParsedAttachment[];
};

const MAX_INLINE_TOTAL = 4 * 1024 * 1024;
const IMG = /^image\/(png|jpe?g|gif|webp|bmp)$/i;
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);
const clean = (s: unknown) =>
  String(s ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim();

/** Outlook .msg files are OLE2 compound documents. */
export const isMsg = (b: Uint8Array) =>
  b.length > 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;

/** Allow-list sanitizer: formatting, tables and images only; no scripts, forms, frames or remote CSS. */
export function sanitizeEmailHtml(html: string, inline: Map<string, string>): string {
  let budget = MAX_INLINE_TOTAL;
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags.filter((t) => t !== 'iframe'),
      'img',
      'font',
      'center',
      'span',
      'u',
      's',
      'strike',
      'small',
      'big',
      'hr',
    ],
    disallowedTagsMode: 'discard',
    allowedAttributes: {
      '*': [
        'style',
        'align',
        'valign',
        'width',
        'height',
        'bgcolor',
        'color',
        'dir',
        'title',
        'colspan',
        'rowspan',
      ],
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'style'],
      font: ['face', 'size', 'color'],
      table: ['border', 'cellpadding', 'cellspacing', 'width', 'bgcolor', 'style', 'align'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['data', 'http', 'https', 'cid'] },
    allowProtocolRelative: false,
    transformTags: {
      img: (tag, attribs) => {
        const src = attribs.src ?? '';
        if (/^cid:/i.test(src)) {
          const data = inline.get(src.slice(4).replace(/^<|>$/g, '').toLowerCase());
          if (data && data.length <= budget) {
            budget -= data.length;
            return { tagName: 'img', attribs: { ...attribs, src: data } };
          }
          return { tagName: 'img', attribs: { alt: attribs.alt ?? '' } };
        }
        if (/^data:/i.test(src) && !/^data:image\/(png|jpe?g|gif|webp|bmp);/i.test(src))
          return { tagName: 'img', attribs: { alt: attribs.alt ?? '' } };
        return { tagName: 'img', attribs };
      },
      a: (tag, attribs) => ({
        tagName: 'a',
        attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' },
      }),
    },
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'title', 'head'],
    // style attributes: no url(), expression(), @import or CSS escapes. The
    // iframe's CSP blocks the network anyway; this is the second layer.
  }).replace(/style="[^"]*"/gi, (m) =>
    /url\s*\(|expression\s*\(|@import|behavior\s*:|-moz-binding|\\/i.test(m) ? '' : m,
  );
}

const addrText = (a: AddressObject | AddressObject[] | undefined) =>
  !a
    ? ''
    : (Array.isArray(a) ? a : [a])
        .flatMap((x) => x.value)
        .map((v) =>
          v.name && v.address && v.name !== v.address
            ? `${v.name} <${v.address}>`
            : v.name || v.address || '',
        )
        .filter(Boolean)
        .join(', ');

const dataUri = (mime: string, data: Uint8Array) =>
  `data:${mime.toLowerCase()};base64,${Buffer.from(data).toString('base64')}`;

async function parseEml(buf: Uint8Array): Promise<ParsedEmail> {
  const m = await simpleParser(Buffer.from(buf), { skipImageLinks: true, skipTextToHtml: true });
  const from = m.from?.value[0];
  const inline = new Map<string, string>();
  const attachments: ParsedAttachment[] = [];
  for (const a of m.attachments) {
    const data = new Uint8Array(a.content);
    const mime = a.contentType || 'application/octet-stream';
    if (a.cid && IMG.test(mime)) inline.set(a.cid.replace(/^<|>$/g, '').toLowerCase(), dataUri(mime, data));
    if (a.contentDisposition !== 'inline' || !a.cid)
      attachments.push({ name: clean(a.filename) || 'anexo', mime, data });
  }
  return {
    subject: clean(m.subject),
    fromName: clean(from?.name),
    fromEmail: clean(from?.address),
    to: clean(addrText(m.to)),
    cc: clean(addrText(m.cc)),
    date: m.date && !Number.isNaN(m.date.getTime()) ? m.date : null,
    text: clean(m.text),
    html: m.html ? sanitizeEmailHtml(m.html, inline) : '',
    attachments,
  };
}

function parseMsgFile(buf: Uint8Array): ParsedEmail {
  const r = new MsgReader(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  const d = r.getFileData();
  if (d.error) throw new Error(d.error);
  const rec = (type: 'to' | 'cc') =>
    (d.recipients ?? [])
      .filter((x) => (x.recipType ?? 'to') === type)
      .map((x) => {
        const mail = x.smtpAddress || x.email || '';
        return x.name && mail && x.name !== mail ? `${x.name} <${mail}>` : x.name || mail;
      })
      .join(', ');
  const inline = new Map<string, string>();
  const attachments: ParsedAttachment[] = [];
  for (const a of d.attachments ?? []) {
    if (a.innerMsgContent) continue; // embedded .msg: kept in the original file
    const f = r.getAttachment(a);
    const data = f.content;
    const name = clean(f.fileName || a.fileName || a.name) || 'anexo';
    const mime = clean(a.attachMimeTag) || 'application/octet-stream';
    if (a.pidContentId && IMG.test(mime)) {
      inline.set(a.pidContentId.replace(/^<|>$/g, '').toLowerCase(), dataUri(mime, data));
      if (a.attachmentHidden) continue;
    }
    attachments.push({ name, mime, data });
  }
  let html = d.bodyHtml ?? '';
  if (!html && d.html) {
    const cp =
      d.internetCodepage === 65001 || !d.internetCodepage ? 'utf-8' : `windows-${d.internetCodepage}`;
    try {
      html = new TextDecoder(cp).decode(d.html);
    } catch {
      html = new TextDecoder('utf-8').decode(d.html);
    }
  }
  const when = d.messageDeliveryTime || d.clientSubmitTime || d.creationTime;
  const date = when ? new Date(when) : null;
  return {
    subject: clean(d.subject),
    fromName: clean(d.senderName),
    fromEmail: clean(d.senderSmtpAddress || d.senderEmail),
    to: clean(rec('to')),
    cc: clean(rec('cc')),
    date: date && !Number.isNaN(date.getTime()) ? date : null,
    text: clean(d.body),
    html: html ? sanitizeEmailHtml(html, inline) : '',
    attachments,
  };
}

export async function parseEmailFile(buf: Uint8Array): Promise<ParsedEmail> {
  const p = isMsg(buf) ? parseMsgFile(buf) : await parseEml(buf);
  return {
    ...p,
    subject: cut(p.subject, 1000),
    fromName: cut(p.fromName, 300),
    fromEmail: cut(p.fromEmail, 320),
    to: cut(p.to, 20000),
    cc: cut(p.cc, 20000),
    text: cut(p.text, 1_000_000),
    html: p.html.length > 8_000_000 ? '' : p.html,
  };
}
