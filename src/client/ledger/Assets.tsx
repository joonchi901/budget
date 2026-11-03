import { UgaIcon, type UgaIconName } from '../brand/Uga';
import { Amount, ListRow } from '../ui';
import type { Asset, AssetKind } from '../../shared/assets';
import type { Ledger } from '../../shared/ledger';

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
