import { requireValue } from './errors';

// Leave headroom beneath D1's 2 MB limit for a bound string or a table row.
export const maximumJsonBindingBytes = 1_500_000;

/** Split a JSON array without splitting rows, counting UTF-8 bytes rather than characters. */
export function jsonRowChunks(rows: readonly unknown[], limit = maximumJsonBindingBytes): string[] {
  const chunks: string[] = [];
  const encoder = new TextEncoder();
  let entries: string[] = [],
    bytes = 2;
  for (const row of rows) {
    const serialized = JSON.stringify(row);
    const length = encoder.encode(serialized).byteLength;
    requireValue(length + 2 <= limit, '한 항목의 자료가 너무 커요. 원본을 나누어 주세요.');
    if (bytes + length + Number(entries.length > 0) > limit) {
      chunks.push(`[${entries.join(',')}]`);
      entries = [];
      bytes = 2;
    }
    bytes += length + Number(entries.length > 0);
    entries.push(serialized);
  }
  if (entries.length) chunks.push(`[${entries.join(',')}]`);
  return chunks;
}

/** D1 supports at most 32 function arguments; json_object consumes two per column. */
export function jsonObjectColumns(columns: readonly string[]): string {
  let result = `json_object(${columns
    .slice(0, 16)
    .map((c) => `'${c}',${c}`)
    .join(',')})`;
  // json_patch would remove nullable fields from its second object.
  for (let i = 16; i < columns.length; i += 15)
    result = `json_set(${result},${columns
      .slice(i, i + 15)
      .map((c) => `'$.${c}',${c}`)
      .join(',')})`;
  return result;
}
