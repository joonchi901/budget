import { describe, expect, it } from 'vitest';
import { csvImportRows, defaultCsvMapping, parseCsv, transactionsCsv } from '../../src/shared/data';
import type { Bootstrap } from '../../src/shared/types';

const data = (): Bootstrap => ({
  user: { id: 'u1', name: '합성 사용자', color: '#000000' },
  users: [],
  ledgers: [],
  transactions: [],
  assets: [],
  assetOperations: [],
  assetMovements: [],
  paymentMethods: [],
  tagGroups: [],
  tags: [],
  revision: 0,
  mode: 'demo',
});
describe('CSV with unspecified payment methods', () => {
  it('accepts an absent payment column and empty payment cells, but rejects unknown names', () => {
    const csv = [
      ['원본 행 ID', '날짜', '내역', '금액', '유형'],
      ['synthetic-row', '2026-09-17', '합성 내역', '100', '지출'],
    ];
    const without = csvImportRows(csv, defaultCsvMapping(csv[0]), 'ledger', data());
    expect(without.errors).toEqual([]);
    expect(without.rows[0].transaction.paymentMethodId).toBeNull();
    const empty = [
      [...csv[0], '결제수단'],
      [...csv[1], ''],
    ];
    expect(csvImportRows(empty, defaultCsvMapping(empty[0]), 'ledger', data()).errors).toEqual([]);
    empty[1][5] = '없는 결제수단';
    expect(csvImportRows(empty, defaultCsvMapping(empty[0]), 'ledger', data()).errors).toHaveLength(
      1,
    );
  });
  it('round trips an unspecified payment without fabricating a named cash account', () => {
    const value = data();
    value.transactions.push({
      id: 's',
      ledgerId: 'ledger',
      date: '2026-09-17',
      description: '합성',
      amount: 100,
      type: 'expense',
      ownerId: 'shared',
      paymentMethodId: null,
      tagIds: [],
      allocations: [],
      version: 1,
      updatedAt: '2026-09-17T00:00:00Z',
      updatedBy: 'u1',
    });
    const csv = parseCsv(transactionsCsv(value));
    const result = csvImportRows(csv, defaultCsvMapping(csv[0]), 'ledger', value);
    expect(result.errors).toEqual([]);
    expect(result.rows[0].transaction.paymentMethodId).toBeNull();
    expect(value.paymentMethods).toEqual([]);
  });
});
