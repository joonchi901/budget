import { describe, expect, it } from 'vitest';
import { backupTables, type BudgetBackup, type DataRow } from '../../src/shared/data';
import {
  buildWorkbookImport,
  workbookLedgerPeriods,
  type WorkbookImportOptions,
} from '../../src/shared/xlsx-import';
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
  it('derives accounting periods from source settings and prefers explicit sheet dates and headers', () => {
    const periods = workbookLedgerPeriods(workbook({}, [], { C3: '2026년', E3: 1, G3: 31 }));
    expect(periods.root).toEqual({ startDate: '2026-01-31', endDate: '2027-01-30' });
    expect(periods.monthly['2']).toEqual({ startDate: '2026-03-01', endDate: '2026-03-30' });
    const headers = workbookLedgerPeriods(workbook({ F5: 2025, G5: 12, H5: 25 }, [], { E3: 1 }));
    expect(headers.monthly['1']).toEqual({ startDate: '2025-12-25', endDate: '2026-01-24' });
    const explicit = workbookLedgerPeriods(
      workbook({ F5: 2026, G5: 1, H5: 1, H6: '2025-12-28', H7: '2026-01-27' }),
    );
    expect(explicit.monthly['1']).toEqual({ startDate: '2025-12-28', endDate: '2026-01-27' });
  });

  it.each([0, 1899, 9999, 10000, '20260', '2026oops', '', true])(
    'leaves unsupported workbook year %s unbounded without changing transaction dates',
    async (year) => {
      const result = await buildWorkbookImport(workbook(expense, [], { C3: year }), baseline(), {
        ...options,
        newLedgerName: '연도 확인',
        ledgerMode: 'monthly',
      });
      expect(
        result.backup.tables.ledgers
          .filter((ledger) => ledger.kind === 'purpose' && ledger.id !== 'trip')
          .every((ledger) => ledger.start_date === null && ledger.end_date === null),
      ).toBe(true);
      expect(result.backup.tables.transactions[0].date).toBe('2026-09-16');
      expect(result.pending.some((record) => record.source === '설정!C3:G3')).toBe(true);
    },
  );

  it('does not replace malformed explicit periods or overflowed years with a guessed period', () => {
    const invalidHeaders: Record<string, WorkbookCell['value']>[] = [
      { F5: 9999, G5: 1, H5: 1 },
      { F5: 2026, G5: 1, H5: 32 },
      { H6: '2026-02-30', H7: '2026-03-01' },
    ];
    for (const cells of invalidHeaders)
      expect(workbookLedgerPeriods(workbook(cells)).monthly['1']).toBeNull();
    const boundary = workbookLedgerPeriods(workbook({}, [], { C3: 9998, E3: 12, G3: 31 }));
    expect(boundary.root).toBeNull();
    expect(boundary.monthly['1']).toBeNull();
    expect(boundary.monthly['2']).toBeNull();
  });

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

  it('imports clear income and expenses without a payment mapping or minor classification and keeps the unresolved facts', async () => {
    const book = workbook(
      {
        ...expense,
        X30: null,
        Y30: '연결하지 않은 원본 표기',
        Z30: '원본 사용자 태그',
        T31: '2026-09-17',
        U31: '합성 입금',
        V31: 500,
        W31: '수입',
        X31: '급여',
        Y31: null,
      },
      [],
      { B7: null, C7: '상위 없는 원본 옵션', B8: '미사용 분류', C8: '미사용 옵션' },
    );
    const initial = baseline();
    const before = structuredClone(initial);
    const result = await buildWorkbookImport(book, initial, { ...options, payments: {} });
    expect(initial).toEqual(before);
    expect(result.transactions).toEqual({ count: 2, income: 500, expense: 120 });
    expect(result.backup.tables.transactions.map((tx) => tx.payment_method_id)).toEqual([
      null,
      null,
    ]);
    expect(sourceAt(result.backup)).toMatchObject({ status: 'resolved' });
    expect(String(sourceAt(result.backup).note)).toContain('연결하지 않은 원본 표기');
    expect(String(sourceAt(result.backup).note)).toContain('결제수단 미지정');
    expect(JSON.parse(String(sourceAt(result.backup).payload_json)).payment).toBe(
      '연결하지 않은 원본 표기',
    );
    expect(result.pending).toEqual([
      expect.objectContaining({ source: '1!T30:Z30', message: expect.stringContaining('소분류') }),
    ]);
    expect(result.backup.tables.tags.map((tag) => tag.name)).toEqual(
      expect.arrayContaining([
        '원본 사용자 태그',
        '상위 없는 원본 옵션',
        '미사용 분류',
        '미사용 옵션',
      ]),
    );
    expect(result.backup.tables.tags.map((tag) => tag.name)).not.toContain('미분류');
    expect(result.backup.tables.tags.every((tag) => String(tag.name).trim())).toBe(true);
    expect(result.counts.payment_methods).toBe(0);
    const repeat = await buildWorkbookImport(book, result.backup, { ...options, payments: {} });
    expect(repeat.transactions.count).toBe(0);
    expect(repeat.counts.source_records).toBe(0);
    expect(repeat.backup.tables.transactions).toEqual(result.backup.tables.transactions);
  });

  it('holds unknown direction, missing dates, negative amounts and savings without inventing financial effects', async () => {
    const result = await buildWorkbookImport(
      workbook({
        ...expense,
        W30: null,
        X30: '방향 미확정 원본 옵션',
        T31: null,
        U31: '날짜 미확정',
        V31: 100,
        W31: '수입',
        X31: '기타',
        T32: '2026-09-18',
        U32: '음수 원본',
        V32: -100,
        W32: '식비',
        X32: '반환 여부 미확정',
        T33: '2026-09-19',
        U33: '자산 연결 없는 저축',
        V33: 100,
        W33: '저축',
        X33: '미연결 저축 옵션',
        Z33: '보류 중에도 보존할 태그',
      }),
      baseline(),
      { ...options, payments: {} },
    );
    expect(result.transactions).toEqual({ count: 0, income: 0, expense: 0 });
    expect(result.assetOperations).toEqual([]);
    for (const row of [30, 31, 32, 33])
      expect(sourceAt(result.backup, `1!T${row}:Z${row}`).status).toBe('pending');
    expect(result.backup.tables.tags.map((tag) => tag.name)).toEqual(
      expect.arrayContaining([
        '방향 미확정 원본 옵션',
        '반환 여부 미확정',
        '미연결 저축 옵션',
        '보류 중에도 보존할 태그',
      ]),
    );
  });

  it('preserves reserve category options even without a summary or amount and only tags explicitly listed assets', async () => {
    const book = workbook({}, [
      sheet('예비비', {
        B10: '합성 예비금',
        B26: '2026-09-16',
        C26: 20,
        D26: '합성 미등록 항목',
        E26: '합성 유입',
        K10: '2026-09-17',
        L10: '합성 사용',
        M10: 10,
        N10: '합성 미등록 항목',
        N11: '합성미등록 항목',
        K12: '2026-09-18',
        L12: '합성 확인 전 사용',
        M12: 5,
        N12: '합성 예비금',
      }),
    ]);
    const result = await buildWorkbookImport(book, baseline(), options);
    const group = result.backup.tables.tag_groups.find((row) => row.name === '예비금 항목')!;
    expect(group).toMatchObject({ applies_to: 'asset', role: 'regular', ledger_ids: null });
    const tags = result.backup.tables.tags.filter((tag) => tag.group_id === group.id);
    expect(tags.map((tag) => tag.name)).toEqual([
      '합성 예비금',
      '합성 미등록 항목',
      '합성미등록 항목',
    ]);
    expect(result.counts.assets).toBe(1);
    const asset = result.backup.tables.assets.find((row) => row.name === '합성 예비금')!;
    expect(JSON.parse(String(asset.tag_ids))).toContain(tags[0].id);
    expect(
      result.backup.tables.assets.some((row) =>
        ['합성 미등록 항목', '합성미등록 항목'].includes(String(row.name)),
      ),
    ).toBe(false);
    expect(result.transactions.count).toBe(0);
    expect(result.assetOperations).toEqual([]);
    const repeat = await buildWorkbookImport(book, result.backup, options);
    expect(repeat.counts.tags).toBe(0);
    expect(repeat.counts.tag_groups).toBe(0);
    expect(repeat.backup.tables.assets).toEqual(result.backup.tables.assets);
  });

  it('reports every remaining source review on repeat preview and preserves user notes and resolved decisions', async () => {
    const book = workbook({
      ...expense,
      X30: null,
      T31: null,
      U31: '날짜 미확정 합성 입금',
      V31: 30,
      W31: '수입',
      X31: '급여',
    });
    const result = await buildWorkbookImport(book, baseline(), options);
    expect(result.pending).toHaveLength(2);
    const existing = structuredClone(result.backup);
    const classification = existing.tables.source_records.find(
      (row) => row.source_location === '1!T30:Z30' && row.status === 'pending',
    )!;
    classification.note = '사용자가 남긴 분류 검토 메모';
    const undated = sourceAt(existing, '1!T31:Z31');
    undated.note = '사용자가 입금 날짜를 확인 중';
    existing.tables.source_records.push({
      ...classification,
      id: 'another-import-review',
      source_id: 'another-workbook',
      source_location: '다른 원본',
    });
    const repeat = await buildWorkbookImport(book, existing, options);
    expect(repeat.counts.source_records).toBe(0);
    expect(repeat.pending).toHaveLength(2);
    expect(repeat.pending).toContainEqual({
      source: '1!T30:Z30',
      message: '사용자가 남긴 분류 검토 메모',
    });
    expect(repeat.pending.some((row) => row.source === '다른 원본')).toBe(false);
    expect(repeat.pending.find((row) => row.source === '1!T31:Z31')?.message).toBe(
      '사용자가 입금 날짜를 확인 중\n거래일을 확인해 주세요.',
    );
    expect(sourceAt(repeat.backup, '1!T31:Z31').note).toBe('사용자가 입금 날짜를 확인 중');
    expect(repeat.backup.tables.transactions).toEqual(existing.tables.transactions);
    classification.status = 'resolved';
    const reviewed = await buildWorkbookImport(book, existing, options);
    expect(reviewed.pending).toHaveLength(1);
    expect(reviewed.pending[0].source).toBe('1!T31:Z31');
    expect(
      reviewed.backup.tables.source_records.find((row) => row.id === classification.id),
    ).toMatchObject({ status: 'resolved', note: '사용자가 남긴 분류 검토 메모' });
  });

  it('preserves incomplete ordinary rows for review and empty fixed templates as references without inventing transactions', async () => {
    const book = workbook(
      {
        U7: '금액 없는 고정 템플릿',
        W7: '생활비',
        X7: '정기 항목',
        T30: '2026-09-16',
        U31: '일반 원장 자유 메모',
        U32: '0원 여부 확인',
        V32: 0,
      },
      [sheet('예비비', { A22: '합성 자산 구분 메모' })],
    );
    const result = await buildWorkbookImport(book, baseline(), options);
    expect(result.transactions.count).toBe(0);
    expect(sourceAt(result.backup, '1!T7:Z7').status).toBe('reference');
    for (const row of [30, 31, 32]) {
      const source = sourceAt(result.backup, `1!T${row}:Z${row}`);
      expect(source.status).toBe('pending');
      expect(String(source.note)).toContain('추가 메모 행');
    }
    expect(JSON.parse(String(sourceAt(result.backup, '1!T32:Z32').payload_json)).cells.V32).toEqual(
      { value: 0 },
    );
    expect(sourceAt(result.backup, '예비비!A22')).toMatchObject({ status: 'reference' });
    expect(result.pending.some((row) => row.source === '1!T7:Z7')).toBe(false);
    const repeat = await buildWorkbookImport(book, result.backup, options);
    expect(repeat.counts.source_records).toBe(0);
    expect(repeat.transactions.count).toBe(0);
  });

  it('creates a monthly hierarchy once and routes original numbered sheets independently of the transaction date', async () => {
    const book = workbook(
      { ...expense, T30: '2026-02-10', B57: '식비', C57: 1000 },
      [
        sheet('2', { ...expense, T30: '2026-01-10', U30: '두 번째 시트 지출', V30: 240 }),
        sheet('월급관리', { A1: 2026, B1: '1월 예산', B2: 3000, A5: '생활비', B5: 0.1 }),
      ],
      { E3: 1 },
    );
    const monthlyOptions: WorkbookImportOptions = {
      ...options,
      newLedgerName: '2026 합성 가계부',
      ledgerMode: 'monthly',
      payments: {},
    };
    const result = await buildWorkbookImport(book, baseline(), monthlyOptions);
    const children = result.backup.tables.ledgers.filter(
      (ledger) => ledger.parent_id === result.ledgerId,
    );
    expect(result.counts.ledgers).toBe(13);
    expect(children.map((ledger) => [ledger.name, ledger.sort_order])).toEqual(
      Array.from({ length: 12 }, (_, index) => [`${index + 1}월`, index]),
    );
    expect(
      result.backup.tables.ledgers.find((ledger) => ledger.id === result.ledgerId),
    ).toMatchObject({
      name: '2026 합성 가계부',
      parent_id: null,
      start_date: '2026-01-01',
      end_date: '2026-12-31',
    });
    expect(children[0]).toMatchObject({ start_date: '2026-01-01', end_date: '2026-01-31' });
    expect(children[11]).toMatchObject({ start_date: '2026-12-01', end_date: '2026-12-31' });
    expect(result.backup.tables.transactions).toEqual([
      expect.objectContaining({
        ledger_id: result.monthlyLedgerIds!['1'],
        date: '2026-02-10',
        amount: 120,
      }),
      expect.objectContaining({
        ledger_id: result.monthlyLedgerIds!['2'],
        date: '2026-01-10',
        amount: 240,
      }),
    ]);
    const scoped = result.backup.tables.tag_groups.filter(
      (group) => group.applies_to === 'transaction',
    );
    expect(scoped.every((group) => JSON.parse(String(group.ledger_ids)).length === 13)).toBe(true);
    for (const tx of result.backup.tables.transactions) {
      const tags: string[] = JSON.parse(String(tx.tag_ids));
      const groups = result.backup.tables.tags
        .filter((tag) => tags.includes(String(tag.id)))
        .map((tag) => tag.group_id);
      expect(
        scoped
          .filter((group) => groups.includes(group.id))
          .every((group) => JSON.parse(String(group.ledger_ids)).includes(tx.ledger_id)),
      ).toBe(true);
    }
    const monthlyBudget = result.backup.tables.planning_records.find(
      (plan) => plan.kind === 'budget',
    )!;
    expect(monthlyBudget.ledger_id).toBe(result.monthlyLedgerIds!['1']);
    expect(JSON.parse(String(monthlyBudget.payload_json)).ledgerId).toBe(
      result.monthlyLedgerIds!['1'],
    );
    expect(
      result.backup.tables.planning_records.find((plan) => plan.kind === 'payroll')!.ledger_id,
    ).toBe(result.ledgerId);
    expect(result.transactions).toEqual({ count: 2, income: 0, expense: 360 });

    children[0].start_date = '2026-01-02';
    const repeat = await buildWorkbookImport(book, result.backup, monthlyOptions);
    expect(
      repeat.backup.tables.ledgers.find((ledger) => ledger.id === children[0].id)?.start_date,
    ).toBe('2026-01-02');
    expect(repeat.monthlyLedgerIds).toEqual(result.monthlyLedgerIds);
    expect(repeat.counts.ledgers).toBe(0);
    expect(repeat.counts.tags).toBe(0);
    expect(repeat.counts.planning_records).toBe(0);
    expect(repeat.counts.source_records).toBe(0);
    expect(repeat.transactions.count).toBe(0);
    expect(repeat.backup.tables.transactions).toEqual(result.backup.tables.transactions);
    await expect(
      buildWorkbookImport(book, result.backup, { ...monthlyOptions, ledgerMode: 'single' }),
    ).rejects.toThrow('처음 선택한 가계부 구성');
  });

  it('keeps single-ledger import as the default and does not silently change its layout on repeat import', async () => {
    const book = workbook(expense);
    const first = await buildWorkbookImport(book, baseline(), {
      ...options,
      newLedgerName: '단일 합성 원장',
    });
    expect(first.counts.ledgers).toBe(1);
    expect(first.monthlyLedgerIds).toBeUndefined();
    expect(first.backup.tables.transactions[0].ledger_id).toBe(first.ledgerId);
    await expect(
      buildWorkbookImport(book, first.backup, {
        ...options,
        newLedgerName: '단일 합성 원장',
        ledgerMode: 'monthly',
      }),
    ).rejects.toThrow('처음 선택한 가계부 구성');
    await expect(
      buildWorkbookImport(book, baseline(), { ...options, ledgerMode: 'monthly' }),
    ).rejects.toThrow('새 상위 가계부 이름');
  });
});
