import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';

// "Guardar no KnowledgeHub" — the browser extension (Chrome / Edge, Manifest V3).
// Saving a page keeps no password or token: it opens the app's "Partilhar" page
// (where the person is already signed in) with the page's title, address and the
// selected text. Helpdesk (1.1): a table of tickets on a page behind the
// person's own login there is read with that login, in their browser, every few
// minutes, and sent to the app with a token the app hands to the extension
// ("Ligar a extensão", scope 'ext': it only reaches the Helpdesk routes). The
// helpdesk's password is never seen. The zip is made for this server: its
// address is written into the extension.

export const EXTENSION_VERSION = '1.1.0';

const popupHtml = `<!doctype html>
<html lang="pt">
<head><meta charset="utf-8"><title>KnowledgeHub</title>
<style>
  body{margin:0;width:300px;font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;background:#1d2440;color:#f4f2ff}
  .w{padding:16px}
  h1{font-size:15px;margin:0 0 4px}
  p{margin:0 0 12px;font-size:12px;opacity:.75}
  button{display:block;width:100%;padding:10px 12px;margin-top:8px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:inherit;font:inherit;font-weight:600;cursor:pointer}
  button.p{background:#fff;color:#1d2440;border-color:#fff}
  button[hidden]{display:none}
  .hd{margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.15);font-size:12px}
  .hd b{display:block;margin-bottom:2px}
  small{display:block;margin-top:12px;font-size:11px;opacity:.6;word-break:break-all}
</style></head>
<body><div class="w">
  <h1>Knowledge<span style="color:#5aa9ff">Hub</span></h1>
  <p id="t">…</p>
  <button class="p" id="page">Guardar esta página</button>
  <button id="sel">Guardar o texto selecionado</button>
  <div class="hd" id="hd" hidden><b>Helpdesk</b><span id="hdt"></span>
    <button class="p" id="link" hidden>Ligar esta lista ao KnowledgeHub</button>
    <button id="pair" hidden>Ligar a extensão à minha conta</button>
    <button id="now" hidden>Sincronizar agora</button>
  </div>
  <small id="app"></small>
</div><script src="popup.js"></script></body></html>
`;

const common = (app: string) => `const APP = ${JSON.stringify(app)};
const API = APP + '/api/ext/v1/helpdesk';
/** Opens the app's "Partilhar" with the page (the person is signed in there). */
function share(tab, text) {
  const q = new URLSearchParams();
  if (tab.title) q.set('title', tab.title.slice(0, 300));
  if (tab.url && /^https?:/i.test(tab.url)) q.set('url', tab.url);
  if (text) q.set('text', text.slice(0, 6000));
  chrome.tabs.create({ url: APP + '/app/share?' + q.toString() });
}
async function selection(tab) {
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => String(getSelection() || '') });
    return (r && r.result) || '';
  } catch (e) {
    return '';
  }
}
/** Runs in the helpdesk page: its biggest table of tickets (headers, cells, links), or a sign-in form. */
function readTable() {
  const txt = (el) => (el ? (el.innerText || el.textContent || '') : '').replace(/\\s+/g, ' ').trim();
  const link = (c) => { const a = c && c.querySelector('a[href]'); return a ? a.href : null; };
  const found = [];
  for (const t of document.querySelectorAll('table')) {
    const all = [...t.rows];
    const head = (t.tHead && t.tHead.rows[0]) || all.find((r) => r.querySelector('th'));
    const body = all.filter((r) => r !== head && r.parentElement && r.parentElement.tagName !== 'THEAD' && r.cells.length >= 2);
    found.push({ headers: head ? [...head.cells].map(txt) : [], rows: body.map((r) => [...r.cells].map(txt)), links: body.map((r) => [...r.cells].map(link)) });
  }
  for (const g of document.querySelectorAll('[role=table],[role=grid],[role=treegrid]')) {
    const rows = [...g.querySelectorAll('[role=row]')];
    const head = rows.find((r) => r.querySelector('[role=columnheader]'));
    const cells = (r) => [...r.querySelectorAll('[role=cell],[role=gridcell]')];
    const body = rows.filter((r) => r !== head && cells(r).length >= 2);
    found.push({ headers: head ? [...head.querySelectorAll('[role=columnheader]')].map(txt) : [], rows: body.map((r) => cells(r).map(txt)), links: body.map((r) => cells(r).map(link)) });
  }
  // a header table apart from the body table (sticky headers): put them together
  for (const f of found)
    if (!f.headers.length && f.rows.length) {
      const n = f.rows[0].length;
      const h = found.find((x) => x.headers.length === n && !x.rows.length);
      if (h) f.headers = h.headers;
    }
  const best = found.filter((f) => f.headers.length >= 2 && f.rows.length).sort((a, b) => b.rows.length * b.headers.length - a.rows.length * a.headers.length)[0];
  if (best) return { headers: best.headers.slice(0, 40), rows: best.rows.slice(0, 500).map((r) => r.slice(0, 40).map((c) => c.slice(0, 2000))), links: best.links.slice(0, 500).map((r) => r.slice(0, 40)), url: location.href, title: document.title };
  return { login: !!document.querySelector('input[type=password]'), url: location.href };
}
async function token() {
  const s = await chrome.storage.local.get('token');
  return s.token || null;
}
async function ext(path, body) {
  const t = await token();
  if (!t) throw new Error('unpaired');
  const r = await fetch(API + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: Object.assign({ Authorization: 'Bearer ' + t }, body === undefined ? {} : { 'Content-Type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.status === 401) { await chrome.storage.local.remove('token'); throw new Error('unpaired'); }
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
}
const originOf = (u) => { try { return new URL(u).origin; } catch (e) { return null; } };
`;

const popupJs = (app: string) => `${common(app)}
const $ = (id) => document.getElementById(id);
chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
  $('t').textContent = tab.title || tab.url || '';
  $('app').textContent = APP;
  const sel = await selection(tab);
  const b = $('sel');
  if (!sel) { b.disabled = true; b.style.opacity = .5; }
  $('page').onclick = () => { share(tab, sel); window.close(); };
  b.onclick = () => { share({ title: tab.title, url: tab.url }, sel); window.close(); };
  if (!/^https?:/i.test(tab.url || '') || (tab.url || '').startsWith(APP)) return;
  // Helpdesk: a table of tickets on this page?
  let table = null;
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readTable });
    table = r && r.result && r.result.rows ? r.result : null;
  } catch (e) { /* not allowed on this page */ }
  if (!table) return;
  $('hd').hidden = false;
  const paired = !!(await token());
  const st = (await chrome.storage.local.get('status')).status || {};
  const mine = Object.values(st).find((x) => x.url === tab.url);
  $('hdt').textContent = mine
    ? (mine.error === 'session' ? 'Sessão do helpdesk expirada: entre de novo nesta página.' : 'Ligada · última leitura ' + (mine.at ? new Date(mine.at).toLocaleTimeString().slice(0, 5) : '—'))
    : 'Esta página tem uma tabela (' + table.rows.length + ' linhas).';
  if (!paired) {
    $('pair').hidden = false;
    $('pair').onclick = () => { chrome.tabs.create({ url: APP + '/app/helpdesk?pair=1' }); window.close(); };
    return;
  }
  if (mine) {
    $('now').hidden = false;
    $('now').onclick = () => { chrome.runtime.sendMessage({ kh: 'sync-now' }); window.close(); };
  }
  $('link').hidden = false;
  if (mine) $('link').textContent = 'Voltar a configurar esta lista';
  $('link').onclick = () => {
    const origin = originOf(tab.url);
    // read it later in the background: the person allows this site once (asked here, on the click)
    chrome.permissions.request({ origins: [origin + '/*'] }, async (ok) => {
      if (!ok) { $('hdt').textContent = 'Sem esta permissão a lista não pode ser lida de X em X minutos.'; return; }
      try {
        const r = await ext('/snapshot', table);
        chrome.tabs.create({ url: r.setupUrl });
        window.close();
      } catch (e) {
        $('hdt').textContent = String(e.message) === 'unpaired' ? 'Ligue primeiro a extensão à sua conta.' : 'Não foi possível enviar. Tente de novo.';
      }
    });
  };
});
`;

const backgroundJs = (app: string) => `${common(app)}
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'kh-page', title: 'Guardar a página no KnowledgeHub', contexts: ['page', 'link'] });
  chrome.contextMenus.create({ id: 'kh-sel', title: 'Guardar a seleção no KnowledgeHub', contexts: ['selection'] });
  chrome.alarms.create('kh-sync', { periodInMinutes: 1 });
});
chrome.runtime.onStartup.addListener(() => chrome.alarms.create('kh-sync', { periodInMinutes: 1 }));
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'kh-sel') share(tab, info.selectionText || '');
  else if (info.linkUrl) share({ title: info.selectionText || '', url: info.linkUrl }, '');
  else share(tab, '');
});

// ---- Helpdesk: every minute, the linked pages that are due are read and sent
let running = false;
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'kh-sync') void tick(false); });
chrome.runtime.onMessage.addListener((m) => { if (m && m.kh === 'sync-now') void tick(true); });

async function setStatus(id, s) {
  const st = (await chrome.storage.local.get('status')).status || {};
  st[id] = Object.assign({}, st[id], s);
  await chrome.storage.local.set({ status: st });
  const bad = Object.values(st).some((x) => x.error);
  chrome.action.setBadgeText({ text: bad ? '!' : '' });
  if (bad) chrome.action.setBadgeBackgroundColor({ color: '#d97706' });
}

function waitLoaded(tabId, ms) {
  return new Promise((ok) => {
    const done = () => { chrome.tabs.onUpdated.removeListener(on); clearTimeout(t); ok(); };
    const on = (id, info) => { if (id === tabId && info.status === 'complete') done(); };
    const t = setTimeout(done, ms);
    chrome.tabs.onUpdated.addListener(on);
  });
}

/** The page opened in a minimized window (with the person's login there), its table read, the window closed. */
async function readPage(url) {
  const w = await chrome.windows.create({ url, focused: false, state: 'minimized' });
  const tabId = w.tabs && w.tabs[0] && w.tabs[0].id;
  try {
    await waitLoaded(tabId, 45000);
    let last = null;
    for (let i = 0; i < 20; i++) {
      // pages that draw their table with JavaScript: wait for it
      const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: readTable });
      last = r && r.result;
      if (last && (last.rows || last.login)) break;
      await new Promise((ok) => setTimeout(ok, 1500));
    }
    return last;
  } finally {
    chrome.windows.remove(w.id).catch(() => {});
  }
}

async function tick(force) {
  if (running || !(await token())) return;
  running = true;
  try {
    const { sources } = await ext('/sources');
    const st = (await chrome.storage.local.get('status')).status || {};
    for (const s of sources) {
      const last = (st[s.id] && st[s.id].at) || 0;
      const asked = s.syncRequestedAt && Date.parse(s.syncRequestedAt) > last;
      if (!force && !asked && Date.now() - last < s.intervalMin * 60000 - 20000) continue;
      const origin = originOf(s.url);
      if (!origin || !(await chrome.permissions.contains({ origins: [origin + '/*'] }))) {
        await setStatus(s.id, { url: s.url, at: Date.now(), error: 'permission' });
        continue;
      }
      let r = null;
      try { r = await readPage(s.url); } catch (e) { r = null; }
      const body = r && r.rows ? r : { error: r && r.login ? 'session' : 'no_table' };
      try {
        const res = await ext('/sources/' + s.id + '/sync', body);
        await setStatus(s.id, { url: s.url, at: Date.now(), error: res.ok ? null : res.error });
      } catch (e) {
        await setStatus(s.id, { url: s.url, at: Date.now(), error: 'send' });
      }
    }
  } catch (e) {
    /* offline, or the token was revoked (it is removed: "Ligar a extensão" again) */
  } finally {
    running = false;
  }
}
`;

/** Runs on the app's own pages: "Ligar a extensão" hands the token over (same page, same origin only). */
const contentJs = () => `window.addEventListener('message', (e) => {
  if (e.source !== window || e.origin !== location.origin) return;
  const d = e.data || {};
  if (d.type === 'kh-ext-pair' && typeof d.token === 'string' && /^[A-Za-z0-9_-]{20,100}$/.test(d.token))
    chrome.storage.local.set({ token: d.token }, () =>
      window.postMessage({ type: 'kh-ext-paired', version: ${JSON.stringify(EXTENSION_VERSION)} }, location.origin),
    );
  if (d.type === 'kh-ext-ping')
    chrome.storage.local.get('token', (s) =>
      window.postMessage({ type: 'kh-ext-pong', version: ${JSON.stringify(EXTENSION_VERSION)}, paired: !!s.token }, location.origin),
    );
});
`;

const manifest = (app: string, icon: boolean) => {
  const u = new URL(app);
  // match patterns take no port: the app's host on any port
  const appHost = `${u.protocol}//${u.hostname}/*`;
  return JSON.stringify(
    {
      manifest_version: 3,
      name: 'KnowledgeHub — Guardar',
      description:
        'Guarda a página ou o texto selecionado no KnowledgeHub (como nota ou tarefa) e mantém a lista do Helpdesk sincronizada.',
      version: EXTENSION_VERSION,
      action: { default_popup: 'popup.html', ...(icon ? { default_icon: { 128: 'icon.png' } } : {}) },
      ...(icon ? { icons: { 128: 'icon.png' } } : {}),
      background: { service_worker: 'background.js' },
      permissions: ['activeTab', 'scripting', 'contextMenus', 'alarms', 'storage'],
      host_permissions: [appHost],
      // the helpdesk's site: asked when a list is linked ("Ligar esta lista")
      optional_host_permissions: ['https://*/*', 'http://*/*'],
      content_scripts: [
        { matches: [`${appHost.replace(/\/\*$/, '')}/*`], js: ['content.js'], run_at: 'document_start' },
      ],
      homepage_url: app,
    },
    null,
    2,
  );
};

/** The extension's zip for this server's address. */
export async function extensionZip(appUrl: string): Promise<Uint8Array> {
  const app = appUrl.replace(/\/$/, '');
  let icon: Uint8Array | null = null;
  try {
    icon = new Uint8Array(await fs.readFile(path.join(process.cwd(), 'public', 'icon-512.png')));
  } catch {
    /* no icon: the browser shows a letter */
  }
  const files: Record<string, Uint8Array> = {
    'knowledgehub-extension/manifest.json': strToU8(manifest(app, !!icon)),
    'knowledgehub-extension/popup.html': strToU8(popupHtml),
    'knowledgehub-extension/popup.js': strToU8(popupJs(app)),
    'knowledgehub-extension/background.js': strToU8(backgroundJs(app)),
    'knowledgehub-extension/content.js': strToU8(contentJs()),
  };
  if (icon) files['knowledgehub-extension/icon.png'] = icon;
  return zipSync(files, { level: 6 });
}
