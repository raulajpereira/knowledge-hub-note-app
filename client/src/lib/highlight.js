const KEYWORDS = {
  abap: [
    'REPORT', 'DATA', 'TYPES', 'BEGIN', 'END', 'OF', 'CLASS', 'METHOD', 'METHODS', 'ENDMETHOD', 'ENDCLASS',
    'IF', 'ELSE', 'ELSEIF', 'ENDIF', 'LOOP', 'ENDLOOP', 'SELECT', 'FROM', 'WHERE', 'INTO', 'TABLE', 'TABLES',
    'PERFORM', 'FORM', 'ENDFORM', 'CALL', 'FUNCTION', 'EXPORTING', 'IMPORTING', 'CHANGING', 'RETURNING',
    'PUBLIC', 'PRIVATE', 'PROTECTED', 'SECTION', 'DEFINITION', 'IMPLEMENTATION', 'CREATE', 'OBJECT',
    'TRY', 'CATCH', 'ENDTRY', 'CASE', 'WHEN', 'ENDCASE', 'WRITE', 'MOVE', 'CONCATENATE', 'SPLIT', 'APPEND',
    'READ', 'MODIFY', 'DELETE', 'INSERT', 'SORT', 'CLEAR', 'FREE', 'CHECK', 'EXIT', 'CONTINUE', 'RETURN',
    'RAISE', 'EXCEPTION', 'TYPE', 'LIKE', 'VALUE', 'CONSTANTS', 'PARAMETERS', 'SELECT-OPTIONS',
    'START-OF-SELECTION', 'END-OF-SELECTION', 'INITIALIZATION', 'AT', 'EVENT', 'ON', 'CHANGE', 'AND', 'OR', 'NOT',
    'IS', 'INITIAL', 'BOUND', 'ABAP_TRUE', 'ABAP_FALSE', 'ABAP_BOOL', 'REF', 'FIELD-SYMBOL', 'ASSIGN', 'ENDWITH',
  ],
  sql: [
    'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE',
    'ALTER', 'DROP', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'ON', 'GROUP', 'BY', 'ORDER', 'HAVING',
    'AND', 'OR', 'NOT', 'NULL', 'AS', 'DISTINCT', 'LIMIT', 'UNION', 'ALL', 'IN', 'EXISTS', 'BETWEEN', 'LIKE',
  ],
  javascript: [
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case',
    'break', 'continue', 'class', 'extends', 'new', 'this', 'import', 'export', 'default', 'from', 'as',
    'async', 'await', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'null', 'undefined', 'true', 'false',
  ],
  json: ['true', 'false', 'null'],
};

const COLORS = {
  keyword: { dark: 'oklch(0.75 0.16 300)', light: 'oklch(0.5 0.2 300)' },
  string: { dark: 'oklch(0.78 0.14 145)', light: 'oklch(0.5 0.14 145)' },
  comment: { dark: 'oklch(0.55 0.02 280)', light: 'oklch(0.55 0.02 280)' },
  number: { dark: 'oklch(0.78 0.14 60)', light: 'oklch(0.5 0.16 60)' },
  default: null,
};

export function tokenColor(type, dark) {
  const entry = COLORS[type];
  if (!entry) return undefined;
  return dark ? entry.dark : entry.light;
}

function isCommentLine(line, language) {
  const trimmed = line.trimStart();
  if (language === 'abap') return trimmed.startsWith('*') || trimmed.startsWith('"');
  if (language === 'sql') return trimmed.startsWith('--');
  if (language === 'javascript') return trimmed.startsWith('//');
  return false;
}

export function highlightLine(line, language) {
  if (language === 'plaintext' || !language) return [{ text: line, type: 'default' }];
  if (isCommentLine(line, language)) return [{ text: line, type: 'comment' }];

  const keywords = new Set((KEYWORDS[language] || []).map((k) => k.toUpperCase()));
  const tokens = [];
  const regex = /(\s+)|('[^']*'|"[^"]*")|(\b\d+(\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_-]*)|(.)/g;
  let match;
  while ((match = regex.exec(line))) {
    const [full, space, string, number, , word, other] = match;
    if (space !== undefined) tokens.push({ text: full, type: 'default' });
    else if (string !== undefined) tokens.push({ text: full, type: 'string' });
    else if (number !== undefined) tokens.push({ text: full, type: 'number' });
    else if (word !== undefined) {
      const isKeyword = language === 'json' ? keywords.has(word.toLowerCase()) : keywords.has(word.toUpperCase());
      tokens.push({ text: full, type: isKeyword ? 'keyword' : 'default' });
    } else if (other !== undefined) tokens.push({ text: full, type: 'default' });
  }
  return tokens;
}

export function highlightCode(code, language) {
  return (code || '').split('\n').map((line) => highlightLine(line, language));
}

export const LANGUAGES = [
  { id: 'abap', label: 'ABAP' },
  { id: 'sql', label: 'SQL' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'json', label: 'JSON' },
  { id: 'plaintext', label: 'Plain Text' },
];
