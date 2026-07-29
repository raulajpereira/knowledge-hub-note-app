import JSZip from 'jszip';
import {
  escapeXml,
  replaceExactRunText,
  replaceNthExactRunText,
  replaceContentControlText,
} from './xmlHelpers.js';
import { getImageDimensions, scaleToMaxWidthEmu } from './imageInfo.js';

const MAX_IMAGE_WIDTH_EMU = 5486400; // 6in, fits within the body text width

function formatDateValue(v) {
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return v;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

class FillState {
  constructor(zip, documentXml, relsXml, contentTypesXml) {
    this.zip = zip;
    this.documentXml = documentXml;
    this.relsXml = relsXml;
    this.contentTypesXml = contentTypesXml;
    this.nextRelId = this._computeNextRelId();
    this.nextMediaIndex = this._computeNextMediaIndex();
  }

  _computeNextRelId() {
    const ids = [...this.relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
    return (ids.length ? Math.max(...ids) : 0) + 1;
  }

  _computeNextMediaIndex() {
    const names = Object.keys(this.zip.files).filter((n) => n.startsWith('word/media/image'));
    const nums = names.map((n) => Number((/image(\d+)\./.exec(n) || [])[1])).filter((n) => !Number.isNaN(n));
    return (nums.length ? Math.max(...nums) : 0) + 1;
  }

  ensureContentType(ext) {
    const pattern = new RegExp(`<Default Extension="${ext}"`);
    if (pattern.test(this.contentTypesXml)) return;
    this.contentTypesXml = this.contentTypesXml.replace(
      '</Types>',
      `<Default Extension="${ext}" ContentType="image/${ext === 'jpg' ? 'jpeg' : ext}"/></Types>`,
    );
  }

  registerImage(buffer, ext) {
    const normalizedExt = ext === 'jpg' ? 'jpeg' : ext;
    this.ensureContentType(normalizedExt === 'jpeg' ? 'jpeg' : normalizedExt);
    const filename = `image${this.nextMediaIndex}.${normalizedExt}`;
    this.nextMediaIndex += 1;
    this.zip.file(`word/media/${filename}`, buffer);
    const rId = `rId${this.nextRelId}`;
    this.nextRelId += 1;
    this.relsXml = this.relsXml.replace(
      '</Relationships>',
      `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${filename}"/></Relationships>`,
    );
    return rId;
  }
}

// --- paragraph / table lookups on the raw document.xml string ---

function findParagraphsByStyle(xml, styleName) {
  const results = [];
  const stylePattern = new RegExp(`<w:pStyle w:val="${styleName}"/>`, 'g');
  let m;
  while ((m = stylePattern.exec(xml))) {
    const start = xml.lastIndexOf('<w:p ', m.index);
    const end = xml.indexOf('</w:p>', m.index) + '</w:p>'.length;
    const text = [...xml.slice(start, end).matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/gs)].map((x) => x[1]).join('');
    results.push({ start, end, text });
  }
  return results.sort((a, b) => a.start - b.start);
}

function findParagraphWithExactText(xml, text) {
  const paraPattern = /<w:p\b[^>]*>.*?<\/w:p>/gs;
  let m;
  while ((m = paraPattern.exec(xml))) {
    const t = [...m[0].matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/gs)].map((x) => x[1]).join('');
    if (t === text) return { start: m.index, end: m.index + m[0].length };
  }
  return null;
}

function findTableAfter(xml, afterIndex) {
  const start = xml.indexOf('<w:tbl>', afterIndex);
  if (start === -1) return null;
  const end = xml.indexOf('</w:tbl>', start) + '</w:tbl>'.length;
  return { start, end, xml: xml.slice(start, end) };
}

function getRows(tableXml) {
  return [...tableXml.matchAll(/<w:tr\b.*?<\/w:tr>/gs)].map((m) => ({ start: m.index, end: m.index + m[0].length, xml: m[0] }));
}

function getCells(rowXml) {
  return [...rowXml.matchAll(/<w:tc>.*?<\/w:tc>/gs)].map((m) => ({ start: m.index, end: m.index + m[0].length, xml: m[0] }));
}

function getCellText(cellXml) {
  return [...cellXml.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/gs)].map((m) => m[1]).join('');
}

function setCellFirstRunText(cellXml, value) {
  let replaced = false;
  return cellXml.replace(/(<w:t(?:\s[^>]*)?>)(.*?)(<\/w:t>)/s, (match, open, _old, close) => {
    if (replaced) return match;
    replaced = true;
    return `${open}${escapeXml(value)}${close}`;
  });
}

// --- block (rich text/code/image) -> OOXML paragraphs ---

function textParagraphs(text) {
  const lines = String(text || '').split('\n');
  return lines
    .map((line) => `<w:p><w:pPr><w:pStyle w:val="PargrafodaLista"/><w:spacing w:before="160" w:after="160"/><w:ind w:left="0"/><w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr></w:pPr>${
      line ? `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>` : ''
    }</w:p>`)
    .join('');
}

function codeParagraphs(code) {
  const lines = String(code || '').split('\n');
  return lines
    .map((line, i) => {
      const spacing = i === 0 && i === lines.length - 1
        ? '<w:spacing w:before="160" w:after="160"/>'
        : i === 0
          ? '<w:spacing w:before="160" w:after="0"/>'
          : i === lines.length - 1
            ? '<w:spacing w:before="0" w:after="160"/>'
            : '<w:spacing w:before="0" w:after="0"/>';
      return `<w:p><w:pPr><w:pStyle w:val="PargrafodaLista"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>${spacing}<w:ind w:left="0"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">${escapeXml(line.replace(/\t/g, '    ')) || ' '}</w:t></w:r></w:p>`;
    })
    .join('');
}

async function imageParagraph(state, url, resolveImagePath) {
  const filePath = resolveImagePath(url);
  if (!filePath) return '';
  const fs = await import('node:fs/promises');
  let buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch {
    return '';
  }
  const { width, height, ext } = getImageDimensions(buffer);
  const { cx, cy } = scaleToMaxWidthEmu(width, height, MAX_IMAGE_WIDTH_EMU);
  const rId = state.registerImage(buffer, ext);
  const docPrId = Math.floor(Math.random() * 1_000_000) + 100000;
  return `<w:p><w:pPr><w:pStyle w:val="PargrafodaLista"/><w:spacing w:before="160" w:after="160"/><w:ind w:left="0"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${docPrId}" name="Picture ${docPrId}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="Picture ${docPrId}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

async function blocksToParagraphs(state, blocks, resolveImagePath) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return '<w:p><w:pPr><w:pStyle w:val="PargrafodaLista"/><w:ind w:left="0"/></w:pPr></w:p>';
  }
  const parts = [];
  for (const block of blocks) {
    if (block.type === 'text' && block.value) parts.push(textParagraphs(block.value));
    else if (block.type === 'code' && block.value) parts.push(codeParagraphs(block.value));
    else if (block.type === 'image' && block.value) parts.push(await imageParagraph(state, block.value, resolveImagePath));
  }
  return parts.join('') || '<w:p><w:pPr><w:pStyle w:val="PargrafodaLista"/><w:ind w:left="0"/></w:pPr></w:p>';
}

// --- anchor handlers ---

function applyLabelParagraph(state, field, value) {
  if (!value) return;
  state.documentXml = replaceExactRunText(state.documentXml, field.anchor.text, value);
}

function applyContentControl(state, field, value) {
  if (!value) return;
  state.documentXml = replaceContentControlText(state.documentXml, field.anchor.tag, value);
}

function applyLiteral(state, field, value) {
  if (!value) return;
  const formatted = field.type === 'date' ? formatDateValue(value) : value;
  state.documentXml = replaceNthExactRunText(state.documentXml, field.anchor.text, field.anchor.occurrence || 1, formatted);
}

async function applyHeading(state, field, value, resolveImagePath) {
  let headings = findParagraphsByStyle(state.documentXml, 'ITtitle');
  let idx = headings.findIndex((h) => h.text === field.anchor.text);
  if (idx === -1) return;

  // The ITtitle style carries no spacing of its own, so the gap above each
  // chapter title otherwise depends entirely on whatever paragraph happens
  // to precede it (a table, an untouched template stub, a shaded code
  // block) and ends up inconsistent between chapters. Force it explicitly.
  const heading = headings[idx];
  const headingXml = state.documentXml.slice(heading.start, heading.end);
  const pPrEnd = headingXml.indexOf('</w:pPr>');
  if (pPrEnd !== -1 && !/<w:spacing\b/.test(headingXml.slice(0, pPrEnd))) {
    const updated = headingXml.replace('<w:pStyle w:val="ITtitle"/>', '<w:pStyle w:val="ITtitle"/><w:spacing w:before="160" w:after="160"/>');
    state.documentXml = state.documentXml.slice(0, heading.start) + updated + state.documentXml.slice(heading.end);
    headings = findParagraphsByStyle(state.documentXml, 'ITtitle');
    idx = headings.findIndex((h) => h.text === field.anchor.text);
  }

  const regionStart = headings[idx].end;
  const regionEnd = idx + 1 < headings.length ? headings[idx + 1].start : regionStart;
  const paragraphs = await blocksToParagraphs(state, value, resolveImagePath);
  state.documentXml = state.documentXml.slice(0, regionStart) + paragraphs + state.documentXml.slice(regionEnd);
}

function applyFixedTable(state, field, value) {
  const anchorPara = findParagraphWithExactText(state.documentXml, field.anchor.afterText);
  if (!anchorPara) return;
  const table = findTableAfter(state.documentXml, anchorPara.end);
  if (!table) return;
  let tableXml = table.xml;
  const rows = getRows(tableXml);
  const rowData = value && typeof value === 'object' ? value : {};

  // Walk rows back-to-front so earlier splice offsets stay valid.
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const cells = getCells(rows[i].xml);
    if (cells.length < 2) continue;
    const rowLabel = getCellText(cells[1].xml).trim();
    const matchingRow = field.rows.find((r) => r.label === rowLabel);
    if (!matchingRow) continue;
    const data = rowData[matchingRow.key] || {};
    let newRowXml = rows[i].xml;
    // Replace cells back-to-front too.
    const columnCellIndexes = field.columns.map((_, ci) => ci + 2);
    for (let ci = field.columns.length - 1; ci >= 0; ci -= 1) {
      const cellIdx = columnCellIndexes[ci];
      if (cellIdx >= cells.length) continue;
      const col = field.columns[ci];
      const raw = data[col.key];
      if (!raw) continue;
      const formatted = col.type === 'date' ? formatDateValue(raw) : raw;
      const newCellXml = setCellFirstRunText(cells[cellIdx].xml, formatted);
      newRowXml = newRowXml.slice(0, cells[cellIdx].start) + newCellXml + newRowXml.slice(cells[cellIdx].end);
    }
    tableXml = tableXml.slice(0, rows[i].start) + newRowXml + tableXml.slice(rows[i].end);
  }
  state.documentXml = state.documentXml.slice(0, table.start) + tableXml + state.documentXml.slice(table.end);
}

function applyRepeatableTable(state, field, value) {
  const anchorPara = findParagraphWithExactText(state.documentXml, field.anchor.afterText);
  if (!anchorPara) return;
  const table = findTableAfter(state.documentXml, anchorPara.end);
  if (!table) return;
  const tableXml = table.xml;
  const rows = getRows(tableXml);
  if (rows.length < 2) return;
  const headerRow = rows[0];
  const templateRow = rows[1];
  const dataRows = Array.isArray(value) ? value : [];

  const built = dataRows.map((entry, idx) => {
    const cells = getCells(templateRow.xml);
    let rowXml = templateRow.xml;
    // Row-number cell (index 0), back-to-front for the rest.
    for (let ci = field.columns.length - 1; ci >= 0; ci -= 1) {
      const cellIdx = ci + 1;
      if (cellIdx >= cells.length) continue;
      const col = field.columns[ci];
      const raw = entry[col.key] || '';
      const newCellXml = setCellFirstRunText(cells[cellIdx].xml, raw);
      rowXml = rowXml.slice(0, cells[cellIdx].start) + newCellXml + rowXml.slice(cells[cellIdx].end);
    }
    const numberCell = getCells(rowXml)[0];
    if (numberCell) {
      const newNumberCell = setCellFirstRunText(numberCell.xml, String(idx + 1));
      rowXml = rowXml.slice(0, numberCell.start) + newNumberCell + rowXml.slice(numberCell.end);
    }
    // Give every clone unique paragraph/sdt ids so Word doesn't collide them.
    rowXml = rowXml.replace(/w14:paraId="[0-9A-F]+"/g, () => `w14:paraId="${randomHexId()}"`);
    rowXml = rowXml.replace(/w14:textId="[0-9A-F]+"/g, () => `w14:textId="${randomHexId()}"`);
    rowXml = rowXml.replace(/<w:id w:val="-?\d+"\/>/g, () => `<w:id w:val="${Math.floor(Math.random() * 2_000_000_000)}"/>`);
    return rowXml;
  });

  const newTableXml = tableXml.slice(0, headerRow.end) + built.join('') + tableXml.slice(rows[rows.length - 1].end);
  state.documentXml = state.documentXml.slice(0, table.start) + newTableXml + state.documentXml.slice(table.end);
}

function randomHexId() {
  // Word's paraId/textId schema requires the value stay below 0x80000000.
  return Math.floor(Math.random() * 0x7fffffff).toString(16).toUpperCase().padStart(8, '0');
}

async function applyShapeFill(state, field, value, resolveImagePath) {
  if (!value) return;
  const filePath = resolveImagePath(value);
  if (!filePath) return;
  const fs = await import('node:fs/promises');
  let buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch {
    return;
  }
  const { ext } = getImageDimensions(buffer);
  const rId = state.registerImage(buffer, ext);

  const namePattern = new RegExp(`<wp:docPr[^>]*name="${field.anchor.shapeName}"[^>]*/>.*?<a:solidFill>.*?</a:solidFill>`, 's');
  state.documentXml = state.documentXml.replace(namePattern, (match) =>
    match.replace(/<a:solidFill>.*?<\/a:solidFill>/s, `<a:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>`));

  // Clear the "Logótipo do Cliente" caption text inside that same shape's textbox.
  const shapeStart = state.documentXml.indexOf(`name="${field.anchor.shapeName}"`);
  if (shapeStart !== -1) {
    const txbxStart = state.documentXml.indexOf('<w:txbxContent>', shapeStart);
    const txbxEnd = state.documentXml.indexOf('</w:txbxContent>', txbxStart);
    if (txbxStart !== -1 && txbxEnd !== -1) {
      const cleared = state.documentXml.slice(txbxStart, txbxEnd).replace(/<w:t(?:\s[^>]*)?>.*?<\/w:t>/gs, '<w:t></w:t>');
      state.documentXml = state.documentXml.slice(0, txbxStart) + cleared + state.documentXml.slice(txbxEnd);
    }
  }
}

export async function fillDocx(sourceBuffer, template, fieldsData, { resolveImagePath }) {
  const zip = await JSZip.loadAsync(sourceBuffer);
  const documentXml = await zip.file('word/document.xml').async('string');
  const relsXml = await zip.file('word/_rels/document.xml.rels').async('string');
  const contentTypesXml = await zip.file('[Content_Types].xml').async('string');
  const state = new FillState(zip, documentXml, relsXml, contentTypesXml);

  for (const field of template.fields) {
    const value = fieldsData[field.key];
    switch (field.anchor.type) {
      case 'labelParagraph':
        applyLabelParagraph(state, field, value);
        break;
      case 'contentControl':
        applyContentControl(state, field, value);
        break;
      case 'literal':
        applyLiteral(state, field, value);
        break;
      case 'heading':
        await applyHeading(state, field, value, resolveImagePath);
        break;
      case 'table':
        if (field.type === 'fixedTable') applyFixedTable(state, field, value);
        else if (field.type === 'repeatableTable') applyRepeatableTable(state, field, value);
        break;
      case 'shapeFill':
        await applyShapeFill(state, field, value, resolveImagePath);
        break;
      default:
        break;
    }
  }

  zip.file('word/document.xml', state.documentXml);
  zip.file('word/_rels/document.xml.rels', state.relsXml);
  zip.file('[Content_Types].xml', state.contentTypesXml);
  return zip.generateAsync({ type: 'nodebuffer' });
}
