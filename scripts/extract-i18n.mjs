// Extracts the PT/EN dictionaries from the hi-fi prototypes into
// src/i18n/dict/*.json, so translations come from one source of truth.
//   node scripts/extract-i18n.mjs
// - I18N   (ZNotes.dc.html)        keyed dictionary { pt: {...}, en: {...} }
// - AD_EX  (Admin Console.dc.html) PT → EN by exact string
// - MG_EX  (Management.dc.html)    PT → EN by exact string
// The prototypes are our own design files; the literals are evaluated in an
// empty VM context (no globals), never in this process' scope.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const DESIGN = 'docs/handoff/design';
const OUT = 'src/i18n/dict';

// Returns the source of the object literal assigned to `const <name> =`.
function literal(src, name) {
  const start = src.indexOf(`const ${name} = `);
  if (start < 0) throw new Error(`${name} not found`);
  let i = src.indexOf('{', start);
  const from = i;
  let depth = 0;
  let quote = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return src.slice(from, i + 1);
  }
  throw new Error(`${name}: unbalanced literal`);
}

// Regex rule lists ([[/re/, 'to'], ...]) are one-line statements; take the
// line and serialize each regex as [source, flags, replacement].
function rules(src, name) {
  const start = src.indexOf(`const ${name} = `);
  if (start < 0) throw new Error(`${name} not found`);
  const line = src
    .slice(start + `const ${name} = `.length, src.indexOf('\n', start))
    .trim()
    .replace(/;$/, '');
  const list = evaluate(line);
  // Function replacements can't be serialised; those messages get proper
  // keys when their screen is built (and the prototype's revoke text is
  // outdated anyway: DECISIONS §1 keeps data 30 days).
  const skipped = list.filter(([, to]) => typeof to !== 'string');
  if (skipped.length) console.warn(`${name}: skipped ${skipped.length} rule(s) with function replacements`);
  return list.filter(([, to]) => typeof to === 'string').map(([re, to]) => [re.source, re.flags, to]);
}

function evaluate(code) {
  return vm.runInNewContext(`(${code})`, Object.create(null), { timeout: 1000 });
}

function read(file) {
  return fs.readFileSync(path.join(DESIGN, file), 'utf8');
}

function write(file, data) {
  const sorted = Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(sorted, null, 2) + '\n');
  console.log(`${file}: ${Object.keys(sorted).length} entries`);
}

fs.mkdirSync(OUT, { recursive: true });

const app = evaluate(literal(read('ZNotes.dc.html'), 'I18N'));
write('app.pt.json', app.pt);
write('app.en.json', app.en);
const missingEn = Object.keys(app.pt).filter((k) => !(k in app.en));
const missingPt = Object.keys(app.en).filter((k) => !(k in app.pt));
if (missingEn.length || missingPt.length) {
  console.warn(`app: ${missingEn.length} keys without EN, ${missingPt.length} without PT`);
  fs.writeFileSync(
    path.join(OUT, 'app.missing.json'),
    JSON.stringify({ missingEn, missingPt }, null, 2) + '\n',
  );
}

const admin = read('Admin Console.dc.html');
const mg = read('Management.dc.html');
write('admin.pt-en.json', evaluate(literal(admin, 'AD_EX')));
write('mg.pt-en.json', evaluate(literal(mg, 'MG_EX')));
for (const [file, list] of [
  ['admin.rules.json', rules(admin, 'AD_RX')],
  ['mg.rules.json', rules(mg, 'MG_RX')],
]) {
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(list, null, 2) + '\n');
  console.log(`${file}: ${list.length} rules`);
}
