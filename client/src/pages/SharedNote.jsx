import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';

// Fully standalone — no auth, no ThemeProvider/LanguageProvider, reachable
// whether or not the visitor is logged into this Knowledge Hub at all.
// Read-only: no edit affordances, nothing that writes back.
export default function SharedNote() {
  const { token } = useParams();
  const [note, setNote] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getPublicNote(token)
      .then(({ note }) => setNote(note))
      .catch((err) => setError(err.message || 'Not found'))
      .finally(() => setLoading(false));
  }, [token]);

  const blockHtml = (note) => {
    if (Array.isArray(note.blocks) && note.blocks.length > 0) {
      return note.blocks
        .map((b) => {
          if (b.type === 'checklist') {
            const items = (b.items || []).map((it) => `<li>${it.checked ? '☑' : '☐'} ${escapeHtml(it.text || '')}</li>`).join('');
            return `<ul>${items}</ul>`;
          }
          if (b.type === 'code') return `<pre><code>${escapeHtml(b.value || '')}</code></pre>`;
          if (b.type === 'image' || b.type === 'file') return '';
          if (b.format === 'html') return `<div>${b.value || ''}</div>`;
          return `<p>${escapeHtml(b.value || '')}</p>`;
        })
        .join('\n');
    }
    return note.content || '';
  };

  const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  // Note content is normally only ever rendered back to its own author (who
  // wrote it), so the editor doesn't sanitize on save. A public link changes
  // that trust model — anyone with the URL sees this — so strip anything
  // that could execute (script tags, on*= handlers, javascript: URLs)
  // before it ever reaches dangerouslySetInnerHTML.
  const sanitizeHtml = (html) =>
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/\son\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
      .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');

  return (
    <div
      style={{
        minHeight: '100vh', background: '#0f1117', color: '#e8e8ec', display: 'flex', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif', padding: '48px 20px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 680 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28, opacity: 0.6, fontSize: 13, fontWeight: 700 }}>
          <span>📘</span> Knowledge Hub — nota partilhada
        </div>
        {loading && <div style={{ opacity: 0.6 }}>A carregar…</div>}
        {!loading && error && (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 24 }}>
            Este link deixou de estar disponível (a nota foi removida ou a partilha foi desativada).
          </div>
        )}
        {!loading && note && (
          <>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 20px' }}>{note.title}</h1>
            <div
              style={{ fontSize: 15.5, lineHeight: 1.7 }}
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(blockHtml(note)) }}
            />
          </>
        )}
      </div>
    </div>
  );
}
