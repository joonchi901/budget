import { describe, expect, it } from 'vitest';
import {
  jsonObjectColumns,
  jsonRowChunks,
  maximumJsonBindingBytes,
} from '../../src/server/d1-json';

describe('D1 bounded JSON values', () => {
  it('splits UTF-8 JSON by bytes, preserves ordering and nulls, and rejects oversized individual rows', () => {
    const rows = Array.from({ length: 40 }, (_, id) => ({
      id,
      text: '한😀'.repeat(8000),
      optional: null,
    }));
    const chunks = jsonRowChunks(rows);
    expect(chunks.length).toBeGreaterThan(1);
    expect(
      chunks.every(
        (value) => new TextEncoder().encode(value).byteLength <= maximumJsonBindingBytes,
      ),
    ).toBe(true);
    expect(chunks.flatMap((value) => JSON.parse(value))).toEqual(rows);
    expect(jsonRowChunks([])).toEqual([]);
    expect(() => jsonRowChunks([{ text: '한'.repeat(100) }], 100)).toThrow();
  });
  it('limits JSON function arguments without merge-patch null deletion semantics', () => {
    const columns = Array.from({ length: 50 }, (_, index) => `c${index}`);
    const expression = jsonObjectColumns(columns);
    expect(expression).not.toContain('json_patch');
    expect(expression.match(/json_object/g)).toHaveLength(1);
    expect(expression.match(/json_set/g)).toHaveLength(3);
    expect(expression).toContain("'$.c49',c49");
  });
});
