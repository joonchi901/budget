import { describe, expect, it } from 'vitest';
import {
  assetBalanceAt,
  assetLatestSummary,
  assetSummaryAt,
  assetTagSubtotals,
  assetYearHistory,
  monthEndDate,
} from '../../src/shared/assets';
import type { Asset, AssetMovement, Bootstrap } from '../../src/shared/types';

const asset = (overrides: Partial<Asset> = {}): Asset => ({
  id: 'cash',
  name: '생활 자산',
  kind: 'asset',
  openingBalance: 1000,
  balance: 1500,
  color: '#31725f',
  tagIds: [],
  trackSavings: false,
  version: 1,
  openingDate: '2026-02-01',
  ...overrides,
});
const movement = (id: string, date: string, amount: number, assetId = 'cash'): AssetMovement => ({
  id,
  date,
  amount,
  assetId,
  savingsAmount: 0,
  actorId: 'u1',
  description: '변동',
  transactionId: id,
  operationId: null,
});

describe('dated asset accounting', () => {
  it('returns zero before a confirmed opening date and excludes future effects from past balances', () => {
    const moves = [movement('feb', '2026-02-05', -100), movement('mar', '2026-03-01', 600)];
    expect(assetBalanceAt(asset(), moves, '2026-01-31')).toBe(0);
    expect(assetBalanceAt(asset(), moves, '2026-02-28')).toBe(900);
    expect(assetBalanceAt(asset(), moves, '2026-03-31')).toBe(1500);
  });
  it('reports unconfirmed legacy baselines as unknown instead of silently backdating current balances', () => {
    expect(assetBalanceAt(asset({ openingDate: null }), [], '2026-09-30')).toBeNull();
    const data = {
      assets: [asset({ openingDate: null }), asset({ id: 'known', openingBalance: 200 })],
      assetMovements: [],
    };
    expect(assetSummaryAt(data, '2026-09-30')).toMatchObject({
      assets: null,
      debt: 0,
      net: null,
      knownAssets: 200,
      knownCount: 1,
      unknown: ['cash'],
    });
  });
  it('keeps dates before the first observed balance unknown and uses later dated effects at month end', () => {
    const observed = asset({
      openingDate: '2026-02-28',
      details: { openingKind: 'observation' },
    });
    const moves = [movement('mar', '2026-03-31', 200), movement('apr', '2026-04-01', -50)];
    expect(assetBalanceAt(observed, moves, '2026-02-27')).toBeNull();
    expect(assetBalanceAt(observed, moves, '2026-02-28')).toBe(1000);
    expect(assetBalanceAt(observed, moves, '2026-03-31')).toBe(1200);
    const history = assetYearHistory({ assets: [observed], assetMovements: moves }, '2026');
    expect(history[0]).toMatchObject({ assets: null, net: null, unknown: ['cash'] });
    expect(history[1].net).toBe(1000);
    expect(history[2].net).toBe(1200);
    expect(history[3].net).toBe(1150);
    expect(
      assetBalanceAt({ ...observed, details: { openingKind: 'initial' } }, moves, '2026-01-31'),
    ).toBe(0);
  });
  it('keeps archived assets in historical totals and subtracts liabilities once', () => {
    const data = {
      assets: [
        asset({ archived: true }),
        asset({ id: 'debt', kind: 'liability', openingBalance: 400 }),
      ],
      assetMovements: [
        movement('a', '2026-02-05', 100),
        movement('repay', '2026-02-10', -50, 'debt'),
      ],
    };
    expect(assetSummaryAt(data, '2026-02-28')).toMatchObject({ assets: 1100, debt: 350, net: 750 });
  });
  it('does not hide a confirmed asset total when only a liability lacks a baseline', () => {
    const data = {
      assets: [asset(), asset({ id: 'contract', kind: 'liability', openingDate: null })],
      assetMovements: [],
    };
    expect(assetSummaryAt(data, '2026-02-28')).toMatchObject({
      assets: 1000,
      debt: null,
      net: null,
      knownAssets: 1000,
      knownDebt: 0,
      knownCount: 1,
      unknown: ['contract'],
    });
  });
  it('deduplicates repeated movement IDs but counts distinct same-day same-value records', () => {
    const entry = movement('one', '2026-02-02', 100);
    expect(
      assetBalanceAt(asset(), [entry, entry, movement('two', '2026-02-02', 100)], '2026-02-28'),
    ).toBe(1200);
  });
  it('shows a backdated valuation delta from its recorded date onward while keeping later effects', () => {
    const moves = [
      movement('spend', '2026-02-10', -100),
      movement('valuation', '2026-02-28', 50),
      movement('future', '2026-03-01', 600),
    ];
    expect(assetBalanceAt(asset(), moves, '2026-02-28')).toBe(950);
    expect(assetBalanceAt(asset(), moves, '2026-03-31')).toBe(1550);
  });
  it('builds twelve month-end balances with leap-year handling and rejects invalid months', () => {
    expect(monthEndDate('2024-02')).toBe('2024-02-29');
    expect(monthEndDate('2100-02')).toBe('2100-02-28');
    expect(() => monthEndDate('2026-13')).toThrow();
    const history = assetYearHistory(
      { assets: [asset()], assetMovements: [movement('gain', '2026-12-31', 300)] },
      '2026',
    );
    expect(history).toHaveLength(12);
    expect(history[0].net).toBe(0);
    expect(history[10].net).toBe(1000);
    expect(history[11].net).toBe(1300);
  });
  it('counts multiple asset tag memberships per option without changing unique overall net worth', () => {
    const data = {
      assets: [
        asset({ tagIds: ['a', 'b'] }),
        asset({ id: 'debt', kind: 'liability', openingBalance: 400 }),
      ],
      assetMovements: [],
      tags: [
        {
          id: 'a',
          groupId: 'purpose',
          name: '생활',
          color: '#111111',
          sortOrder: 0,
          archived: false,
          version: 1,
        },
        {
          id: 'b',
          groupId: 'purpose',
          name: '공동',
          color: '#222222',
          sortOrder: 1,
          archived: true,
          version: 1,
        },
      ],
    } as unknown as Bootstrap;
    const rows = assetTagSubtotals(data, 'purpose', '2026-02-28');
    expect(rows.map((row) => [row.name, row.net])).toEqual([
      ['생활', 1000],
      ['공동', 1000],
      ['미분류', -400],
    ]);
    expect(assetSummaryAt(data, '2026-02-28').net).toBe(600);
  });
});

describe('latest registered asset balances', () => {
  it('uses the final registered balance once and keeps future effects out of selected-month history', () => {
    const future = movement('future', '2027-01-01', 700);
    const data = {
      assets: [asset({ balance: 1600 }), asset({ id: 'debt', kind: 'liability', balance: 400 })],
      assetMovements: [
        future,
        movement('feb', '2026-02-15', -100),
        future,
        movement('other', '2028-01-01', 50, 'unrelated'),
      ],
    };
    const summary = assetLatestSummary(data);
    expect(summary).toMatchObject({ assets: 1600, debt: 400, net: 1200, knownCount: 2 });
    expect(summary.rows.map((row) => [row.asset.id, row.latestDate])).toEqual([
      ['cash', '2027-01-01'],
      ['debt', '2026-02-01'],
    ]);
    expect(assetSummaryAt(data, '2026-02-28').knownAssets).toBe(900);
  });

  it('distinguishes confirmed zero balances from management-only placeholders and excludes unknown principal', () => {
    const data = {
      assets: [
        asset({ id: 'known-zero', balance: 0 }),
        asset({ id: 'management', openingDate: null, openingBalance: 0, balance: 0 }),
        asset({
          id: 'contract',
          kind: 'liability',
          openingDate: null,
          openingBalance: 0,
          balance: 0,
          details: { principal: 5000 },
        }),
      ],
      assetMovements: [],
    };
    expect(assetLatestSummary(data)).toMatchObject({
      assets: null,
      debt: null,
      net: null,
      knownAssets: 0,
      knownDebt: 0,
      knownCount: 1,
      unknown: ['management', 'contract'],
      rows: [
        { balance: 0, latestDate: '2026-02-01' },
        { balance: null, latestDate: null },
        { balance: null, latestDate: null },
      ],
    });
  });

  it('reports no confirmed balances separately from a confirmed zero total', () => {
    const summary = assetLatestSummary({
      assets: [asset({ openingDate: null, balance: 0, openingBalance: 0 })],
      assetMovements: [],
    });
    expect(summary).toMatchObject({
      knownCount: 0,
      knownAssets: 0,
      knownDebt: 0,
      assets: null,
      debt: 0,
      net: null,
    });
    expect(assetLatestSummary({ assets: [], assetMovements: [] })).toMatchObject({
      knownCount: 0,
      unknown: [],
    });
  });

  it('shows the latest observed balance without inventing earlier history or omitting archived assets', () => {
    const data = {
      assets: [
        asset({
          openingDate: '2026-06-30',
          details: { openingKind: 'observation' },
          balance: 0,
          archived: true,
        }),
        asset({ id: 'debt', kind: 'liability', balance: 400 }),
      ],
      assetMovements: [movement('close', '2026-07-31', -1000)],
    };
    expect(assetLatestSummary(data)).toMatchObject({ assets: 0, debt: 400, net: -400 });
    expect(assetSummaryAt(data, '2026-05-31')).toMatchObject({
      assets: null,
      unknown: ['cash'],
    });
    expect(assetLatestSummary(data).rows[0].latestDate).toBe('2026-07-31');
  });

  it('uses latest balances for tag subtotals without adding overlapping options to overall totals', () => {
    const data = {
      assets: [
        asset({ tagIds: ['a', 'b'], balance: 1800 }),
        asset({ id: 'debt', kind: 'liability', balance: 400 }),
        asset({ id: 'missing', openingDate: null, balance: 0, tagIds: ['a'] }),
      ],
      assetMovements: [],
      tags: ['a', 'b'].map((id) => ({
        id,
        groupId: 'purpose',
        name: id,
        color: '#111111',
        sortOrder: 0,
        archived: false,
        version: 1,
      })),
    } as unknown as Bootstrap;
    const rows = assetTagSubtotals(data, 'purpose', 'latest');
    expect(rows.map((row) => [row.id, row.knownAssets, row.knownDebt, row.net])).toEqual([
      ['a', 1800, 0, null],
      ['b', 1800, 0, 1800],
      ['', 0, 400, -400],
    ]);
    expect(assetLatestSummary(data)).toMatchObject({ knownAssets: 1800, knownDebt: 400 });
    expect(assetTagSubtotals(data, 'purpose', '2026-02-28')[0].knownAssets).toBe(1000);
  });
});
