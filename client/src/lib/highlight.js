const KEYWORDS = {
  abap: [
    // Program/include structure
    'REPORT', 'PROGRAM', 'INCLUDE', 'FUNCTION-POOL', 'INTERFACE-POOL', 'TYPE-POOL', 'TYPE-POOLS',
    // Declarations
    'DATA', 'TYPES', 'CONSTANTS', 'STATICS', 'FIELD-SYMBOLS', 'PARAMETERS', 'PARAMETER', 'SELECT-OPTIONS',
    'BEGIN', 'END', 'OF', 'OCCURS', 'VALUE', 'LIKE', 'TYPE', 'REF', 'RANGE', 'RANGES', 'TABLES', 'STRUCTURE',
    'LENGTH', 'DECIMALS', 'OPTIONAL', 'DEFAULT', 'OBLIGATORY', 'LOWER', 'CASE', 'VISIBLE',
    // Control flow
    'IF', 'ELSE', 'ELSEIF', 'ENDIF', 'CASE', 'WHEN', 'OTHERS', 'ENDCASE',
    'DO', 'ENDDO', 'TIMES', 'WHILE', 'ENDWHILE', 'LOOP', 'ENDLOOP', 'AT', 'FIRST', 'LAST', 'NEW-PAGE', 'NEW-LINE',
    'EXIT', 'CONTINUE', 'CHECK', 'STOP', 'RETURN', 'WAIT', 'UP', 'TO',
    // Procedures / OO
    'FORM', 'ENDFORM', 'PERFORM', 'USING', 'CHANGING', 'TABLES', 'CLASS', 'ENDCLASS', 'METHOD', 'METHODS', 'ENDMETHOD',
    'CLASS-METHODS', 'CLASS-DATA', 'PUBLIC', 'PRIVATE', 'PROTECTED', 'SECTION', 'DEFINITION', 'IMPLEMENTATION',
    'INHERITING', 'FROM', 'ABSTRACT', 'FINAL', 'CREATE', 'OBJECT', 'INSTANCE', 'INTERFACES', 'ALIASES',
    'EXPORTING', 'IMPORTING', 'RETURNING', 'RAISING', 'CALL', 'FUNCTION', 'EXCEPTIONS', 'DESTINATION',
    // Exceptions
    'TRY', 'CATCH', 'CLEANUP', 'ENDTRY', 'RAISE', 'EXCEPTION', 'RESUMABLE', 'MESSAGE',
    // Open SQL
    'SELECT', 'SINGLE', 'DISTINCT', 'FROM', 'INTO', 'CORRESPONDING', 'FIELDS', 'WHERE', 'GROUP', 'BY', 'HAVING',
    'ORDER', 'ASCENDING', 'DESCENDING', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'ON', 'AS', 'UNION', 'ALL',
    'INSERT', 'UPDATE', 'MODIFY', 'DELETE', 'COMMIT', 'ROLLBACK', 'WORK', 'CLIENT', 'SPECIFIED', 'FOR',
    'ENDSELECT', 'UP', 'ROWS', 'BYPASSING', 'BUFFER', 'IS', 'NULL', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'EXISTS',
    // Internal table operations
    'APPEND', 'COLLECT', 'SORT', 'READ', 'INDEX', 'BINARY', 'SEARCH', 'CLEAR', 'REFRESH', 'FREE', 'CONCATENATE',
    'SPLIT', 'CONDENSE', 'REPLACE', 'FIND', 'TRANSLATE', 'SHIFT', 'ASSIGN', 'UNASSIGN', 'COMPONENT', 'WITH',
    'LOOP', 'GROUP', 'ITAB', 'LINE', 'LINES', 'INITIAL', 'SORTED', 'HASHED', 'STANDARD', 'KEY', 'SECONDARY',
    // Arithmetic / assignment
    'MOVE', 'MOVE-CORRESPONDING', 'COMPUTE', 'ADD', 'SUBTRACT', 'MULTIPLY', 'DIVIDE', 'WRITE', 'AND', 'OR', 'NOT',
    'EQ', 'NE', 'LT', 'LE', 'GT', 'GE', 'CO', 'CN', 'CA', 'NA', 'CS', 'NS', 'CP', 'NP',
    // ABAP 7.40+ constructs
    'DATA', 'FIELD-SYMBOL', 'CONV', 'COND', 'SWITCH', 'VALUE', 'REDUCE', 'FILTER', 'NEW', 'CAST', 'LET', 'THEN',
    'FOR', 'IN', 'UNTIL', 'BASE', 'CORRESPONDING', 'XSDBOOL', 'BOOLC', 'LINE_EXISTS', 'LINE_INDEX',
    // Messages / logging
    'MESSAGE', 'TYPE', 'DISPLAY', 'LIKE', 'ID', 'NUMBER', 'WITH', 'INTO', 'S', 'E', 'W', 'I', 'A', 'X',
    'SY-SUBRC', 'SY-TABIX', 'SY-INDEX', 'SY-UNAME', 'SY-DATUM', 'SY-UZEIT', 'SY-MANDT', 'SY-LANGU', 'SY-REPID',
    // Transactions / RFC / update
    'CALL', 'TRANSACTION', 'SUBMIT', 'AND', 'RETURN', 'VIA', 'SELECTION-SCREEN', 'START-OF-SELECTION',
    'END-OF-SELECTION', 'INITIALIZATION', 'TOP-OF-PAGE', 'END-OF-PAGE', 'AT', 'SELECTION-SCREEN', 'ON',
    'EVENT', 'CHANGE', 'BLOCK', 'TAB', 'PUSHBUTTON', 'FUNCTION-POOL', 'UPDATE', 'TASK', 'ASYNCHRONOUS',
    'IN', 'BACKGROUND', 'TASK', 'COMMIT', 'PERFORM', 'ON', 'COMMIT',
    // Booleans / built-in types
    'ABAP_TRUE', 'ABAP_FALSE', 'ABAP_BOOL', 'ABAP_UNDEFINED', 'BOUND', 'INITIAL', 'C', 'N', 'I', 'P', 'F', 'D', 'T',
    'STRING', 'XSTRING', 'ENDWITH',
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
  if (language === 'abap') return trimmed.startsWith('*');
  if (language === 'sql') return trimmed.startsWith('--');
  if (language === 'javascript') return trimmed.startsWith('//');
  return false;
}

// ABAP has no double-quoted string literal: any bare " outside a '...' literal
// starts a comment that runs to end-of-line, even mid-statement.
function findAbapTrailingCommentStart(line) {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'") inString = !inString;
    else if (ch === '"' && !inString) return i;
  }
  return -1;
}

const TOKEN_REGEX = /(\s+)|('[^']*'|"[^"]*"|\|[^|]*\|)|(\b\d+(\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_/-]*)|(.)/g;

function tokenizeSegment(segment, language, keywords) {
  const tokens = [];
  let match;
  TOKEN_REGEX.lastIndex = 0;
  while ((match = TOKEN_REGEX.exec(segment))) {
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

export function highlightLine(line, language) {
  if (language === 'plaintext' || !language) return [{ text: line, type: 'default' }];
  if (isCommentLine(line, language)) return [{ text: line, type: 'comment' }];

  const keywords = new Set((KEYWORDS[language] || []).map((k) => k.toUpperCase()));

  if (language === 'abap') {
    const commentStart = findAbapTrailingCommentStart(line);
    if (commentStart !== -1) {
      const code = line.slice(0, commentStart);
      const comment = line.slice(commentStart);
      return [...tokenizeSegment(code, language, keywords), { text: comment, type: 'comment' }];
    }
  }

  return tokenizeSegment(line, language, keywords);
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
