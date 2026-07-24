import { prisma } from './prisma.js';

// Small, hand-picked stopword lists (PT + EN) — good enough to keep short
// connector words from diluting the keyword match; not meant to be exhaustive.
const STOPWORDS = new Set([
  'a', 'o', 'os', 'as', 'de', 'da', 'do', 'das', 'dos', 'em', 'um', 'uma', 'uns', 'umas',
  'para', 'com', 'que', 'e', 'ou', 'no', 'na', 'nos', 'nas', 'por', 'como', 'mais', 'meu',
  'minha', 'teu', 'tua', 'onde', 'quando', 'qual', 'quais', 'foi', 'era', 'ser', 'está', 'esta',
  'the', 'an', 'of', 'in', 'on', 'for', 'to', 'and', 'or', 'is', 'are', 'was', 'were', 'be',
  'what', 'where', 'how', 'when', 'which', 'my', 'your', 'that', 'this', 'about',
]);

function stripAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function extractKeywords(text) {
  const words = stripAccents(text.toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return [...new Set(words)];
}

function scoreText(haystack, keywords, weight) {
  const h = stripAccents((haystack || '').toLowerCase());
  return keywords.reduce((sum, kw) => sum + (h.includes(kw) ? weight : 0), 0);
}

function snippetAround(text, keywords, maxLen = 600) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  const lower = stripAccents(text.toLowerCase());
  let idx = -1;
  for (const kw of keywords) {
    idx = lower.indexOf(kw);
    if (idx !== -1) break;
  }
  if (idx === -1) return `${text.slice(0, maxLen)}…`;
  const start = Math.max(0, idx - 200);
  return `${start > 0 ? '…' : ''}${text.slice(start, start + maxLen)}…`;
}

// Provider-agnostic retrieval: plain keyword scoring over the user's own
// content, no embeddings/vector index needed. This means the "ask your
// workspace" feature works with whatever chat-completion agent is already
// configured (Claude, a free Groq key, anything OpenAI-compatible) instead
// of forcing a specific provider just to generate embeddings.
export async function searchWorkspace(effectiveUserId, query, limit = 6) {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  const [notes, codeItems, issues, tasks] = await Promise.all([
    prisma.note.findMany({
      where: { userId: effectiveUserId, deletedAt: null },
      select: { id: true, title: true, content: true },
    }),
    prisma.codeItem.findMany({
      where: { userId: effectiveUserId },
      select: { id: true, name: true, content: true, folderId: true, folder: { select: { name: true } } },
    }),
    prisma.issue.findMany({
      where: { userId: effectiveUserId },
      select: { id: true, title: true, description: true, notes: true, status: true },
    }),
    prisma.task.findMany({
      where: { userId: effectiveUserId, deletedAt: null },
      select: { id: true, title: true, notes: true, status: true },
    }),
  ]);

  const candidates = [];

  for (const n of notes) {
    const s = scoreText(n.title, keywords, 3) + scoreText(n.content, keywords, 1);
    if (s > 0) candidates.push({ type: 'note', id: n.id, title: n.title, body: n.content || '', score: s });
  }
  for (const c of codeItems) {
    const s = scoreText(c.name, keywords, 3) + scoreText(c.content, keywords, 1);
    if (s > 0) {
      candidates.push({
        type: 'code', id: c.id, folderId: c.folderId,
        title: c.folder?.name ? `${c.name} (${c.folder.name})` : c.name,
        body: c.content || '', score: s,
      });
    }
  }
  for (const i of issues) {
    const body = `${i.description || ''} ${i.notes || ''}`.trim();
    const s = scoreText(i.title, keywords, 3) + scoreText(body, keywords, 1);
    if (s > 0) candidates.push({ type: 'issue', id: i.id, title: `${i.title} [${i.status}]`, body, score: s });
  }
  for (const tk of tasks) {
    const s = scoreText(tk.title, keywords, 3) + scoreText(tk.notes, keywords, 1);
    if (s > 0) candidates.push({ type: 'task', id: tk.id, title: `${tk.title} [${tk.status}]`, body: tk.notes || '', score: s });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit).map((c) => ({
    type: c.type,
    id: c.id,
    folderId: c.folderId,
    title: c.title,
    snippet: snippetAround(c.body, keywords),
  }));
}

const TYPE_LABEL = { note: 'Nota', code: 'Código', issue: 'Issue', task: 'Tarefa' };

export function buildWorkspaceContext(results) {
  if (results.length === 0) return null;
  return results.map((r) => `[${TYPE_LABEL[r.type]}] ${r.title}\n${r.snippet}`).join('\n\n---\n\n');
}
