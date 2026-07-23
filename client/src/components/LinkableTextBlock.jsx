import { useEffect, useRef, useState } from 'react';
import AutoResizeTextarea from './AutoResizeTextarea.jsx';
import { parseLinkSegments, findNoteByTitle } from '../lib/wikiLinks.js';
import Icon from './Icon.jsx';

const LINK_QUERY_RE = /\[\[([^[\]]*)$/;
const MAX_SUGGESTIONS = 6;

// A note text block that behaves like a plain textarea while being edited
// (so [[links]] are visible and easy to type/autocomplete), and renders
// [[Title]] as clickable pills once you click away — same click-to-edit /
// blur-to-commit pattern already used for titles elsewhere in the app.
export default function LinkableTextBlock({ value, onChange, notes, placeholder, theme, t, onNavigate, onCreateAndLink, style }) {
  const [editing, setEditing] = useState(!value);
  const [autocomplete, setAutocomplete] = useState(null); // { query, start, end, index }
  const [creating, setCreating] = useState(false);
  const textareaRef = useRef(null);
  const pendingCaretRef = useRef(null);

  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    if (pendingCaretRef.current != null) {
      el.selectionStart = el.selectionEnd = pendingCaretRef.current;
      pendingCaretRef.current = null;
    }
  }, [editing]);

  const updateAutocompleteFromCaret = (text, caret) => {
    const before = text.slice(0, caret);
    const match = before.match(LINK_QUERY_RE);
    if (!match) {
      setAutocomplete(null);
      return;
    }
    setAutocomplete({ query: match[1], start: caret - match[0].length, end: caret, index: 0 });
  };

  const handleChange = (e) => {
    onChange(e.target.value);
    updateAutocompleteFromCaret(e.target.value, e.target.selectionStart);
  };

  const handleSelect = (e) => {
    if (autocomplete) updateAutocompleteFromCaret(e.target.value, e.target.selectionStart);
  };

  const candidates = (() => {
    if (!autocomplete) return [];
    const q = autocomplete.query.trim().toLowerCase();
    const matches = (q ? notes.filter((n) => n.title.toLowerCase().includes(q)) : notes).slice(0, MAX_SUGGESTIONS);
    const list = matches.map((n) => ({ kind: 'existing', title: n.title }));
    const exact = notes.some((n) => n.title.trim().toLowerCase() === q);
    if (autocomplete.query.trim() && !exact) list.push({ kind: 'create', title: autocomplete.query.trim() });
    return list;
  })();

  const insertLink = (title) => {
    setAutocomplete((current) => {
      if (!current) return current;
      const before = value.slice(0, current.start);
      const after = value.slice(current.end);
      const inserted = `[[${title}]]`;
      pendingCaretRef.current = before.length + inserted.length;
      onChange(`${before}${inserted}${after}`);
      return null;
    });
  };

  const chooseCandidate = async (cand) => {
    if (cand.kind === 'create') {
      setCreating(true);
      try {
        const created = await onCreateAndLink(cand.title);
        insertLink(created?.title || cand.title);
      } finally {
        setCreating(false);
      }
    } else {
      insertLink(cand.title);
    }
  };

  const handleKeyDown = (e) => {
    if (!autocomplete || candidates.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAutocomplete((a) => ({ ...a, index: (a.index + 1) % candidates.length }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAutocomplete((a) => ({ ...a, index: (a.index - 1 + candidates.length) % candidates.length }));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      chooseCandidate(candidates[autocomplete.index]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setAutocomplete(null);
    }
  };

  const handleBlur = () => {
    // A mousedown on the dropdown already ran before this blur fires (see
    // onMouseDown={preventDefault} below), so closing here is always safe.
    setAutocomplete(null);
    if (value.trim()) setEditing(false);
  };

  const handleLinkClick = (title) => {
    const target = findNoteByTitle(notes, title);
    if (target) onNavigate(target.id);
    else onCreateAndLink(title).then((created) => created && onNavigate(created.id));
  };

  if (editing) {
    return (
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <AutoResizeTextarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onSelect={handleSelect}
          onClick={handleSelect}
          onBlur={handleBlur}
          placeholder={placeholder}
          style={style}
        />
        {autocomplete && candidates.length > 0 && (
          <div
            onMouseDown={(e) => e.preventDefault()}
            style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 220, maxWidth: 320, zIndex: 30,
              background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
              borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.3)', overflow: 'hidden', padding: 4,
            }}
          >
            {creating && <div style={{ padding: '8px 10px', fontSize: 12.5, color: theme.textMuted }}>{t('notes.linkCreating')}</div>}
            {!creating &&
              candidates.map((cand, i) => (
                <div
                  key={`${cand.kind}-${cand.title}`}
                  onClick={() => chooseCandidate(cand)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 7, cursor: 'pointer', fontSize: 13,
                    background: i === autocomplete.index ? theme.accentSoftBg : 'transparent',
                  }}
                >
                  <Icon name={cand.kind === 'create' ? 'plus' : 'doc'} size={13} color={theme.textMuted} />
                  {cand.kind === 'create' ? (
                    <span style={{ color: theme.textPrimary }}>
                      {t('notes.linkCreateNew', { title: cand.title })}
                    </span>
                  ) : (
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cand.title}</span>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>
    );
  }

  const segments = parseLinkSegments(value);
  return (
    <div
      onClick={() => setEditing(true)}
      style={{ ...style, flex: 1, minWidth: 0, cursor: 'text', whiteSpace: 'pre-wrap', wordBreak: 'break-word', minHeight: '1.6em' }}
    >
      {segments.map((seg, i) => {
        if (seg.type === 'text') return <span key={i}>{seg.value}</span>;
        const resolved = !!findNoteByTitle(notes, seg.value);
        return (
          <span
            key={i}
            onClick={(e) => { e.stopPropagation(); handleLinkClick(seg.value); }}
            title={resolved ? seg.value : t('notes.linkBroken', { title: seg.value })}
            style={{
              cursor: 'pointer', borderRadius: 4, padding: '0 3px', fontWeight: 600,
              color: resolved ? theme.accentText : theme.textMuted,
              background: resolved ? theme.accentSoftBg : 'transparent',
              border: resolved ? 'none' : `1px dashed ${theme.border}`,
            }}
          >
            {seg.value}
          </span>
        );
      })}
    </div>
  );
}
