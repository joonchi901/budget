import { describe, it, expect } from 'vitest';
import {
  backupTables,
  type BudgetBackup,
  type DataRow,
  type SourceRecord,
} from '../../src/shared/data';
import {
  appendWorkbookArchive,
  restoreWorkbookArchive,
  workbookArchives,
} from '../../src/shared/workbook-archive';

const baseline = (): BudgetBackup => ({
  format: 'our-budget',
  schemaVersion: 2,
  exportedAt: '2026-09-17',
  sourceHouseholdId: 'synthetic',
  sourceRevision: 0,
  members: [],
  tables: Object.fromEntries(
    backupTables.map((t) => [t, [] as DataRow[]]),
  ) as BudgetBackup['tables'],
});
const records = (backup: BudgetBackup): SourceRecord[] =>
  backup.tables.source_records.map((row) => ({
    id: String(row.id),
    sourceId: String(row.source_id),
    sourceLocation: String(row.source_location),
    kind: 'reference',
    status: 'reference',
    note: String(row.note),
    version: 1,
    payload: JSON.parse(String(row.payload_json)),
  }));
describe('exact workbook source archive', () => {
  it('preserves bytes across multiple chunks, backup serialization and repeat import', async () => {
    const backup = baseline(),
      bytes = Uint8Array.from({ length: 140_001 }, (_, i) => (i * 37) % 256);
    const first = await appendWorkbookArchive(backup, 'synthetic-source', '합성.xlsx', bytes);
    expect(first.added).toBe(4);
    const copy = JSON.parse(JSON.stringify(backup));
    expect(workbookArchives(records(copy))).toHaveLength(1);
    expect(await restoreWorkbookArchive(records(copy), first.id)).toEqual(bytes);
    // A restore into another household remaps database row IDs, not the original file identity.
    const remapped = records(copy).map((row, index) => ({ ...row, id: `restored-${index}` }));
    expect(workbookArchives(remapped)[0].id).toBe(first.id);
    expect(await restoreWorkbookArchive(remapped, first.id)).toEqual(bytes);
    expect((await appendWorkbookArchive(copy, 'synthetic-source', '합성.xlsx', bytes)).added).toBe(
      0,
    );
    expect(copy.tables.source_records).toHaveLength(4);
  });
  it('rejects missing, duplicated and tampered chunks instead of silently downloading a damaged source', async () => {
    const backup = baseline(),
      bytes = Uint8Array.from({ length: 60_001 }, (_, i) => i % 256);
    const { id } = await appendWorkbookArchive(backup, 's', '합성.xlsx', bytes);
    const original = records(backup);
    await expect(restoreWorkbookArchive(original.slice(0, -1), id)).rejects.toThrow('누락');
    const duplicated = structuredClone(original);
    duplicated[2] = structuredClone(duplicated[1]);
    await expect(restoreWorkbookArchive(duplicated, id)).rejects.toThrow('형식');
    const tampered = structuredClone(original);
    const payload = tampered[1].payload as Record<string, unknown>;
    payload.data = 'AAAA' + String(payload.data).slice(4);
    await expect(restoreWorkbookArchive(tampered, id)).rejects.toThrow('무결성');
  });
});
