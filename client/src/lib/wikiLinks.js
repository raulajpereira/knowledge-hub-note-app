// [[Note Title]] wiki-style links, resolved by matching against other
// notes' titles (case-insensitive). No separate link table — links are
// parsed on the fly from block text, so they can never drift out of sync
// with the notes themselves.
const LINK_PATTERN = /\[\[([^[\]]+)\]\]/g;

export function parseLinkSegments(text) {
  const segments = [];
  let lastIndex = 0;
  const re = new RegExp(LINK_PATTERN);
  let match;
  while ((match = re.exec(text))) {
    if (match.index > lastIndex) segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    segments.push({ type: 'link', value: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ type: 'text', value: text.slice(lastIndex) });
  return segments;
}

function textBlockValues(note) {
  if (Array.isArray(note.blocks) && note.blocks.length > 0) {
    return note.blocks.filter((b) => b.type === 'text').map((b) => b.value || '');
  }
  return [note.content || ''];
}

function noteLinksToTitle(note, targetTitleLower) {
  return textBlockValues(note).some((text) =>
    parseLinkSegments(text).some((seg) => seg.type === 'link' && seg.value.toLowerCase() === targetTitleLower)
  );
}

export function findBacklinks(notes, targetTitle, excludeId) {
  const targetLower = targetTitle.trim().toLowerCase();
  if (!targetLower) return [];
  return notes.filter((n) => n.id !== excludeId && noteLinksToTitle(n, targetLower));
}

export function findNoteByTitle(notes, title) {
  const lower = title.trim().toLowerCase();
  if (!lower) return null;
  return notes.find((n) => n.title.trim().toLowerCase() === lower) || null;
}

// Pure — returns { id, blocks, content } patches for notes whose
// [[oldTitle]] links need to become [[newTitle]]. Caller persists them.
export function renameLinksInNotes(notes, oldTitle, newTitle, excludeId) {
  const oldLower = oldTitle.trim().toLowerCase();
  const newLower = newTitle.trim().toLowerCase();
  if (!oldLower || oldLower === newLower) return [];

  const patches = [];
  for (const note of notes) {
    if (note.id === excludeId) continue;
    let changed = false;
    const hasBlocks = Array.isArray(note.blocks) && note.blocks.length > 0;
    const sourceBlocks = hasBlocks ? note.blocks : [{ id: 'legacy', type: 'text', value: note.content || '' }];
    const nextBlocks = sourceBlocks.map((b) => {
      if (b.type !== 'text' || !b.value) return b;
      const replaced = b.value.replace(LINK_PATTERN, (full, title) => {
        if (title.trim().toLowerCase() === oldLower) {
          changed = true;
          return `[[${newTitle}]]`;
        }
        return full;
      });
      return replaced === b.value ? b : { ...b, value: replaced };
    });
    if (changed) {
      const content = nextBlocks
        .filter((b) => b.type !== 'image')
        .map((b) => b.value || '')
        .join('\n\n')
        .trim();
      patches.push({ id: note.id, blocks: nextBlocks, content });
    }
  }
  return patches;
}
