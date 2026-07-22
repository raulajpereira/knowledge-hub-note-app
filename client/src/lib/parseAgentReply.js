const LANG_MAP = {
  abap: 'abap',
  sql: 'sql',
  js: 'javascript',
  javascript: 'javascript',
  ts: 'javascript',
  typescript: 'javascript',
  jsx: 'javascript',
  tsx: 'javascript',
  json: 'json',
};

function mapLanguage(tag) {
  if (!tag) return 'plaintext';
  return LANG_MAP[tag.trim().toLowerCase()] || 'plaintext';
}

// Splits a chat reply into Notes-style blocks, pulling out ```fenced``` code as code blocks.
export function parseReplyToBlocks(content) {
  const blocks = [];
  const regex = /```(\w+)?\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let counter = 0;
  let match;
  while ((match = regex.exec(content))) {
    const [full, lang, code] = match;
    const textBefore = content.slice(lastIndex, match.index).trim();
    if (textBefore) blocks.push({ id: `p${counter++}`, type: 'text', value: textBefore });
    blocks.push({ id: `p${counter++}`, type: 'code', language: mapLanguage(lang), value: code.replace(/\n$/, '') });
    lastIndex = match.index + full.length;
  }
  const rest = content.slice(lastIndex).trim();
  if (rest) blocks.push({ id: `p${counter++}`, type: 'text', value: rest });
  if (blocks.length === 0) blocks.push({ id: 'p0', type: 'text', value: content });
  return blocks;
}

export function hasCodeBlock(content) {
  return /```/.test(content || '');
}

export function titleFromContent(content, fallback) {
  const candidates = (content || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('```'))
    .map((l) => l.replace(/^#+\s*/, '').replace(/[*_`]/g, ''));

  if (candidates.length === 0) return fallback;
  // Prefer the first line that reads like a real sentence/title over a short filler ("Sure, here you go:").
  const best = candidates.find((l) => l.length >= 20) || candidates[0];
  return best.length > 60 ? `${best.slice(0, 60)}…` : best;
}
