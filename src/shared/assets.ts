import type { Asset, AssetMovement, Bootstrap, OwnerId } from './types';

export interface AssetDetails {
  /** Initial proves the asset did not exist before the date; observation does not. */
  openingKind?: 'initial' | 'observation';
  ownerId?: OwnerId;
  institution?: string;
  notes?: string;
  principal?: number | null;
  rate?: number | null;
  rateType?: string;
  paymentDay?: number | null;
  monthlyPayment?: number | null;
  term?: string;
  endDate?: string | null;
  repaymentMethod?: string;
  conditions?: string;
  fees?: string;
  benefits?: string;
}

export const assetDetailTextFields = [
  'institution',
  'notes',
  'rateType',
  'term',
  'repaymentMethod',
  'conditions',
  'fees',
  'benefits',
] as const;

/** Null means there is no confirmed baseline for the requested date. */
export function assetBalanceAt(
  asset: Asset,
  movements: AssetMovement[],
  asOf: string,
): number | null {
  if (!asset.openingDate) return null;
  if (asOf < asset.openingDate) return asset.details?.openingKind === 'observation' ? null : 0;
  const seen = new Set<string>();
  return movements.reduce((balance, movement) => {
    if (movement.assetId !== asset.id || movement.date > asOf || seen.has(movement.id))
      return balance;
    seen.add(movement.id);
    return balance + movement.amount;
  }, asset.openingBalance);
}

export function monthEndDate(month: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new RangeError('조회 월을 확인해 주세요.');
  const [year, m] = month.split('-').map(Number);
  const last =
    m === 2
      ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
        ? 29
        : 28
      : [4, 6, 9, 11].includes(m)
        ? 30
        : 31;
  return `${month}-${last}`;
}

function summarizeAssetRows<Row extends { asset: Asset; balance: number | null }>(rows: Row[]) {
  const unknown = rows.filter((row) => row.balance === null).map((row) => row.asset.id);
  const sum = (kind: Asset['kind']) =>
    rows
      .filter((row) => row.asset.kind === kind)
      .reduce((amount, row) => amount + (row.balance ?? 0), 0);
  const knownAssets = sum('asset');
  const knownDebt = sum('liability');
  return {
    rows,
    unknown,
    knownCount: rows.length - unknown.length,
    knownAssets,
    knownDebt,
    assets: rows.some((row) => row.asset.kind === 'asset' && row.balance === null)
      ? null
      : knownAssets,
    debt: rows.some((row) => row.asset.kind === 'liability' && row.balance === null)
      ? null
      : knownDebt,
    net: unknown.length ? null : knownAssets - knownDebt,
  };
}

export function assetSummaryAt(data: Pick<Bootstrap, 'assets' | 'assetMovements'>, asOf: string) {
  return summarizeAssetRows(
    data.assets.map((asset) => ({
      asset,
      balance: assetBalanceAt(asset, data.assetMovements, asOf),
    })),
  );
}

/** Latest registered balances include all effects, independently of the selected month. */
export function assetLatestSummary(data: Pick<Bootstrap, 'assets' | 'assetMovements'>) {
  return summarizeAssetRows(
    data.assets.map((asset) => ({
      asset,
      // Imported management-only entries have a zero placeholder, not a confirmed balance.
      balance: asset.openingDate ? asset.balance : null,
      latestDate: data.assetMovements.reduce<string | null>(
        (latest, movement) =>
          movement.assetId === asset.id && (!latest || movement.date > latest)
            ? movement.date
            : latest,
        asset.openingDate ?? null,
      ),
    })),
  );
}

export function assetYearHistory(data: Pick<Bootstrap, 'assets' | 'assetMovements'>, year: string) {
  return Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, '0')}`;
    return { month, ...assetSummaryAt(data, monthEndDate(month)) };
  });
}

/** An asset with multiple options contributes to each option, not twice to the overall total. */
export function assetTagSubtotals(data: Bootstrap, groupId: string, asOf: string) {
  const options = data.tags.filter((tag) => tag.groupId === groupId);
  const tagged = new Set(options.map((tag) => tag.id));
  return [
    ...options.map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      assets: data.assets.filter((asset) => asset.tagIds.includes(tag.id)),
    })),
    {
      id: '',
      name: '미분류',
      color: '#92998c',
      assets: data.assets.filter((asset) => !asset.tagIds.some((id) => tagged.has(id))),
    },
  ].map((row) => ({
    ...row,
    ...(asOf === 'latest'
      ? assetLatestSummary({ assets: row.assets, assetMovements: data.assetMovements })
      : assetSummaryAt({ assets: row.assets, assetMovements: data.assetMovements }, asOf)),
    count: row.assets.length,
  }));
}
