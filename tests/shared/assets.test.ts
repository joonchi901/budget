import { describe, expect, it } from 'vitest';
import {
  assetBalanceAt,
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
      debt: null,
      net: null,
      knownAssets: 200,
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
