import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';

// "Guardar no KnowledgeHub" — the browser extension (Chrome / Edge, Manifest V3).
// It keeps no password or token: it opens the app's "Partilhar" page (where the
// person is already signed in) with the page's title, address and the selected
// text, and the app makes the note / task there. The zip is made for this
// server: its address is written into the extension.

export const EXTENSION_VERSION = '1.0.0';

const popupHtml = `<!doctype html>
<html lang="pt">
<head><meta charset="utf-8"><title>KnowledgeHub</title>
<style>
  body{margin:0;width:280px;font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;background:#1d2440;color:#f4f2ff}
  .w{padding:16px}
  h1{font-size:15px;margin:0 0 4px}
  p{margin:0 0 12px;font-size:12px;opacity:.75}
  button{display:block;width:100%;padding:10px 12px;margin-top:8px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:inherit;font:inherit;font-weight:600;cursor:pointer}
  button.p{background:#fff;color:#1d2440;border-color:#fff}
  small{display:block;margin-top:12px;font-size:11px;opacity:.6;word-break:break-all}
</style></head>
<body><div class="w">
  <h1>Knowledge<span style="color:#5aa9ff">Hub</span></h1>
  <p id="t">…</p>
  <button class="p" id="page">Guardar esta página</button>
  <button id="sel">Guardar o texto selecionado</button>
  <small id="app"></small>
</div><script src="popup.js"></script></body></html>
`;

const common = (app: string) => `const APP = ${JSON.stringify(app)};
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
`;

const popupJs = (app: string) => `${common(app)}
chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
  document.getElementById('t').textContent = tab.title || tab.url || '';
  document.getElementById('app').textContent = APP;
  const sel = await selection(tab);
  const b = document.getElementById('sel');
  if (!sel) { b.disabled = true; b.style.opacity = .5; }
  document.getElementById('page').onclick = () => { share(tab, sel); window.close(); };
  b.onclick = () => { share({ title: tab.title, url: tab.url }, sel); window.close(); };
});
`;

const backgroundJs = (app: string) => `${common(app)}
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'kh-page', title: 'Guardar a página no KnowledgeHub', contexts: ['page', 'link'] });
  chrome.contextMenus.create({ id: 'kh-sel', title: 'Guardar a seleção no KnowledgeHub', contexts: ['selection'] });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'kh-sel') share(tab, info.selectionText || '');
  else if (info.linkUrl) share({ title: info.selectionText || '', url: info.linkUrl }, '');
  else share(tab, '');
});
`;

const manifest = (app: string, icon: boolean) =>
  JSON.stringify(
    {
      manifest_version: 3,
      name: 'KnowledgeHub — Guardar',
      description: 'Guarda a página ou o texto selecionado no KnowledgeHub (como nota ou tarefa).',
      version: EXTENSION_VERSION,
      action: { default_popup: 'popup.html', ...(icon ? { default_icon: { 128: 'icon.png' } } : {}) },
      ...(icon ? { icons: { 128: 'icon.png' } } : {}),
      background: { service_worker: 'background.js' },
      permissions: ['activeTab', 'scripting', 'contextMenus'],
      homepage_url: app,
    },
    null,
    2,
  );

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
  };
  if (icon) files['knowledgehub-extension/icon.png'] = icon;
  return zipSync(files, { level: 6 });
}
