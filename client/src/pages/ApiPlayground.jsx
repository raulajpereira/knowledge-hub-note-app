import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useCounts } from '../context/CountsContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { useIsMobile } from '../lib/useIsMobile.js';
import PanelDivider from '../components/PanelDivider.jsx';
import { useResizablePanel } from '../lib/useResizablePanel.js';
import { highlightCode, tokenColor } from '../lib/highlight.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const METHOD_COLORS = { GET: 145, POST: 260, PUT: 60, PATCH: 40, DELETE: 25, HEAD: 280, OPTIONS: 280 };
const optionStyle = { color: '#1a1a1a', background: '#fff' };

let noteBlockIdCounter = 0;
const newNoteBlockId = () => `b${Date.now()}-${noteBlockIdCounter++}`;

function escapeHtmlText(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Renders enabled key/value rows (Params/Headers/form Body) as one line per
// row — the same shape the request editor itself uses, just flattened to text.
function fieldsHtml(rows) {
  return (rows || [])
    .filter((r) => r.enabled !== false && r.key)
    .map((r) => `${escapeHtmlText(r.key)}: ${escapeHtmlText(r.value || '')}`)
    .join('<br>');
}

function responseLanguage(response) {
  const contentType = response?.headers?.['content-type'] || '';
  if (/json/i.test(contentType)) return 'json';
  if (/javascript/i.test(contentType)) return 'javascript';
  if (/xml|html/i.test(contentType)) return 'plaintext';
  const body = (response?.body || '').trim();
  if (body.startsWith('{') || body.startsWith('[')) {
    try {
      JSON.parse(body);
      return 'json';
    } catch {
      // not actually JSON despite looking like it — fall through
    }
  }
  return 'plaintext';
}

function KeyValueRows({ rows, onChange, keyPlaceholder, valuePlaceholder, addLabel, theme }) {
  const list = rows || [];
  const update = (i, patch) => onChange(list.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));
  const add = () => onChange([...list, { key: '', value: '', enabled: true }]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {list.map((row, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={row.enabled !== false}
            onChange={(e) => update(i, { enabled: e.target.checked })}
            style={{ flexShrink: 0 }}
          />
          <input
            value={row.key}
            onChange={(e) => update(i, { key: e.target.value })}
            placeholder={keyPlaceholder}
            style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 7, padding: '6px 9px', fontSize: 12.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
          />
          <input
            value={row.value}
            onChange={(e) => update(i, { value: e.target.value })}
            placeholder={valuePlaceholder}
            style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 7, padding: '6px 9px', fontSize: 12.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
          />
          <span onClick={() => remove(i)} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 16, flexShrink: 0, padding: '0 2px' }}>
            &times;
          </span>
        </div>
      ))}
      <span onClick={add} style={{ fontSize: 12, fontWeight: 700, color: theme.accentText, cursor: 'pointer', alignSelf: 'flex-start' }}>
        {addLabel}
      </span>
    </div>
  );
}

export default function ApiPlayground() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const confirm = useConfirm();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { refresh: refreshCounts } = useCounts();
  const listPanel = useResizablePanel('apiPlayground.list', 300, { min: 260, max: 520 });
  const [savingNote, setSavingNote] = useState(false);

  const [folders, setFolders] = useState([]);
  const [requests, setRequests] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('params');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const saveTimerRef = useRef(null);

  const load = async () => {
    const [{ folders }, { requests }] = await Promise.all([api.listApiFolders(), api.listApiRequests()]);
    setFolders(folders);
    setRequests(requests);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return requests
      .filter((r) => (selectedFolderId === 'all' ? true : selectedFolderId === 'none' ? !r.folderId : r.folderId === selectedFolderId))
      .filter((r) => !search.trim() || r.name.toLowerCase().includes(search.toLowerCase()));
  }, [requests, selectedFolderId, search]);

  const selected = requests.find((r) => r.id === selectedId) || null;
  const mobileShowDetail = isMobile && !!selectedId;

  useEffect(() => {
    setActiveTab('params');
  }, [selectedId]);

  const addFolder = async () => {
    const name = window.prompt(t('apiPlayground.folderNamePlaceholder'));
    if (!name?.trim()) return;
    const { folder } = await api.createApiFolder({ name: name.trim() });
    setFolders((prev) => [...prev, folder]);
  };

  const removeFolder = async (folder) => {
    const ok = await confirm({ message: t('apiPlayground.confirmDeleteFolder', { name: folder.name }) });
    if (!ok) return;
    await api.deleteApiFolder(folder.id);
    setFolders((prev) => prev.filter((f) => f.id !== folder.id));
    setRequests((prev) => prev.map((r) => (r.folderId === folder.id ? { ...r, folderId: null } : r)));
    if (selectedFolderId === folder.id) setSelectedFolderId('all');
  };

  const addRequest = async () => {
    const folderId = selectedFolderId !== 'all' && selectedFolderId !== 'none' ? selectedFolderId : null;
    const { request } = await api.createApiRequest({ name: t('apiPlayground.namePlaceholder'), folderId });
    setRequests((prev) => [request, ...prev]);
    setSelectedId(request.id);
  };

  const removeRequest = async (id) => {
    const ok = await confirm({ message: t('apiPlayground.confirmDeleteRequest') });
    if (!ok) return;
    await api.deleteApiRequest(id);
    setRequests((prev) => prev.filter((r) => r.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  // Optimistic local update + debounced persist, same pattern used for
  // Notes block edits — avoids a round-trip per keystroke on url/body/rows.
  const patchLocal = (fields) => {
    if (!selected) return;
    setRequests((prev) => prev.map((r) => (r.id === selected.id ? { ...r, ...fields } : r)));
    clearTimeout(saveTimerRef.current);
    const id = selected.id;
    saveTimerRef.current = setTimeout(() => {
      api.updateApiRequest(id, fields);
    }, 500);
  };

  const patchImmediate = async (fields) => {
    if (!selected) return;
    setRequests((prev) => prev.map((r) => (r.id === selected.id ? { ...r, ...fields } : r)));
    clearTimeout(saveTimerRef.current);
    await api.updateApiRequest(selected.id, fields);
  };

  const buildUrl = (req) => {
    let url;
    try {
      url = new URL(req.url);
    } catch {
      url = null;
    }
    const enabledParams = (req.queryParams || []).filter((p) => p.enabled !== false && p.key);
    if (!enabledParams.length) return req.url;
    if (!url) {
      const sep = req.url.includes('?') ? '&' : '?';
      return req.url + sep + enabledParams.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value || '')}`).join('&');
    }
    for (const p of enabledParams) url.searchParams.set(p.key, p.value || '');
    return url.toString();
  };

  // Mirrors the request as note blocks: a colored method+URL line, then one
  // text block per non-empty section (Params/Headers/Body), and — the one
  // piece that's genuinely code rather than a list of fields — the last
  // response body as a syntax-highlighted snippet.
  const buildNoteBlocks = (req) => {
    const blocks = [];
    const hue = METHOD_COLORS[req.method] || 280;
    blocks.push({
      id: newNoteBlockId(),
      type: 'text',
      format: 'html',
      value: `<p><span style="font-weight:800;color:oklch(0.55 0.18 ${hue})">${req.method}</span> <span style="font-weight:600">${escapeHtmlText(buildUrl(req))}</span></p>`,
    });

    const paramsHtml = fieldsHtml(req.queryParams);
    if (paramsHtml) {
      blocks.push({ id: newNoteBlockId(), type: 'text', format: 'html', value: `<p><b>${t('apiPlayground.tabParams')}</b><br>${paramsHtml}</p>` });
    }
    const headersHtml = fieldsHtml(req.headers);
    if (headersHtml) {
      blocks.push({ id: newNoteBlockId(), type: 'text', format: 'html', value: `<p><b>${t('apiPlayground.tabHeaders')}</b><br>${headersHtml}</p>` });
    }
    if (req.bodyType === 'form') {
      const formHtml = fieldsHtml(req.formBody);
      if (formHtml) blocks.push({ id: newNoteBlockId(), type: 'text', format: 'html', value: `<p><b>${t('apiPlayground.tabBody')}</b><br>${formHtml}</p>` });
    } else if (req.bodyType !== 'none' && (req.body || '').trim()) {
      blocks.push({ id: newNoteBlockId(), type: 'text', format: 'html', value: `<p><b>${t('apiPlayground.tabBody')}</b></p>` });
      blocks.push({ id: newNoteBlockId(), type: 'code', language: req.bodyType === 'json' ? 'json' : 'plaintext', value: req.body });
    }

    if (req.lastResponse?.error) {
      blocks.push({ id: newNoteBlockId(), type: 'text', format: 'html', value: `<p><b>${t('apiPlayground.tabResponse')}</b></p>` });
      blocks.push({ id: newNoteBlockId(), type: 'code', language: 'plaintext', value: req.lastResponse.error });
    } else if (req.lastResponse) {
      const r = req.lastResponse;
      blocks.push({
        id: newNoteBlockId(),
        type: 'text',
        format: 'html',
        value: `<p><b>${t('apiPlayground.tabResponse')}</b> — ${r.status} ${escapeHtmlText(r.statusText || '')} (${r.timeMs} ms)</p>`,
      });
      blocks.push({ id: newNoteBlockId(), type: 'code', language: responseLanguage(r), value: r.body || '' });
    }

    return blocks;
  };

  // Plain-text mirror of the blocks, same idea as Notes' own contentFromBlocks
  // — feeds the note list's search box and preview snippet.
  const blocksToContent = (blocks) =>
    blocks
      .map((b) => (b.type === 'text' ? b.value.replace(/<[^>]+>/g, ' ') : b.value || ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

  const saveAsNote = async () => {
    if (!selected || savingNote) return;
    setSavingNote(true);
    try {
      const blocks = buildNoteBlocks(selected);
      const { note } = await api.createNote({ title: selected.name, content: blocksToContent(blocks), blocks });
      refreshCounts();
      navigate('/notes', { state: { noteId: note.id } });
    } finally {
      setSavingNote(false);
    }
  };

  const sendRequest = async () => {
    if (!selected || sending) return;
    setSending(true);
    setActiveTab('response');
    const req = selected;
    const headers = {};
    for (const h of req.headers || []) {
      if (h.enabled !== false && h.key) headers[h.key] = h.value || '';
    }
    let url = buildUrl(req);

    if (req.authType === 'bearer' && req.authConfig?.token) {
      headers.Authorization = `Bearer ${req.authConfig.token}`;
    } else if (req.authType === 'basic' && (req.authConfig?.username || req.authConfig?.password)) {
      headers.Authorization = `Basic ${btoa(`${req.authConfig.username || ''}:${req.authConfig.password || ''}`)}`;
    } else if (req.authType === 'apiKey' && req.authConfig?.name) {
      if (req.authConfig.location === 'query') {
        const sep = url.includes('?') ? '&' : '?';
        url += `${sep}${encodeURIComponent(req.authConfig.name)}=${encodeURIComponent(req.authConfig.value || '')}`;
      } else {
        headers[req.authConfig.name] = req.authConfig.value || '';
      }
    }

    let body;
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    if (hasBody && req.bodyType === 'json') {
      body = req.body || '';
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    } else if (hasBody && req.bodyType === 'text') {
      body = req.body || '';
      if (!headers['Content-Type']) headers['Content-Type'] = 'text/plain';
    } else if (hasBody && req.bodyType === 'form') {
      const form = new URLSearchParams();
      for (const f of req.formBody || []) {
        if (f.enabled !== false && f.key) form.set(f.key, f.value || '');
      }
      body = form.toString();
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    const startedAt = performance.now();
    let lastResponse;
    try {
      const res = await fetch(url, { method: req.method, headers, body });
      const timeMs = Math.round(performance.now() - startedAt);
      const resHeaders = {};
      res.headers.forEach((v, k) => { resHeaders[k] = v; });
      let text = await res.text();
      try {
        text = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // not JSON — keep as-is
      }
      lastResponse = { status: res.status, statusText: res.statusText, headers: resHeaders, body: text, timeMs, savedAt: new Date().toISOString() };
    } catch (directErr) {
      // The browser fetch failed — almost always the target API's CORS
      // policy blocking it (browsers surface that as an opaque network
      // error indistinguishable from a real connectivity failure), so fall
      // back once to the server-side proxy, which isn't subject to CORS.
      try {
        const proxied = await api.proxyApiRequest({ url, method: req.method, headers, body });
        let text = proxied.body ?? '';
        try {
          text = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          // not JSON — keep as-is
        }
        lastResponse = { ...proxied, body: text, savedAt: new Date().toISOString(), viaProxy: true };
      } catch (proxyErr) {
        lastResponse = { error: proxyErr.message || directErr.message, savedAt: new Date().toISOString() };
      }
    }
    await patchImmediate({ lastResponse });
    setSending(false);
  };

  const rowStyle = (active) => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, cursor: 'pointer',
    background: active ? theme.accentSoftBg : 'transparent', color: active ? theme.accentText : theme.textPrimary,
  });

  if (loading) return null;

  return (
    <div style={{ padding: isMobile ? 14 : '24px 28px', flex: 1, display: 'flex', gap: isMobile ? 0 : 12, minHeight: 0 }}>
      {(!isMobile || !mobileShowDetail) && (
        <div style={{ flex: isMobile ? '1 1 auto' : `0 0 ${listPanel.width}px`, minWidth: isMobile ? 0 : 260, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '9px 12px', flex: 1, minWidth: 0 }}>
              <span style={{ opacity: 0.5, display: 'flex' }}>
                <Icon name="search" size={15} />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('apiPlayground.searchPlaceholder')}
                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, flex: 1, minWidth: 0, color: theme.textPrimary }}
              />
            </div>
            <button
              onClick={addRequest}
              title={t('apiPlayground.newRequest')}
              style={{ display: 'flex', alignItems: 'center', background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 12px', cursor: 'pointer', flexShrink: 0 }}
            >
              <Icon name="plus" size={16} color="#fff" />
            </button>
          </div>

          <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div onClick={() => setSelectedFolderId('all')} style={rowStyle(selectedFolderId === 'all')}>
              <Icon name="plug" size={15} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{t('apiPlayground.title')}</span>
              <span style={{ fontSize: 11.5, color: theme.textMuted }}>{requests.length}</span>
            </div>
            <div onClick={() => setSelectedFolderId('none')} style={rowStyle(selectedFolderId === 'none')}>
              <Icon name="folder" size={15} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{t('apiPlayground.noFolder')}</span>
            </div>
            {folders.map((f) => (
              <div key={f.id} onClick={() => setSelectedFolderId(f.id)} style={rowStyle(selectedFolderId === f.id)}>
                <Icon name="folder" size={15} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                <span style={{ fontSize: 11.5, color: theme.textMuted }}>{f.requestCount}</span>
                <span
                  onClick={(e) => { e.stopPropagation(); removeFolder(f); }}
                  title={t('apiPlayground.deleteFolder')}
                  style={{ cursor: 'pointer', color: theme.textMuted, display: 'flex', flexShrink: 0 }}
                >
                  <Icon name="trash" size={13} />
                </span>
              </div>
            ))}
            <span onClick={addFolder} style={{ fontSize: 12, fontWeight: 700, color: theme.accentText, cursor: 'pointer', padding: '8px 10px' }}>
              {t('apiPlayground.newFolder')}
            </span>
          </div>

          <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 8, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {filtered.length === 0 && <div style={{ padding: 14, fontSize: 13, color: theme.textMuted }}>{t('apiPlayground.noRequests')}</div>}
            {filtered.map((r) => (
              <div key={r.id} onClick={() => setSelectedId(r.id)} style={rowStyle(selectedId === r.id)}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: `oklch(0.55 0.18 ${METHOD_COLORS[r.method] || 280})`, width: 42, flexShrink: 0 }}>{r.method}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isMobile && <PanelDivider theme={theme} onResize={listPanel.onResize} onResizeEnd={listPanel.onResizeEnd} />}

      {(!isMobile || mobileShowDetail) && (selected ? (
        <div style={{ flex: isMobile ? '1 1 auto' : '1 1 640px', minWidth: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: isMobile ? 14 : 20, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isMobile && (
              <span onClick={() => setSelectedId(null)} style={{ display: 'flex', cursor: 'pointer', color: theme.textMuted, transform: 'rotate(180deg)', flexShrink: 0 }}>
                <Icon name="chevron" size={18} />
              </span>
            )}
            <input
              value={selected.name}
              onChange={(e) => patchLocal({ name: e.target.value })}
              placeholder={t('apiPlayground.namePlaceholder')}
              style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 18, fontWeight: 800, color: theme.textPrimary }}
            />
            <span onClick={() => removeRequest(selected.id)} title={t('apiPlayground.deleteRequest')} style={{ cursor: 'pointer', color: theme.textMuted, display: 'flex' }}>
              <Icon name="trash" size={16} />
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={selected.method}
              onChange={(e) => patchImmediate({ method: e.target.value })}
              style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, fontWeight: 700, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
            >
              {METHODS.map((m) => <option key={m} value={m} style={optionStyle}>{m}</option>)}
            </select>
            <input
              value={selected.url}
              onChange={(e) => patchLocal({ url: e.target.value })}
              placeholder={t('apiPlayground.urlPlaceholder')}
              style={{ flex: 1, minWidth: 0, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
            />
            <button
              onClick={sendRequest}
              disabled={sending || !selected.url}
              style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: sending || !selected.url ? 0.6 : 1, flexShrink: 0 }}
            >
              {sending ? t('apiPlayground.sending') : t('apiPlayground.send')}
            </button>
            <button
              onClick={saveAsNote}
              disabled={savingNote}
              title={t('apiPlayground.saveAsNote')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, background: theme.accent, color: '#fff', border: 'none',
                borderRadius: 8, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: savingNote ? 0.6 : 1, flexShrink: 0,
              }}
            >
              <Icon name="bookmark" size={14} color="#fff" />
              {t('apiPlayground.saveAsNote')}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${theme.border}` }}>
            {['params', 'headers', 'body', 'auth', 'response'].map((tab) => (
              <div
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '8px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  color: activeTab === tab ? theme.accentText : theme.textMuted,
                  borderBottom: activeTab === tab ? `2px solid ${theme.accent}` : '2px solid transparent',
                }}
              >
                {t(`apiPlayground.tab${tab[0].toUpperCase()}${tab.slice(1)}`)}
              </div>
            ))}
          </div>

          {activeTab === 'params' && (
            <KeyValueRows
              rows={selected.queryParams}
              onChange={(rows) => patchLocal({ queryParams: rows })}
              keyPlaceholder={t('apiPlayground.keyPlaceholder')}
              valuePlaceholder={t('apiPlayground.valuePlaceholder')}
              addLabel={t('apiPlayground.addRow')}
              theme={theme}
            />
          )}

          {activeTab === 'headers' && (
            <KeyValueRows
              rows={selected.headers}
              onChange={(rows) => patchLocal({ headers: rows })}
              keyPlaceholder={t('apiPlayground.keyPlaceholder')}
              valuePlaceholder={t('apiPlayground.valuePlaceholder')}
              addLabel={t('apiPlayground.addRow')}
              theme={theme}
            />
          )}

          {activeTab === 'body' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <select
                value={selected.bodyType}
                onChange={(e) => patchImmediate({ bodyType: e.target.value })}
                style={{ alignSelf: 'flex-start', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '6px 9px', fontSize: 12.5, fontWeight: 600, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
              >
                <option value="none" style={optionStyle}>{t('apiPlayground.bodyTypeNone')}</option>
                <option value="json" style={optionStyle}>{t('apiPlayground.bodyTypeJson')}</option>
                <option value="text" style={optionStyle}>{t('apiPlayground.bodyTypeText')}</option>
                <option value="form" style={optionStyle}>{t('apiPlayground.bodyTypeForm')}</option>
              </select>
              {selected.bodyType === 'form' ? (
                <KeyValueRows
                  rows={selected.formBody}
                  onChange={(rows) => patchLocal({ formBody: rows })}
                  keyPlaceholder={t('apiPlayground.keyPlaceholder')}
                  valuePlaceholder={t('apiPlayground.valuePlaceholder')}
                  addLabel={t('apiPlayground.addRow')}
                  theme={theme}
                />
              ) : selected.bodyType !== 'none' ? (
                <textarea
                  value={selected.body || ''}
                  onChange={(e) => patchLocal({ body: e.target.value })}
                  placeholder={t('apiPlayground.bodyPlaceholder')}
                  rows={10}
                  style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 10, fontSize: 12.5, fontFamily: 'monospace', background: theme.subtleBg, color: theme.textPrimary, outline: 'none', resize: 'vertical' }}
                />
              ) : null}
            </div>
          )}

          {activeTab === 'auth' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <select
                value={selected.authType}
                onChange={(e) => patchImmediate({ authType: e.target.value, authConfig: {} })}
                style={{ alignSelf: 'flex-start', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '6px 9px', fontSize: 12.5, fontWeight: 600, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
              >
                <option value="none" style={optionStyle}>{t('apiPlayground.authTypeNone')}</option>
                <option value="bearer" style={optionStyle}>{t('apiPlayground.authTypeBearer')}</option>
                <option value="basic" style={optionStyle}>{t('apiPlayground.authTypeBasic')}</option>
                <option value="apiKey" style={optionStyle}>{t('apiPlayground.authTypeApiKey')}</option>
              </select>
              {selected.authType === 'bearer' && (
                <input
                  value={selected.authConfig?.token || ''}
                  onChange={(e) => patchLocal({ authConfig: { ...selected.authConfig, token: e.target.value } })}
                  placeholder={t('apiPlayground.tokenPlaceholder')}
                  style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
                />
              )}
              {selected.authType === 'basic' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={selected.authConfig?.username || ''}
                    onChange={(e) => patchLocal({ authConfig: { ...selected.authConfig, username: e.target.value } })}
                    placeholder={t('apiPlayground.usernamePlaceholder')}
                    style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
                  />
                  <input
                    type="password"
                    value={selected.authConfig?.password || ''}
                    onChange={(e) => patchLocal({ authConfig: { ...selected.authConfig, password: e.target.value } })}
                    placeholder={t('apiPlayground.passwordPlaceholder')}
                    style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
                  />
                </div>
              )}
              {selected.authType === 'apiKey' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={selected.authConfig?.name || ''}
                      onChange={(e) => patchLocal({ authConfig: { ...selected.authConfig, name: e.target.value } })}
                      placeholder={t('apiPlayground.apiKeyNamePlaceholder')}
                      style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
                    />
                    <input
                      value={selected.authConfig?.value || ''}
                      onChange={(e) => patchLocal({ authConfig: { ...selected.authConfig, value: e.target.value } })}
                      placeholder={t('apiPlayground.apiKeyValuePlaceholder')}
                      style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
                    />
                  </div>
                  <select
                    value={selected.authConfig?.location || 'header'}
                    onChange={(e) => patchImmediate({ authConfig: { ...selected.authConfig, location: e.target.value } })}
                    style={{ alignSelf: 'flex-start', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '6px 9px', fontSize: 12.5, fontWeight: 600, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
                  >
                    <option value="header" style={optionStyle}>{t('apiPlayground.apiKeyLocationHeader')}</option>
                    <option value="query" style={optionStyle}>{t('apiPlayground.apiKeyLocationQuery')}</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {activeTab === 'response' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {!selected.lastResponse && (
                <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('apiPlayground.responseEmpty')}</div>
              )}
              {selected.lastResponse?.error && (
                <div style={{ fontSize: 12.5, color: 'oklch(0.55 0.18 25)', background: 'oklch(0.55 0.18 25 / 0.1)', borderRadius: 8, padding: 10 }}>
                  {t('apiPlayground.responseError')}
                  <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 11.5 }}>{selected.lastResponse.error}</div>
                </div>
              )}
              {selected.lastResponse && !selected.lastResponse.error && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12.5 }}>
                    <span style={{ fontWeight: 800, color: selected.lastResponse.status < 400 ? 'oklch(0.6 0.15 145)' : 'oklch(0.55 0.18 25)' }}>
                      {selected.lastResponse.status} {selected.lastResponse.statusText}
                    </span>
                    <span style={{ color: theme.textMuted }}>{selected.lastResponse.timeMs} ms</span>
                    {selected.lastResponse.viaProxy && (
                      <span title={t('apiPlayground.viaProxyHint')} style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: theme.accentSoftBg, color: theme.accentText }}>
                        {t('apiPlayground.viaProxy')}
                      </span>
                    )}
                    <span style={{ color: theme.textMuted, fontSize: 11 }}>
                      {t('apiPlayground.savedAt')} {new Date(selected.lastResponse.savedAt).toLocaleString()}
                    </span>
                  </div>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5, background: theme.subtleBg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 12, maxHeight: 400, overflowY: 'auto', color: theme.textPrimary }}>
                    {highlightCode(selected.lastResponse.body, responseLanguage(selected.lastResponse)).map((tokens, i) => (
                      <div key={i}>
                        {tokens.map((tok, j) => (
                          <span key={j} style={{ color: tokenColor(tok.type, theme.dark) }}>
                            {tok.text}
                          </span>
                        ))}
                        {tokens.length === 0 && ' '}
                      </div>
                    ))}
                  </pre>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: '1 1 480px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
          {t('apiPlayground.selectOrCreate')}
        </div>
      ))}
    </div>
  );
}
