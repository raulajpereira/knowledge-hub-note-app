// Builds tests/fixtures/sample.msg: a minimal Outlook message (OLE2 compound
// file with MAPI property streams) — subject, sender, recipients, HTML body
// with an inline image (cid:) and a PDF attachment. Run: node tests/fixtures/make-msg.mjs
import CFB from 'cfb';
import fs from 'node:fs';

const u16 = (s) => Buffer.from(s + '\0', 'utf16le').subarray(0, Buffer.byteLength(s, 'utf16le'));
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const html =
  '<html><head><title>x</title><script>alert(1)</script></head><body><p style="color:red">Olá <b>Raul</b>, segue o plano de <a href="https://example.com/go">cutover</a>.</p><img src="cid:logo@kh"><img src="https://tracker.example/p.gif"><form><input></form></body></html>';

// property header: 32 bytes for the top-level message, 8 bytes for recipients/attachments
const props = (top, entries) => {
  const head = Buffer.alloc(top ? 32 : 8);
  const rows = entries.map(([tag, flags, value]) => {
    const b = Buffer.alloc(16);
    b.writeUInt32LE(tag, 0);
    b.writeUInt32LE(flags, 4);
    b.writeUInt32LE(value, 8);
    return b;
  });
  return Buffer.concat([head, ...rows]);
};
const cfb = CFB.utils.cfb_new();
const add = (name, data) => CFB.utils.cfb_add(cfb, name, data);
const str = (path, id, s) => add(`${path}__substg1.0_${id}001F`, u16(s));
const bin = (path, id, b) => add(`${path}__substg1.0_${id}0102`, b);

add('/__properties_version1.0', props(true, []));
str('/', '001A', 'IPM.Note');
str('/', '0037', 'Plano de cutover — SAP S/4HANA');
str('/', '0C1A', 'Ana Silva');
str('/', '0C1F', 'ana.silva@cliente.pt');
str('/', '5D01', 'ana.silva@cliente.pt');
str('/', '1000', 'Olá Raul, segue o plano de cutover.');
bin('/', '1013', Buffer.from(html, 'utf8'));

const r0 = '/__recip_version1.0_#00000000/';
add(`${r0}__properties_version1.0`, props(false, [[0x0c150003, 6, 1]]));
str(r0, '3001', 'Raul Pereira');
str(r0, '3003', 'raul@example.pt');
str(r0, '39FE', 'raul@example.pt');
const r1 = '/__recip_version1.0_#00000001/';
add(`${r1}__properties_version1.0`, props(false, [[0x0c150003, 6, 2]]));
str(r1, '3001', 'Equipa SAP');
str(r1, '39FE', 'sap@example.pt');

const a0 = '/__attach_version1.0_#00000000/';
add(`${a0}__properties_version1.0`, props(false, [[0x37050003, 6, 1]]));
str(a0, '3707', 'plano.pdf');
str(a0, '3704', 'plano.pdf');
str(a0, '370E', 'application/pdf');
bin(a0, '3701', Buffer.from('%PDF-1.4\n% plano de cutover\n'));
const a1 = '/__attach_version1.0_#00000001/';
add(
  `${a1}__properties_version1.0`,
  props(false, [
    [0x37050003, 6, 1],
    [0x7ffe000b, 6, 1],
  ]),
);
str(a1, '3707', 'logo.png');
str(a1, '370E', 'image/png');
str(a1, '3712', 'logo@kh');
bin(a1, '3701', PNG);

fs.writeFileSync(new URL('./sample.msg', import.meta.url), CFB.write(cfb, { type: 'buffer' }));
console.log('sample.msg written');
