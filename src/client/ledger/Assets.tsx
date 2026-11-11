import { useId, useState } from 'react';
import { UgaIcon, type UgaIconName } from '../brand/Uga';
import { Amount, Empty, List, ListRow, Stack, won } from '../ui';
import {
  assetMonths,
  assetRecords,
  coveredLedgerIds,
  type Asset,
  type AssetKind,
} from '../../shared/assets';
import {
  defaultStatAxis,
  totals,
  type KindOption,
  type Ledger,
  type LedgerRecord,
} from '../../shared/ledger';
import { monthLabel } from './format';
import { SummaryStrip } from './Room';
import { StatsBreakdown } from './Stats';

const kindIcons: Record<AssetKind, UgaIconName> = {
  cash: 'payments',
  savings: 'moneybag',
  investment: 'analytics',
  debt: 'data',
};

/** One asset: kind icon, name, the ledgers it follows (or 직접 관리), and what it holds now. */
export function AssetRow({
  asset,
  balance,
  ledgers,
  onOpen,
}: {
  asset: Asset;
  /** The balance now, from assetBalance. */
  balance: number;
  ledgers: Ledger[];
  onOpen?(): void;
}) {
  const linked = asset.ledgerIds
    .map((id) => ledgers.find((ledger) => ledger.id === id)?.name)
    .filter(Boolean);
  return (
    <ListRow
      leading={<UgaIcon name={kindIcons[asset.kind]} size={36} />}
      title={asset.name}
      description={linked.length ? `${linked.join('·')} 연동` : '직접 관리'}
      trailing={
        <Amount value={balance} tone={asset.kind === 'debt' ? 'expense' : 'neutral'} size="sm" />
      }
      onClick={onOpen}
    />
  );
}

/** 순자산 large, with what is owned and what is owed beside it. */
export function NetWorthSummary({ owned, owed }: { owned: number; owed: number }) {
  return (
    <dl className="ledger-net-worth">
      <div className="ledger-net-worth-main">
        <dt>순자산</dt>
        <dd>
          <Amount value={owned - owed} size="lg" />
        </dd>
      </div>
      <div>
        <dt>자산</dt>
        <dd>
          <Amount value={owned} size="sm" />
        </dd>
      </div>
      <div>
        <dt>부채</dt>
        <dd>
          <Amount value={owed} tone="expense" size="sm" />
        </dd>
      </div>
    </dl>
  );
}

/**
 * What moved an asset since its 기준일, from the records of the ledgers it follows: 수입·지출 and
 * the change, each month with the balance at its end, and the records by 유형 or a field such as
 * 카테고리.
 */
export function AssetAnalysis({
  asset,
  ledgers,
  records,
}: {
  asset: Asset;
  ledgers: Ledger[];
  records: LedgerRecord[];
}) {
  const id = useId();
  const covered = coveredLedgerIds(asset, ledgers);
  const sources = ledgers.filter((ledger) => covered.has(ledger.id));
  const moved = assetRecords(asset, ledgers, records);
  const [axis, setAxis] = useState(() => defaultStatAxis(sources));
  const [nature, setNature] = useState<KindOption['nature']>('expense');
  if (!moved.length) return <Empty>기준일 이후 반영된 내역이 아직 없어요.</Empty>;
  return (
    <Stack gap={6} className="ledger-asset-analysis">
      <SummaryStrip totals={totals(moved, sources)} balanceLabel="잔액 변화" />
      <section aria-labelledby={`${id}-months`}>
        <h3 id={`${id}-months`}>월별 흐름</h3>
        <List aria-labelledby={`${id}-months`}>
          {assetMonths(asset, ledgers, records).map((month) => (
            <ListRow
              key={month.month}
              title={monthLabel(month.month)}
              description={`수입 ${won(month.income)}원 · 지출 ${won(month.expense)}원`}
              trailing={
                <>
                  <Amount
                    value={month.balance}
                    tone={asset.kind === 'debt' ? 'expense' : 'neutral'}
                    size="sm"
                  />
                  <span>월말 잔액</span>
                </>
              }
            />
          ))}
        </List>
      </section>
      <section aria-labelledby={`${id}-items`}>
        <h3 id={`${id}-items`}>항목별</h3>
        <StatsBreakdown
          records={moved}
          ledgers={sources}
          axis={axis}
          onAxisChange={setAxis}
          nature={nature}
          onNatureChange={setNature}
        />
      </section>
    </Stack>
  );
}
