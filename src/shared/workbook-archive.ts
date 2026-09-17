import type { BudgetBackup, SourceRecord } from './data';

const manifestFormat = 'uga-workbook-manifest-v1';
const chunkFormat = 'uga-workbook-chunk-v1';
const chunkSize = 48_000;
const maximumBytes = 20_000_000;
export interface WorkbookArchive {
  id: string;
  sourceId: string;
  fileName: string;
  byteLength: number;
  sha256: string;
  chunkCount: number;
}
const object = (v: unknown): v is Record<string, unknown> =>
  Boolean(v && typeof v === 'object' && !Array.isArray(v));
const sha256 = async (bytes: Uint8Array) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
export function isWorkbookArchiveRecord(record: Pick<SourceRecord, 'payload'>): boolean {
  return (
    object(record.payload) && [manifestFormat, chunkFormat].includes(String(record.payload.format))
  );
}
export function workbookArchives(records: SourceRecord[]): WorkbookArchive[] {
  return records.flatMap((record) => {
    const p = record.payload;
    if (
      !object(p) ||
      p.format !== manifestFormat ||
      typeof p.fileName !== 'string' ||
      typeof p.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(p.sha256) ||
      typeof p.byteLength !== 'number' ||
      !Number.isSafeInteger(p.byteLength) ||
      p.byteLength <= 0 ||
      p.byteLength > maximumBytes ||
      typeof p.chunkCount !== 'number' ||
      p.chunkCount !== Math.ceil(p.byteLength / chunkSize)
    )
      return [];
    return [
      {
        id: typeof p.archiveId === 'string' ? p.archiveId : record.id,
        sourceId: record.sourceId,
        fileName: p.fileName,
        byteLength: p.byteLength,
        sha256: p.sha256,
        chunkCount: p.chunkCount,
      },
    ];
  });
}

/** Preserve the original bytes, including cells, comments, charts and formatting. */
export async function appendWorkbookArchive(
  backup: BudgetBackup,
  sourceId: string,
  fileName: string,
  bytes: Uint8Array,
): Promise<{ added: number; id: string; sha256: string }> {
  if (!bytes.length || bytes.length > maximumBytes)
    throw new Error('원본 파일은 20MB 이하로 선택해 주세요.');
  const checksum = await sha256(bytes);
  const id = `workbook:${await sha256(new TextEncoder().encode(JSON.stringify([backup.sourceHouseholdId, sourceId, checksum])))}`;
  const chunkCount = Math.ceil(bytes.length / chunkSize);
  const entries = [
    {
      id,
      payload: {
        format: manifestFormat,
        archiveId: id,
        fileName,
        byteLength: bytes.length,
        sha256: checksum,
        chunkCount,
      },
      location: '원본 XLSX 파일',
    },
    ...Array.from({ length: chunkCount }, (_, index) => {
      const part = bytes.subarray(index * chunkSize, (index + 1) * chunkSize);
      let binary = '';
      for (const byte of part) binary += String.fromCharCode(byte);
      return {
        id: `${id}:${index}`,
        payload: { format: chunkFormat, archiveId: id, index, data: btoa(binary) },
        location: `원본 XLSX 파일 ${index + 1}/${chunkCount}`,
      };
    }),
  ];
  let added = 0;
  for (const entry of entries) {
    const existing = backup.tables.source_records.find((r) => r.id === entry.id);
    const payload = JSON.stringify(entry.payload);
    if (existing) {
      if (existing.payload_json !== payload)
        throw new Error('기존 원본 보관 자료와 파일 조각이 일치하지 않아요.');
      continue;
    }
    backup.tables.source_records.push({
      id: entry.id,
      source_id: sourceId,
      source_location: entry.location,
      kind: 'reference',
      payload_json: payload,
      note: '원본 파일 보관. 거래·통계에 중복 합산하지 않아요.',
      status: 'reference',
      version: 1,
    });
    added++;
  }
  return { added, id, sha256: checksum };
}

export async function restoreWorkbookArchive(
  records: SourceRecord[],
  id: string,
): Promise<Uint8Array> {
  const archive = workbookArchives(records).find((a) => a.id === id);
  if (!archive) throw new Error('원본 파일 정보를 확인할 수 없어요.');
  const chunks = records.filter(
    (r) => object(r.payload) && r.payload.format === chunkFormat && r.payload.archiveId === id,
  );
  if (chunks.length !== archive.chunkCount)
    throw new Error('원본 파일의 일부가 누락됐어요. 백업을 확인해 주세요.');
  const result = new Uint8Array(archive.byteLength);
  const seen = new Set<number>();
  for (const chunk of chunks) {
    const p = chunk.payload as Record<string, unknown>,
      index = p.index;
    if (
      typeof index !== 'number' ||
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= archive.chunkCount ||
      seen.has(index) ||
      typeof p.data !== 'string' ||
      p.data.length > (chunkSize * 4) / 3
    )
      throw new Error('원본 파일 조각의 형식이 올바르지 않아요.');
    seen.add(index);
    const binary = atob(p.data),
      expected = Math.min(chunkSize, archive.byteLength - index * chunkSize);
    if (binary.length !== expected) throw new Error('원본 파일 크기가 일치하지 않아요.');
    for (let i = 0; i < binary.length; i++) result[index * chunkSize + i] = binary.charCodeAt(i);
  }
  if ((await sha256(result)) !== archive.sha256)
    throw new Error('원본 파일 무결성 확인에 실패했어요.');
  return result;
}
