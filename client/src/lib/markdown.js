// Small, dependency-free HTML <-> Markdown conversion. Not a full CommonMark
// implementation — just enough to round-trip what the Notes WYSIWYG editor
// actually produces (headings, bold/italic/underline, links, lists, code,
// paragraphs) so notes can move in and out of plain-text tools.

export function htmlToMarkdown(html) {
  if (!html) return '';
  const container = document.createElement('div');
  container.innerHTML = html;

  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const children = Array.from(node.childNodes).map(walk).join('');
    switch (node.tagName) {
      case 'H1': return `\n# ${children}\n`;
      case 'H2': return `\n## ${children}\n`;
      case 'H3': return `\n### ${children}\n`;
      case 'STRONG': case 'B': return `**${children}**`;
      case 'EM': case 'I': return `*${children}*`;
      case 'U': return `_${children}_`;
      case 'CODE': return `\`${children}\``;
      case 'PRE': return `\n\`\`\`\n${node.textContent}\n\`\`\`\n`;
      case 'A': return `[${children}](${node.getAttribute('href') || ''})`;
      case 'LI': return `- ${children}\n`;
      case 'UL': case 'OL': return `\n${children}\n`;
      case 'BR': return '\n';
      case 'P': case 'DIV': return `${children}\n\n`;
      case 'IMG': return `![${node.getAttribute('alt') || ''}](${node.getAttribute('src') || ''})`;
      default: return children;
    }
  };

  return walk(container).replace(/\n{3,}/g, '\n\n').trim();
}

export function markdownToHtml(md) {
  if (!md) return '';
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let inList = false;
  let inCode = false;

  const inlineFmt = (line) =>
    line
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');

  for (const raw of lines) {
    const line = raw;
    if (line.trim().startsWith('```')) {
      if (!inCode) { out.push('<pre><code>'); inCode = true; }
      else { out.push('</code></pre>'); inCode = false; }
      continue;
    }
    if (inCode) { out.push(`${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}\n`); continue; }

    const heading = line.match(/^(#{1,3})\s+(.*)/);
    const listItem = line.match(/^[-*]\s+(.*)/);

    if (heading) {
      if (inList) { out.push('</ul>'); inList = false; }
      const level = heading[1].length;
      out.push(`<h${level}>${inlineFmt(heading[2])}</h${level}>`);
    } else if (listItem) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineFmt(listItem[1])}</li>`);
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      if (line.trim()) out.push(`<p>${inlineFmt(line)}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}
