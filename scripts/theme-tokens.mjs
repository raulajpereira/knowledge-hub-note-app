#!/usr/bin/env node
// Light/dark theme (Definições › Aparência › Tema): rewrites the hard-coded
// colours made for the dark glass into theme tokens (globals.css defines
// both themes). Idempotent — converted values no longer match — so it can be
// re-run after a merge brings in new CSS/inline styles:
//
//   node scripts/theme-tokens.mjs            # rewrite src/**/*.css + *.tsx
//   node scripts/theme-tokens.mjs --check    # list what would change, exit 1 if any
//
// Mapping (A = the literal's alpha):
//   white overlay   rgba(255,255,255,A)  → rgb(var(--w) / A)          (dark ink in light)
//     … in a background gradient         → surface rgb(var(--sf) / calc(A * var(--sf-k)))
//     … in an inset highlight / a mask   → kept (white edge reads on both)
//   warm text tint  rgba(255,248,240,A)  → rgb(var(--t) / calc(A * var(--t-k)))
//   dark fills      rgba(18,12,9,A)…     → rgb(var(--d) / calc(A * var(--d-k)))
//   shadows         rgba(0,0,0,A)…       → rgb(0 0 0 / calc(A * var(--sh-k)))
//   #fbf8f5 / #fff  (light ink, white pills) → var(--ink) / var(--ink-hi)
//   #2a211c         (dark text on those pills) → var(--ink-inv)
//   pale error text #ffc9b8…             → var(--kh-error-text)
//   light oklch text (L ≥ .7)            → oklch(calc(L * var(--lk)) C H)
//   color: var(--accent)                 → var(--accent-text)
// Lines with `theme-keep` in a comment are left alone; so are colours inside
// strings that build HTML for iframes/exports (see SKIP_FILES).

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const check = process.argv.includes('--check');

// Files whose colours are not for the app chrome (HTML for iframes, e-mail,
// exported documents) or that define the tokens themselves.
const SKIP_FILES = new Set([
  'src/app/globals.css',
  'src/components/ui/AmbientBackground.tsx',
  'src/components/emails/EmailsView.tsx', // HTML for the sandboxed mail iframe
  'src/components/brand/Logo.tsx', // brand mark
  'src/components/home/weatherArt.tsx', // weather illustrations
]);
// …and whole folders (the component catalogue documents the dark values).
const SKIP_DIRS = ['src/app/ui/'];

const DARK_FILL =
  /^rgba\(\s*(18,\s*12,\s*9|20,\s*14,\s*10|20,\s*15,\s*12|14,\s*10,\s*8|10,\s*7,\s*5|20,\s*16,\s*14|30,\s*24,\s*20|22,\s*16,\s*12)\s*,\s*([\d.]+)\s*\)$/;
const COLOR_RE =
  /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)|#(?:fbf8f5|fffbf5|f4f2f0|fff|ffffff|2a211c|ffc9b8|ffd2c4|ffe0d6)\b|oklch\(\s*0?\.\d+\s+[\d.]+\s+[\d.]+\s*\)|var\(--accent\)/gi;

const n = (a) => String(+a).replace(/^0\./, '.');
const SHADOW_PROPS = /^(box-shadow|boxShadow|text-shadow|textShadow|filter|--[\w-]*shadow[\w-]*)$/;
const TEXT_PROPS =
  /^(color|fill|stroke|caret-color|caretColor|text-decoration-color|textDecorationColor|outline-color|outlineColor|-webkit-text-fill-color|WebkitTextFillColor)$/;
const MASK_PROPS = /^(mask|mask-image|maskImage|-webkit-mask-image|WebkitMaskImage|WebkitMask|-webkit-mask)$/;
const BG_PROPS =
  /^(background|background-image|backgroundImage|background-color|backgroundColor|--[\w-]*bg[\w-]*)$/;

/** The top-level comma segment of `value` that contains index `i`. */
function segmentAt(value, i) {
  let depth = 0;
  let start = 0;
  for (let k = 0; k < value.length; k++) {
    const ch = value[k];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      if (k >= i) return value.slice(start, k);
      start = k + 1;
    }
  }
  return value.slice(start);
}

/** Whether index `i` of `value` is inside a *-gradient(…). */
function inGradient(value, i) {
  const before = value.slice(0, i);
  const m = [...before.matchAll(/(?:linear|radial|conic)-gradient\(/g)];
  if (!m.length) return false;
  const last = m[m.length - 1];
  let depth = 0;
  for (let k = last.index + last[0].length - 1; k < i; k++) {
    if (before[k] === '(') depth++;
    else if (before[k] === ')') depth--;
  }
  return depth > 0;
}

function mapColor(lit, prop, value, idx) {
  const low = lit.toLowerCase().replace(/\s+/g, '');
  const shadow = SHADOW_PROPS.test(prop);
  if (MASK_PROPS.test(prop)) return lit;

  if (low === 'var(--accent)') return TEXT_PROPS.test(prop) ? 'var(--accent-text)' : lit;

  if (/^oklch/i.test(lit)) {
    const [L, C, H] = lit
      .replace(/^oklch\(\s*/i, '')
      .replace(/\s*\)$/, '')
      .split(/\s+/)
      .map(Number);
    if (!TEXT_PROPS.test(prop) || L < 0.7) return lit;
    return `oklch(calc(${n(L)} * var(--lk)) ${n(C)} ${n(H)})`;
  }

  if (low === '#fbf8f5' || low === '#fffbf5' || low === '#f4f2f0') return 'var(--ink)';
  if (low === '#fff' || low === '#ffffff') return TEXT_PROPS.test(prop) ? lit : 'var(--ink-hi)';
  if (low === '#2a211c') return 'var(--ink-inv)';
  if (low === '#ffc9b8' || low === '#ffd2c4' || low === '#ffe0d6') return 'var(--kh-error-text)';

  const rgba = low.match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/);
  if (!rgba) return lit;
  const [, r, g, b, a] = rgba;
  const rgb = `${r},${g},${b}`;
  const A = n(a);
  const seg = segmentAt(value, idx);
  // a shadow written without its property (arrays of styles): offsets + blur before the colour
  const shadowy =
    shadow || /\binset\s+-?\d/.test(seg) || /(^|[\s'"`:])-?\d+(px)?\s+-?\d+(px)?\s+-?\d+px/.test(seg);
  if (rgb === '255,255,255') {
    if (shadowy && /\binset\b/.test(seg)) return lit;
    if (BG_PROPS.test(prop) && inGradient(value, idx)) return `rgb(var(--sf) / calc(${A} * var(--sf-k)))`;
    return `rgb(var(--w) / ${A})`;
  }
  if (rgb === '255,248,240' || rgb === '255,250,245' || rgb === '251,248,245') {
    if (rgb === '251,248,245' && !TEXT_PROPS.test(prop)) return `rgb(var(--ink-rgb) / ${A})`;
    return `rgb(var(--t) / calc(${A} * var(--t-k)))`;
  }
  if (rgb === '255,170,150') return `rgb(var(--err) / ${A})`;
  if (rgb === '0,0,0' || DARK_FILL.test(low)) {
    if (shadowy) return `rgb(0 0 0 / calc(${A} * var(--sh-k)))`;
    return `rgb(var(--d) / calc(${A} * var(--d-k)))`;
  }
  return lit;
}

const scheme = (src) => src.replace(/color-scheme:\s*dark/g, 'color-scheme: var(--scheme)');

// ── CSS: declaration by declaration ──────────────────────────────────────
function convertCss(src) {
  return src.replace(/(^|[;{\s])([-\w]+)(\s*:\s*)([^;{}]+)(?=[;}])/g, (all, pre, prop, colon, value) => {
    if (/theme-keep/.test(value)) return all;
    const v = value.replace(COLOR_RE, (lit, idx) => mapColor(lit, prop, value, idx));
    return pre + prop + colon + v;
  });
}

// ── TSX: colours in inline styles / cssText strings ───────────────────────
function convertTsx(src) {
  const lines = src.split('\n');
  return lines
    .map((line, li) => {
      if (/theme-keep/.test(line) || /theme-keep/.test(lines[li - 1] ?? '')) return line;
      if (!COLOR_RE.test(line)) return line;
      COLOR_RE.lastIndex = 0;
      return line.replace(COLOR_RE, (lit, idx) => {
        // the property: nearest `name:` (object key or cssText) before the literal
        const before = line.slice(0, idx);
        const pm = [...before.matchAll(/([A-Za-z-]+)['"]?\s*[:=]\s*/g)];
        let prop = pm.length ? pm[pm.length - 1][1] : '';
        if (!prop) {
          // a value continued from a previous line (multi-line style object)
          for (let k = li - 1; k >= Math.max(0, li - 4) && !prop; k--) {
            // only a property whose value continues on the next lines (`border:` ⏎ …)
            const mm = /([A-Za-z-]+)['"]?\s*:\s*$/.exec(lines[k]);
            if (mm) prop = mm[1];
            else if (!/^\s*[?:(]/.test(lines[k])) break;
          }
        }
        // the value the literal belongs to: from the property to the end of the string
        const start = pm.length ? pm[pm.length - 1].index + pm[pm.length - 1][0].length : 0;
        const end = line.slice(idx).search(/[;'"`]/);
        const value = line.slice(start, end < 0 ? undefined : idx + end);
        return mapColor(lit, prop, value, idx - start);
      });
    })
    .join('\n');
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(css|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

let changed = 0;
for (const file of walk(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, file);
  if (SKIP_FILES.has(rel) || SKIP_DIRS.some((d) => rel.startsWith(d))) continue;
  const src = fs.readFileSync(file, 'utf8');
  const out = scheme(file.endsWith('.css') ? convertCss(src) : convertTsx(src));
  if (out !== src) {
    changed++;
    if (check) console.log(rel);
    else fs.writeFileSync(file, out);
  }
}
console.log(`${changed} file(s) ${check ? 'would change' : 'changed'}`);
if (check && changed) process.exit(1);
