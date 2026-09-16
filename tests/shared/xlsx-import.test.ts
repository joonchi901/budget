import { describe, expect, it } from 'vitest';
import { backupTables, type BudgetBackup, type DataRow } from '../../src/shared/data';
import { buildWorkbookImport, type WorkbookImportOptions } from '../../src/shared/xlsx-import';
import type { Workbook, WorkbookCell, WorkbookSheet } from '../../src/shared/xlsx';

// Entirely synthetic layouts and amounts. Do not copy a personal workbook into this fixture.
function sheet(name: string, values: Record<string, WorkbookCell['value']>): WorkbookSheet {
  return {
    name,
    hidden: false,
    cells: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])),
  };
}
function workbook(
  monthly: Record<string, WorkbookCell['value']> = {},
  extra: WorkbookSheet[] = [],
  settings: Record<string, WorkbookCell['value']> = {},
): Workbook {
  return {
    date1904: false,
    sheets: [
      sheet('설정', { C3: 2026, E3: 9, G3: 1, B6: '식비', C6: '장보기', ...settings }),
      sheet('1', monthly),
      ...extra,
    ],
  };
}
function baseline(): BudgetBackup {
  const tables = Object.fromEntries(
    backupTables.map((key) => [key, [] as DataRow[]]),
  ) as BudgetBackup['tables'];
  tables.ledgers = [
    { id: 'main', name: '합성 메인', kind: 'main', archived: 0 },
    { id: 'trip', name: '합성 목적', kind: 'purpose', parent_id: null, archived: 0 },
  ];
  tables.payment_methods = [{ id: 'cash', name: '기존 현금', type: 'cash', archived: 0 }];
  tables.assets = [
    {
      id: 'checking',
      name: '합성 생활비',
      kind: 'asset',
      opening_balance: 2000,
      opening_date: '2026-09-01',
      track_savings: 0,
      archived: 0,
      metadata_json: '{}',
    },
    {
      id: 'savings',
      name: '합성 저축',
      kind: 'asset',
      opening_balance: 500,
      opening_date: '2026-09-01',
      track_savings: 1,
      archived: 0,
      metadata_json: '{}',
    },
  ];
  return {
    format: 'our-budget',
    schemaVersion: 1,
    exportedAt: '2026-11-01T00:00:00Z',
    sourceHouseholdId: 'synthetic-household',
    sourceRevision: 0,
    members: [{ id: 'u1', name: '합성 사용자', color: '#64866f' }],
    tables,
  };
}
const options: WorkbookImportOptions = {
  sourceId: 'synthetic-workbook',
  ledgerId: 'main',
  actorId: 'u1',
  payments: { 현금: 'cash' },
};
const expense = {
  T30: '2026-09-16',
  U30: '합성 장보기',
  V30: 120,
  W30: '식비',
  X30: '장보기',
  Y30: '현금',
};
const saving = (date: string) => ({
  T30: date,
  U30: '합성 적립',
  V30: 100,
  W30: '저축',
  X30: '정기적립',
  Y30: '현금',
});
const observations = () =>
  sheet('자산관리', {
    B28: '유동자산',
    C28: '예금',
    D28: '합성 관측 자산',
    E28: 1000,
    F28: 1500,
  });
const sourceAt = (backup: BudgetBackup, location = '1!T30:Z30') =>
  backup.tables.source_records.find((row) => row.source_location === location)!;
function balanceAt(backup: BudgetBackup, asset: DataRow, date = '9999-12-31') {
  return (
    Number(asset.opening_balance) +
    backup.tables.asset_effects
      .filter((effect) => effect.asset_id === asset.id && String(effect.date) <= date)
      .reduce((sum, effect) => sum + Number(effect.amount), 0)
  );
}

describe('synthetic XLSX import reconciliation', () => {
  it.each(['2026-09-30', '2026-10-15', '2026-10-31'])(
    'holds savings on %s that may already be included in imported closing observations',
    async (date) => {
      const book = workbook(saving(date), [observations()]);
      const first = await buildWorkbookImport(book, baseline(), options);
      const asset = first.backup.tables.assets.find((row) => row.name === '합성 관측 자산')!;
      expect(JSON.parse(String(asset.metadata_json))).toMatchObject({
        openingKind: 'observation',
        importedObservationThrough: '2026-10-31',
      });
      const second = await buildWorkbookImport(book, first.backup, {
        ...options,
        savings: { 정기적립: { fromAssetId: String(asset.id), toAssetId: 'savings' } },
      });
      expect(sourceAt(second.backup).status).toBe('pending');
      expect(second.pending.some((row) => row.message.includes('월말 관측'))).toBe(true);
      expect(second.assetOperations).toEqual([]);
      expect(second.transactions).toEqual({ count: 0, income: 0, expense: 0 });
      expect(balanceAt(second.backup, asset, '2026-09-30')).toBe(1000);
      expect(balanceAt(second.backup, asset, '2026-10-31')).toBe(1500);
      expect(second.backup.tables.asset_effects).toEqual(first.backup.tables.asset_effects);
    },
  );

  it('allows a later savings transfer without changing either historical closing observation', async () => {
    const book = workbook(saving('2026-11-01'), [observations()]);
    const first = await buildWorkbookImport(book, baseline(), options);
    const asset = first.backup.tables.assets.find((row) => row.name === '합성 관측 자산')!;
    const result = await buildWorkbookImport(book, first.backup, {
      ...options,
      savings: { 정기적립: { fromAssetId: String(asset.id), toAssetId: 'savings' } },
    });
    expect(result.assetOperations).toEqual([
      expect.objectContaining({
        type: 'transfer',
        date: '2026-11-01',
        amount: 100,
        from_asset_id: asset.id,
        to_asset_id: 'savings',
      }),
    ]);
    expect(sourceAt(result.backup).status).toBe('resolved');
    expect(balanceAt(result.backup, asset, '2026-10-31')).toBe(1500);
    expect(balanceAt(result.backup, asset)).toBe(1400);
    expect(result.transactions).toEqual({ count: 0, income: 0, expense: 0 });
  });

  it('also holds reserve expenses on the last observation day and leaves unknown reserve deposits unclassified', async () => {
    const book = workbook({}, [
      observations(),
      sheet('예비비', {
        K10: '2026-10-31',
        L10: '합성 예비금 사용',
        M10: 70,
        N10: '합성 분류',
        B26: '2026-11-01',
        C26: 200,
        D26: '합성 분류',
        E26: '성격 미확인 유입',
      }),
    ]);
    const first = await buildWorkbookImport(book, baseline(), options);
    const asset = first.backup.tables.assets.find((row) => row.name === '합성 관측 자산')!;
    const result = await buildWorkbookImport(book, first.backup, {
      ...options,
      reserveExpenses: {
        '예비비!expense:10': { assetId: String(asset.id), paymentMethodId: 'cash' },
      },
    });
    expect(sourceAt(result.backup, '예비비!K10:O10').status).toBe('pending');
    expect(sourceAt(result.backup, '예비비!B26:H26').status).toBe('pending');
    expect(result.transactions).toEqual({ count: 0, income: 0, expense: 0 });
    expect(result.assetOperations).toEqual([]);
    expect(balanceAt(result.backup, asset, '2026-10-31')).toBe(1500);
  });

  it('keeps user review notes on repeat import and appends a resolution once without changing evidence', async () => {
    const book = workbook({ ...expense, T30: null });
    const first = await buildWorkbookImport(book, baseline(), options);
    const review = sourceAt(first.backup);
    review.note = '사용자가 확인한 합성 메모';
    review.version = 4;
    const originalEvidence = review.payload_json;
    const repeat = await buildWorkbookImport(book, first.backup, options);
    expect(sourceAt(repeat.backup)).toMatchObject({
      note: '사용자가 확인한 합성 메모',
      version: 4,
      status: 'pending',
      payload_json: originalEvidence,
    });
    const correctedOptions = { ...options, corrections: { '1!30': { date: '2026-09-16' } } };
    const resolved = await buildWorkbookImport(book, repeat.backup, correctedOptions);
    expect(resolved.transactions).toEqual({ count: 1, income: 0, expense: 120 });
    expect(sourceAt(resolved.backup)).toMatchObject({
      version: 5,
      status: 'resolved',
      payload_json: originalEvidence,
    });
    expect(String(sourceAt(resolved.backup).note)).toContain('사용자가 확인한 합성 메모\n');
    const repeatedResolution = await buildWorkbookImport(book, resolved.backup, correctedOptions);
    expect(sourceAt(repeatedResolution.backup)).toEqual(sourceAt(resolved.backup));
    expect(repeatedResolution.transactions.count).toBe(0);
    expect(repeatedResolution.backup.tables.transactions).toHaveLength(1);
    expect(sourceAt(first.backup).status).toBe('pending'); // candidate construction is additive and pure
  });

  it.each([4999, 5000])(
    'resolves a corrected transaction without truncating a %i-character user review note',
    async (length) => {
      const book = workbook({ ...expense, T30: null });
      const first = await buildWorkbookImport(book, baseline(), options);
      const review = sourceAt(first.backup);
      const originalNote = '검'.repeat(length);
      review.note = originalNote;
      review.version = 4;
      const correctedOptions = { ...options, corrections: { '1!30': { date: '2026-09-16' } } };

      const result = await buildWorkbookImport(book, first.backup, correctedOptions);
      expect(sourceAt(result.backup)).toMatchObject({
        note: originalNote,
        status: 'resolved',
        version: 5,
        payload_json: review.payload_json,
      });
      expect(String(sourceAt(result.backup).note).length).toBeLessThanOrEqual(5000);
      expect(result.transactions).toEqual({ count: 1, income: 0, expense: 120 });
      expect(sourceAt(first.backup)).toMatchObject({
        note: originalNote,
        status: 'pending',
        version: 4,
      });

      const repeat = await buildWorkbookImport(book, result.backup, correctedOptions);
      expect(sourceAt(repeat.backup)).toEqual(sourceAt(result.backup));
      expect(repeat.transactions.count).toBe(0);
      expect(repeat.backup.tables.transactions).toHaveLength(1);
    },
  );

  it('honors an explicit new cash choice over an identically named original card and registers unused settings options', async () => {
    const book = workbook(
      { ...expense, Y30: '합성 동일 이름' },
      [
        sheet('카드 관리', {
          C4: '합성 금융기관',
          D4: '합성 동일 이름',
          E4: '신용',
        }),
      ],
      { C2: '미사용 합성 현금', L2: '미사용 합성 통장' },
    );
    const chosen = {
      ...options,
      payments: {
        '합성 동일 이름': '@new:cash',
        '미사용 합성 현금': '@new:cash',
        '미사용 합성 통장': '@new:account',
      },
    };
    const result = await buildWorkbookImport(book, baseline(), chosen);
    const tx = result.backup.tables.transactions[0];
    expect(
      result.backup.tables.payment_methods.find((row) => row.id === tx.payment_method_id),
    ).toMatchObject({ name: '합성 동일 이름', type: 'cash' });
    expect(result.backup.tables.payment_methods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: '합성 동일 이름', type: 'card' }),
        expect.objectContaining({ name: '미사용 합성 현금', type: 'cash' }),
        expect.objectContaining({ name: '미사용 합성 통장', type: 'account' }),
      ]),
    );
    const repeat = await buildWorkbookImport(book, result.backup, chosen);
    expect(repeat.counts.payment_methods).toBe(0);
    expect(repeat.transactions.count).toBe(0);
  });

  it('keeps automatic exact-name card linking when no explicit override is provided', async () => {
    const book = workbook({ ...expense, Y30: '합성 자동 연결' }, [
      sheet('카드 관리', {
        C4: '합성 금융기관',
        D4: '합성 자동 연결',
        E4: '신용',
      }),
    ]);
    const result = await buildWorkbookImport(book, baseline(), options);
    expect(
      result.backup.tables.payment_methods.find(
        (row) => row.id === result.backup.tables.transactions[0].payment_method_id,
      ),
    ).toMatchObject({
      name: '합성 자동 연결',
      type: 'card',
    });
  });

  it('rejects moving pending rows from the same source to a different ledger while allowing completion in the original ledger', async () => {
    const book = workbook({ ...expense, T30: null });
    const first = await buildWorkbookImport(book, baseline(), options);
    const before = structuredClone(first.backup);
    const corrections = { '1!30': { date: '2026-09-16' } };
    await expect(
      buildWorkbookImport(book, first.backup, {
        ...options,
        ledgerId: 'trip',
        corrections,
      }),
    ).rejects.toThrow('처음 가져온 가계부');
    expect(first.backup).toEqual(before);
    const result = await buildWorkbookImport(book, first.backup, { ...options, corrections });
    expect(result.backup.tables.transactions[0].ledger_id).toBe('main');
    const selected = JSON.parse(String(result.backup.tables.transactions[0].tag_ids)) as string[];
    const selectedGroups = result.backup.tables.tags
      .filter((tag) => selected.includes(String(tag.id)))
      .map((tag) => result.backup.tables.tag_groups.find((group) => group.id === tag.group_id)!);
    expect(
      selectedGroups.every((group) => JSON.parse(String(group.ledger_ids)).includes('main')),
    ).toBe(true);
  });

  it('uses corrected savings classification and minor labels for the transfer mapping, including surrounding whitespace', async () => {
    const book = workbook({ ...expense, W30: null, X30: null });
    const first = await buildWorkbookImport(book, baseline(), options);
    const result = await buildWorkbookImport(book, first.backup, {
      ...options,
      corrections: {
        '1!30': {
          date: ' 2026-09-16 ',
          major: ' 저축 ',
          minor: ' 새 적립 ',
          description: ' 합성 적립 보완 ',
        },
      },
      savings: { '새 적립': { fromAssetId: 'checking', toAssetId: 'savings' } },
    });
    expect(result.transactions).toEqual({ count: 0, income: 0, expense: 0 });
    expect(result.assetOperations).toEqual([
      expect.objectContaining({
        type: 'transfer',
        date: '2026-09-16',
        amount: 120,
        description: '합성 적립 보완',
        from_asset_id: 'checking',
        to_asset_id: 'savings',
      }),
    ]);
    expect(sourceAt(result.backup).status).toBe('resolved');
    expect(JSON.parse(String(sourceAt(result.backup).payload_json)).major).toBe('');
  });

  it('exposes savings movement and observed opening/final balances for a financial preview even with zero transactions', async () => {
    const result = await buildWorkbookImport(
      workbook(saving('2026-11-01'), [observations()]),
      baseline(),
      {
        ...options,
        savings: { 정기적립: { fromAssetId: 'checking', toAssetId: 'savings' } },
      },
    );
    expect(result.transactions).toEqual({ count: 0, income: 0, expense: 0 });
    expect(result.assetOperations).toHaveLength(2);
    expect(result.assetOperations.find((op) => op.type === 'transfer')).toMatchObject({
      amount: 100,
      date: '2026-11-01',
      from_asset_id: 'checking',
      to_asset_id: 'savings',
    });
    expect(result.assetOperations.find((op) => op.type === 'adjustment')).toMatchObject({
      amount: 500,
      date: '2026-10-31',
      target_balance: 1500,
    });
    expect(result.assetBalances).toEqual([
      {
        name: '합성 관측 자산',
        openingDate: '2026-09-30',
        openingBalance: 1000,
        balance: 1500,
      },
    ]);
    const observedId = result.backup.tables.assets.find(
      (asset) => asset.name === '합성 관측 자산',
    )!.id;
    expect(
      result.backup.tables.asset_effects
        .filter((effect) => effect.asset_id === observedId)
        .reduce((sum, effect) => sum + Number(effect.savings_amount), 0),
    ).toBe(0);
    expect(
      result.backup.tables.asset_effects
        .filter((effect) => effect.asset_id === 'savings')
        .reduce((sum, effect) => sum + Number(effect.savings_amount), 0),
    ).toBe(100);
  });

  it('keeps imported transactions unchanged when the same source cell changes and retains the changed evidence once', async () => {
    const first = await buildWorkbookImport(workbook(expense), baseline(), options);
    const changedBook = workbook({ ...expense, V30: 180 });
    const changed = await buildWorkbookImport(changedBook, first.backup, options);
    expect(changed.transactions.count).toBe(0);
    expect(changed.backup.tables.transactions).toEqual(first.backup.tables.transactions);
    const evidence = changed.backup.tables.source_records.filter(
      (row) => row.source_location === '1!T30:Z30',
    );
    expect(evidence).toHaveLength(2);
    expect(
      evidence.map((row) => [row.status, JSON.parse(String(row.payload_json)).amount]),
    ).toEqual([
      ['resolved', 120],
      ['pending', 180],
    ]);
    const repeated = await buildWorkbookImport(changedBook, changed.backup, options);
    expect(repeated.counts.source_records).toBe(0);
    expect(repeated.backup.tables.transactions).toHaveLength(1);
  });
});
