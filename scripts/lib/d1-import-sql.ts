export interface BoundImportStatement {
  sql: string;
  bindings: readonly unknown[];
}

export interface RenderedImportSql {
  text: string;
  statements: string[];
  statementCount: number;
  maxStatementBytes: number;
}

const encoder = new TextEncoder();
const bytes = (value: string) => encoder.encode(value).byteLength;

function literal(value: unknown): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  if (typeof value === 'string' && !value.includes('\0')) return `'${value.replaceAll("'", "''")}'`;
  throw new Error('Import bindings must be null, NUL-free strings, or safe integers.');
}

/** Scan only the controlled SQL produced by the application, never workbook text. */
function inspect(sql: string) {
  const mask = sql.split(''),
    positions: number[] = [];
  for (let i = 0; i < sql.length;) {
    const start = i,
      char = sql[i];
    if (char === '-' && sql[i + 1] === '-') {
      i += 2;
      while (i < sql.length && sql[i] !== '\n' && sql[i] !== '\r') i++;
    } else if (char === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end < 0) throw new Error('Unterminated SQL comment.');
      i = end + 2;
    } else if (["'", '"', '`', '['].includes(char)) {
      const close = char === '[' ? ']' : char;
      let closed = false;
      for (i++; i < sql.length; i++) {
        if (sql[i] !== close) continue;
        if (close !== ']' && sql[i + 1] === close) {
          i++;
          continue;
        }
        i++;
        closed = true;
        break;
      }
      if (!closed) throw new Error('Unterminated SQL quote.');
    } else {
      if (char === '?') {
        if (/\d/.test(sql[i + 1] ?? '')) throw new Error('Numbered SQL bindings are unsupported.');
        positions.push(i);
      }
      i++;
      continue;
    }
    for (let j = start; j < i; j++) mask[j] = ' ';
  }
  const code = mask.join('');
  if (!code.trim()) throw new Error('Empty SQL statement.');
  const end = code.indexOf(';');
  if (end >= 0 && code.slice(end + 1).trim())
    throw new Error('Each captured statement must contain exactly one SQL statement.');
  return { code, positions, terminated: end >= 0 };
}

/** Keep the guard and every following statement in their original order in one file. */
export function renderD1ImportSql(
  input: readonly BoundImportStatement[],
  maximumStatementBytes = 90_000,
): RenderedImportSql {
  if (
    !Number.isSafeInteger(maximumStatementBytes) ||
    maximumStatementBytes < 1 ||
    maximumStatementBytes > 90_000
  )
    throw new Error('SQL byte limit must be between 1 and 90000.');
  const statements: string[] = [];
  const append = (sql: string) => {
    if (bytes(sql) > maximumStatementBytes)
      throw new Error('An import statement exceeds the SQL byte limit.');
    statements.push(sql);
  };
  for (const statement of input) {
    const { code, positions, terminated } = inspect(statement.sql);
    if (positions.length !== statement.bindings.length)
      throw new Error('SQL placeholder and binding counts differ.');
    const render = (bindings: readonly unknown[]) => {
      let result = '',
        offset = 0;
      positions.forEach((position, index) => {
        result += statement.sql.slice(offset, position) + literal(bindings[index]);
        offset = position + 1;
      });
      result += statement.sql.slice(offset);
      // A newline prevents a trailing line comment from swallowing the terminator.
      return result.trimEnd() + (terminated ? '' : '\n;');
    };
    const rendered = render(statement.bindings);
    if (bytes(rendered) <= maximumStatementBytes) {
      append(rendered);
      continue;
    }
    const matches = [...code.matchAll(/\bjson_each\s*\(\s*\?\s*\)/gi)];
    if (!/^\s*INSERT\b/i.test(code) || matches.length !== 1)
      throw new Error('Only oversized INSERT JSON arrays can be split.');
    const placeholder = matches[0].index! + matches[0][0].indexOf('?');
    const bindingIndex = positions.indexOf(placeholder);
    const value = statement.bindings[bindingIndex];
    let rows: unknown;
    try {
      rows = typeof value === 'string' ? JSON.parse(value) : undefined;
    } catch {
      throw new Error('The split JSON binding is invalid.');
    }
    if (!Array.isArray(rows) || rows.length === 0)
      throw new Error('The oversized JSON binding must contain a nonempty array.');
    const bindings = [...statement.bindings];
    bindings[bindingIndex] = '[]';
    const baseBytes = bytes(render(bindings));
    let chunk: string[] = [],
      chunkBytes = baseBytes;
    const flush = () => {
      bindings[bindingIndex] = `[${chunk.join(',')}]`;
      append(render(bindings));
      chunk = [];
      chunkBytes = baseBytes;
    };
    for (const row of rows) {
      const encoded = JSON.stringify(row),
        rowBytes = bytes(literal(encoded)) - 2;
      if (baseBytes + rowBytes > maximumStatementBytes)
        throw new Error('One JSON row exceeds the SQL byte limit.');
      if (chunkBytes + rowBytes + Number(chunk.length > 0) > maximumStatementBytes) flush();
      chunkBytes += rowBytes + Number(chunk.length > 0);
      chunk.push(encoded);
    }
    if (chunk.length) flush();
  }
  return {
    text: statements.length ? statements.join('\n') + '\n' : '',
    statements,
    statementCount: statements.length,
    maxStatementBytes: Math.max(0, ...statements.map(bytes)),
  };
}
