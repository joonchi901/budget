import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { renderD1ImportSql } from '../../scripts/lib/d1-import-sql';

describe('controlled D1 import SQL rendering', () => {
  it('binds only unquoted placeholders and preserves literal values without execution', () => {
    const text = "O'Reilly'); DROP TABLE sample; -- 한😀\n? $()";
    const rendered = renderD1ImportSql([
      { sql: 'CREATE TABLE sample("?" TEXT, value TEXT, n INTEGER, missing TEXT)', bindings: [] },
      {
        sql: "INSERT INTO sample VALUES('it''s ?', ?, ?, ?) -- ?\n/* ? */",
        bindings: [text, 42, null],
      },
    ]);
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(rendered.text);
      expect(db.prepare('SELECT * FROM sample').get()).toEqual({
        '?': "it's ?",
        value: text,
        n: 42,
        missing: null,
      });
      expect(rendered.statementCount).toBe(2);
    } finally {
      db.close();
    }
    expect(
      renderD1ImportSql([{ sql: 'SELECT "a""?", `b``?`, [?], ?;', bindings: [1] }]).text,
    ).toContain('SELECT "a""?", `b``?`, [?], 1;');
  });

  it('splits UTF-8 JSON rows, retaining the guard, row order, nulls and following statements', () => {
    const rows = Array.from({ length: 20 }, (_, id) => ({
      id,
      label: "한😀O'Reilly;--?".repeat(5),
      empty: null,
    }));
    const input = [
      { sql: 'CREATE TABLE sample(id INTEGER, label TEXT, empty TEXT)', bindings: [] },
      { sql: 'CREATE TABLE guard(ok INTEGER CHECK(ok=1))', bindings: [] },
      { sql: 'INSERT INTO guard VALUES(?)', bindings: [1] },
      {
        sql: "INSERT INTO sample SELECT json_extract(value,'$.id'),json_extract(value,'$.label'),json_extract(value,'$.empty') FROM json_each(?)",
        bindings: [JSON.stringify(rows)],
      },
      { sql: 'UPDATE guard SET ok=?', bindings: [1] },
    ];
    const result = renderD1ImportSql(input, 750);
    expect(result.statementCount).toBeGreaterThan(input.length);
    expect(result.maxStatementBytes).toBeLessThanOrEqual(750);
    expect(result.statements[2]).toContain('INSERT INTO guard VALUES(1)');
    expect(result.statements.at(-1)).toContain('UPDATE guard SET ok=1');
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(result.text);
      expect(db.prepare('SELECT * FROM sample ORDER BY id').all()).toEqual(rows);
    } finally {
      db.close();
    }
  });

  it('rejects unsupported bindings, syntax boundaries and oversized indivisible values', () => {
    for (const value of [
      undefined,
      true,
      {},
      [],
      NaN,
      Infinity,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      'bad\0text',
    ])
      expect(() => renderD1ImportSql([{ sql: 'SELECT ?', bindings: [value] }])).toThrow();
    for (const sql of [
      'SELECT ?1',
      "SELECT 'unterminated",
      'SELECT 1 /* unfinished',
      'SELECT 1; SELECT 2;',
      '-- comment only',
    ])
      expect(() => renderD1ImportSql([{ sql, bindings: [] }])).toThrow();
    expect(() => renderD1ImportSql([{ sql: 'SELECT ?', bindings: [] }])).toThrow();
    expect(() => renderD1ImportSql([{ sql: 'SELECT 1', bindings: [1] }])).toThrow();
    expect(() =>
      renderD1ImportSql([{ sql: 'SELECT ?', bindings: ['x'.repeat(100)] }], 50),
    ).toThrow();
    expect(() =>
      renderD1ImportSql(
        [
          {
            sql: 'INSERT INTO sample SELECT value FROM json_each(?)',
            bindings: [JSON.stringify([{ text: 'x'.repeat(100) }])],
          },
        ],
        90,
      ),
    ).toThrow(/One JSON row/);
    expect(() => renderD1ImportSql([], 90_001)).toThrow();
  });

  it('leaves the complete transaction unchanged when a late statement fails', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('CREATE TABLE guard(ok INTEGER CHECK(ok=1)); CREATE TABLE sample(value TEXT);');
      const result = renderD1ImportSql(
        [
          { sql: 'INSERT INTO guard VALUES(?)', bindings: [1] },
          {
            sql: 'INSERT INTO sample SELECT value FROM json_each(?)',
            bindings: [JSON.stringify(Array.from({ length: 20 }, () => '한'.repeat(20)))],
          },
          { sql: 'INSERT INTO guard VALUES(?)', bindings: [0] },
        ],
        220,
      );
      db.exec('BEGIN');
      expect(() => db.exec(result.text)).toThrow();
      db.exec('ROLLBACK');
      expect(db.prepare('SELECT count(*) AS n FROM sample').get()).toEqual({ n: 0 });
      expect(db.prepare('SELECT count(*) AS n FROM guard').get()).toEqual({ n: 0 });
    } finally {
      db.close();
    }
  });
});
