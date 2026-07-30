export function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n/g, '\n')
    .replace(/[\n\t]/g, ' ');
}

export function escapeXmlPreserveNewlines(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n/g, '\n');
}

// Replace every run whose text equals `label` exactly (across the whole
// document, including any mc:Fallback duplicate) with `value`.
export function replaceExactRunText(xml, label, value) {
  const needle = escapeXml(label);
  const replacement = escapeXml(value);
  const pattern = new RegExp(`(<w:t(?:\\s[^>]*)?>)${escapeRegex(needle)}(</w:t>)`, 'g');
  return xml.replace(pattern, (_, open, close) => `${open}${replacement}${close}`);
}

// Replace the Nth (1-based) run whose text equals `literal` exactly.
export function replaceNthExactRunText(xml, literal, occurrence, value) {
  const needle = escapeXml(literal);
  const replacement = escapeXml(value);
  const pattern = new RegExp(`(<w:t(?:\\s[^>]*)?>)${escapeRegex(needle)}(</w:t>)`, 'g');
  let count = 0;
  return xml.replace(pattern, (match, open, close) => {
    count += 1;
    if (count === occurrence) return `${open}${replacement}${close}`;
    return match;
  });
}

// Like replaceExactRunText, but for labels Word has split across multiple
// adjacent runs within the same paragraph (e.g. a spell-check boundary) —
// replaceExactRunText can only match a label that survives as one whole
// run's text, so this compares the paragraph's *concatenated* text instead,
// puts the value in the first run, and blanks the rest of the paragraph's
// runs so their fragments don't linger.
export function replaceExactParagraphText(xml, label, value) {
  const replacement = escapeXml(value);
  return xml.replace(/<w:p\b[^>]*>.*?<\/w:p>/gs, (paragraph) => {
    const runTexts = [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/gs)];
    if (runTexts.length < 2) return paragraph;
    const concatenated = runTexts.map((m) => m[1]).join('');
    if (concatenated !== label) return paragraph;
    let first = true;
    return paragraph.replace(/(<w:t(?:\s[^>]*)?>)(.*?)(<\/w:t>)/gs, (match, open, _old, close) => {
      const text = first ? replacement : '';
      first = false;
      return `${open}${text}${close}`;
    });
  });
}

// Replace the display text of every content control identified by `tag`.
export function replaceContentControlText(xml, tag, value) {
  const replacement = escapeXml(value);
  const tagPattern = new RegExp(`<w:tag w:val="${escapeRegex(escapeXml(tag))}"/>`, 'g');
  let result = '';
  let cursor = 0;
  let match;
  while ((match = tagPattern.exec(xml))) {
    const contentStart = xml.indexOf('<w:sdtContent>', match.index);
    if (contentStart === -1) continue;
    const contentEnd = xml.indexOf('</w:sdtContent>', contentStart);
    if (contentEnd === -1) continue;
    const before = xml.slice(cursor, contentStart);
    let content = xml.slice(contentStart, contentEnd);
    content = content.replace(/(<w:t(?:\s[^>]*)?>)(.*?)(<\/w:t>)/, (_, open, __, close) => `${open}${replacement}${close}`);
    result += before + content;
    cursor = contentEnd;
  }
  result += xml.slice(cursor);
  return result;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
