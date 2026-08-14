import { api } from '../shared/api.js';
import { getConfig, setApiBase, setToken } from '../shared/storage.js';

const root = document.getElementById('app');
const state = { apiBase: '', token: '', user: null, extracted: null, pendingToken: null };

function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function header(showLogout) {
  return `
    <div class="header">
      <img src="../../icons/icon48.png" alt="" />
      <span class="title">Knowledge Hub Clipper</span>
      ${showLogout ? '<span class="logout" id="logout">Sair</span>' : ''}
    </div>
  `;
}

function render(bodyHtml, { showLogout = false } = {}) {
  root.innerHTML = header(showLogout) + bodyHtml;
  if (showLogout) {
    document.getElementById('logout').addEventListener('click', async () => {
      await setToken(null);
      state.token = '';
      state.user = null;
      renderSetupOrLogin();
    });
  }
}

function renderLoading(message) {
  render(`<div class="view"><div class="center-msg"><div class="spinner"></div><div>${escapeHtml(message)}</div></div></div>`);
}

function renderErrorView(message, onRetry) {
  render(`
    <div class="view">
      <div class="error">${escapeHtml(message)}</div>
      <button class="secondary" id="retry">Tentar novamente</button>
    </div>
  `);
  document.getElementById('retry').addEventListener('click', onRetry);
}

// ---- Setup (first run: which Knowledge Hub server) ----

function renderSetup() {
  render(`
    <div class="view">
      <div class="field">
        <label>Endereço do teu Knowledge Hub</label>
        <input id="apiBase" type="text" placeholder="https://a-tua-app.com" value="${escapeHtml(state.apiBase)}" />
      </div>
      <div class="hint">Só precisas de configurar isto uma vez neste browser.</div>
      <div id="err"></div>
      <button class="primary" id="next">Continuar</button>
    </div>
  `);
  const input = document.getElementById('apiBase');
  input.focus();
  const go = async () => {
    const value = input.value.trim();
    if (!value) return;
    document.getElementById('err').innerHTML = '';
    try {
      new URL(value);
    } catch {
      document.getElementById('err').innerHTML = '<div class="error">Endereço inválido.</div>';
      return;
    }
    await setApiBase(value);
    state.apiBase = value.replace(/\/+$/, '');
    renderLogin();
  };
  document.getElementById('next').addEventListener('click', go);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
}

// ---- Login (+ 2FA) ----

function renderLogin() {
  render(`
    <div class="view">
      <div class="field">
        <label>Email</label>
        <input id="email" type="email" placeholder="tu@exemplo.com" />
      </div>
      <div class="field">
        <label>Palavra-passe</label>
        <input id="password" type="password" />
      </div>
      <div id="err"></div>
      <button class="primary" id="signin">Entrar</button>
      <div class="hint" id="changeServer" style="cursor:pointer;text-decoration:underline;">Mudar de servidor (${escapeHtml(state.apiBase)})</div>
    </div>
  `);
  document.getElementById('changeServer').addEventListener('click', renderSetup);
  document.getElementById('email').focus();

  const submit = async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) return;
    const btn = document.getElementById('signin');
    btn.disabled = true;
    btn.textContent = 'A entrar…';
    try {
      const res = await api.login({ email, password });
      if (res.requires2fa) {
        state.pendingToken = res.pendingToken;
        renderTwoFa();
        return;
      }
      await setToken(res.token);
      state.token = res.token;
      state.user = res.user;
      startClip();
    } catch (err) {
      document.getElementById('err').innerHTML = `<div class="error">${escapeHtml(err.message || 'Não foi possível entrar.')}</div>`;
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  };
  document.getElementById('signin').addEventListener('click', submit);
  document.getElementById('password').addEventListener('keydown', (e) => e.key === 'Enter' && submit());
}

function renderTwoFa() {
  render(`
    <div class="view">
      <div class="field">
        <label>Código de autenticação</label>
        <input id="code" type="text" placeholder="123456" autocomplete="one-time-code" />
      </div>
      <div id="err"></div>
      <button class="primary" id="verify">Verificar</button>
    </div>
  `);
  const input = document.getElementById('code');
  input.focus();
  const submit = async () => {
    const code = input.value.trim();
    if (!code) return;
    const btn = document.getElementById('verify');
    btn.disabled = true;
    try {
      const res = await api.login2faVerify({ pendingToken: state.pendingToken, code });
      await setToken(res.token);
      state.token = res.token;
      state.user = res.user;
      startClip();
    } catch (err) {
      document.getElementById('err').innerHTML = `<div class="error">${escapeHtml(err.message || 'Código inválido.')}</div>`;
      btn.disabled = false;
    }
  };
  document.getElementById('verify').addEventListener('click', submit);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
}

// ---- Extraction + editor ----

async function extractActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('Não foi possível aceder a esta página.');
  if (!/^https?:/.test(tab.url || '')) throw new Error('Esta página não pode ser guardada (não é http/https).');
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['vendor/Readability.js', 'src/content/extract.js'],
  });
  return result;
}

async function startClip() {
  renderLoading('A ler a página…');
  try {
    const extracted = await extractActiveTab();
    state.extracted = extracted;
    renderEditor();
  } catch (err) {
    renderErrorView(err.message || 'Não foi possível ler esta página.', startClip);
  }
}

const MODE_LABEL = { selection: 'Seleção', article: 'Artigo', page: 'Página completa' };

function renderEditor() {
  const { title, html, url, mode } = state.extracted;
  const tags = [];

  render(`
    <div class="view">
      <span class="mode-badge">${MODE_LABEL[mode] || 'Página'}</span>
      <div class="field">
        <label>Título</label>
        <input id="title" type="text" value="${escapeHtml(title)}" />
      </div>
      <div class="field">
        <label>Tags</label>
        <div class="tags" id="tagsBox">
          <input id="tagInput" type="text" placeholder="adicionar tag, Enter" />
        </div>
      </div>
      <div class="field">
        <label>Conteúdo</label>
        <div class="content-preview" id="content" contenteditable="true">${html}</div>
      </div>
      <div class="source-url" title="${escapeHtml(url)}">🔗 ${escapeHtml(url)}</div>
      <div id="err"></div>
      <div class="btn-row">
        <button class="secondary" id="cancel">Cancelar</button>
        <button class="primary" id="create">Criar</button>
      </div>
    </div>
  `, { showLogout: true });

  const tagsBox = document.getElementById('tagsBox');
  const tagInput = document.getElementById('tagInput');

  const renderTagChip = (tag) => {
    const chip = h(`<span class="tag-chip">${escapeHtml(tag)}<span class="x">&times;</span></span>`);
    chip.querySelector('.x').addEventListener('click', () => {
      const idx = tags.indexOf(tag);
      if (idx !== -1) tags.splice(idx, 1);
      chip.remove();
    });
    tagsBox.insertBefore(chip, tagInput);
  };

  tagInput.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.value.trim()) {
      e.preventDefault();
      const tag = tagInput.value.trim().replace(/,$/, '');
      if (tag && !tags.includes(tag)) {
        tags.push(tag);
        renderTagChip(tag);
      }
      tagInput.value = '';
    } else if (e.key === 'Backspace' && !tagInput.value && tags.length) {
      tags.pop();
      tagsBox.querySelectorAll('.tag-chip').forEach((c, i, arr) => { if (i === arr.length - 1) c.remove(); });
    }
  });

  document.getElementById('cancel').addEventListener('click', () => window.close());

  document.getElementById('create').addEventListener('click', async () => {
    const btn = document.getElementById('create');
    btn.disabled = true;
    btn.textContent = 'A criar…';
    const finalTitle = document.getElementById('title').value.trim() || 'Sem título';
    const finalHtml = document.getElementById('content').innerHTML;
    const plainText = document.getElementById('content').innerText.trim();
    const blocks = [
      { id: `b${Date.now()}-1`, type: 'link', url: state.extracted.url },
      { id: `b${Date.now()}-2`, type: 'text', format: 'html', value: finalHtml },
    ];
    try {
      await api.createNote({ title: finalTitle, content: plainText, blocks, tags });
      renderSuccess();
    } catch (err) {
      document.getElementById('err').innerHTML = `<div class="error">${escapeHtml(err.message || 'Não foi possível criar a nota.')}</div>`;
      btn.disabled = false;
      btn.textContent = 'Criar';
    }
  });
}

function renderSuccess() {
  render(`
    <div class="view">
      <div class="center-msg">
        <div class="success-icon">✓</div>
        <div>Nota criada.</div>
      </div>
      <button class="secondary" id="openApp">Abrir Knowledge Hub</button>
    </div>
  `, { showLogout: true });
  document.getElementById('openApp').addEventListener('click', () => {
    chrome.tabs.create({ url: `${state.apiBase}/notes` });
    window.close();
  });
  setTimeout(() => window.close(), 1600);
}

// ---- Boot ----

async function renderSetupOrLogin() {
  if (!state.apiBase) renderSetup();
  else renderLogin();
}

async function boot() {
  renderLoading('A carregar…');
  const { apiBase, token } = await getConfig();
  state.apiBase = apiBase;
  state.token = token;

  if (!apiBase) return renderSetup();
  if (!token) return renderLogin();

  try {
    const { user } = await api.me();
    state.user = user;
    startClip();
  } catch {
    await setToken(null);
    renderLogin();
  }
}

boot();
