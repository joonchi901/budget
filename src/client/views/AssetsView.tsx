import { useId, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { AssetRow, NetWorthSummary, ledgerMeta } from '../ledger';
import { FullScreenSheet, Screen } from '../templates';
import {
  AmountInput,
  Button,
  ChipSelect,
  DateField,
  Empty,
  Field,
  List,
  SegmentedControl,
  Stack,
  TextField,
} from '../ui';
import {
  ASSET_KINDS,
  assetBalance,
  assetProblems,
  coveredLedgerIds,
  type Asset,
  type AssetKind,
} from '../../shared/assets';
import { leafLedgers, type IsoDate, type Ledger, type LedgerRecord } from '../../shared/ledger';

const LINK_COLOR = '#B9A27A';

/**
 * Home's 자산 tab: 순자산 on top, then the user's assets by kind with what each holds now. An
 * asset may follow ledgers; their records marked 자산에 반영 move its balance.
 */
export function AssetsView({
  assets,
  ledgers,
  records,
  onAdd,
  onOpenAsset,
  tabBar,
}: {
  assets: Asset[];
  ledgers: Ledger[];
  records: LedgerRecord[];
  onAdd(): void;
  onOpenAsset(asset: Asset): void;
  /** The app's bottom tabs. */
  tabBar?: ReactNode;
}) {
  const id = useId();
  const balances = new Map(
    assets.map((asset) => [asset.id, assetBalance(asset, ledgers, records)]),
  );
  const total = (debt: boolean) =>
    assets
      .filter((asset) => (asset.kind === 'debt') === debt)
      .reduce((sum, asset) => sum + balances.get(asset.id)!, 0);
  return (
    <Screen
      top={
        <div className="view-page-header">
          <h1>자산</h1>
          <Button variant="primary" onClick={onAdd}>
            <Plus size={18} />
            자산 추가
          </Button>
        </div>
      }
      bottom={tabBar}
    >
      {assets.length ? (
        <Stack gap={6}>
          <NetWorthSummary owned={total(false)} owed={total(true)} />
          {ASSET_KINDS.map(({ value, label }) => {
            const group = assets.filter((asset) => asset.kind === value);
            return (
              group.length > 0 && (
                <section key={value} aria-labelledby={`${id}-${value}`}>
                  <h2 id={`${id}-${value}`} className="view-section-title">
                    {label}
                  </h2>
                  <List aria-labelledby={`${id}-${value}`}>
                    {group.map((asset) => (
                      <AssetRow
                        key={asset.id}
                        asset={asset}
                        balance={balances.get(asset.id)!}
                        ledgers={ledgers}
                        onOpen={() => onOpenAsset(asset)}
                      />
                    ))}
                  </List>
                </section>
              )
            );
          })}
        </Stack>
      ) : (
        <Empty>아직 자산이 없어요. 통장, 저축, 대출을 더해 보세요.</Empty>
      )}
    </Screen>
  );
}

/**
 * Adding or changing an asset: name, kind, the balance on a starting day, and the ledgers it
 * follows. A ledger another asset already follows is left out, so no record counts twice.
 */
export function AssetEditView({
  asset,
  assets,
  ledgers,
  today,
  onSave,
  onDelete,
  onClose,
}: {
  /** The asset being changed; omit to add. */
  asset?: Asset;
  /** All the user's assets, to keep each ledger on one of them. */
  assets: Asset[];
  ledgers: Ledger[];
  today: IsoDate;
  onSave(asset: Asset): void;
  onDelete?(asset: Asset): void;
  onClose(): void;
}) {
  const id = useId();
  const [initial] = useState<Asset>(
    () =>
      asset ?? {
        id: crypto.randomUUID(),
        name: '',
        kind: 'cash',
        balance: 0,
        since: today,
        ledgerIds: [],
      },
  );
  const [draft, setDraft] = useState(initial);
  const [problems, setProblems] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const taken = new Set(
    assets
      .filter((other) => other.id !== draft.id)
      .flatMap((other) => [...coveredLedgerIds(other, ledgers)]),
  );
  const choices = ledgers.filter(
    (ledger) =>
      draft.ledgerIds.includes(ledger.id) ||
      (!ledger.archived && !leafLedgers(ledgers, ledger).some((leaf) => taken.has(leaf.id))),
  );
  const save = () => {
    const found = assetProblems(draft, assets, ledgers);
    setProblems(found);
    if (!found.length) onSave({ ...draft, name: draft.name.trim() });
  };
  return (
    <FullScreenSheet
      title={asset ? '자산 수정' : '자산 추가'}
      dirty={dirty}
      onClose={onClose}
      footer={
        <>
          {asset && onDelete && (
            <Button
              className="view-danger"
              onClick={() => (confirmDelete ? onDelete(asset) : setConfirmDelete(true))}
            >
              {confirmDelete ? '한 번 더 누르면 삭제' : '삭제'}
            </Button>
          )}
          <Button variant="primary" onClick={save}>
            저장
          </Button>
        </>
      }
    >
      <Stack gap={5}>
        {problems.length > 0 && (
          <p className="view-error" role="alert">
            확인해 주세요: {problems.join(', ')}
          </p>
        )}
        <TextField
          label="이름"
          value={draft.name}
          maxLength={40}
          placeholder="예: 생활비 통장"
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        <SegmentedControl<AssetKind>
          aria-label="종류"
          value={draft.kind}
          onValueChange={(kind) => setDraft({ ...draft, kind })}
          options={ASSET_KINDS}
        />
        <Stack gap={2}>
          <Field htmlFor={`${id}-balance`}>
            {draft.kind === 'debt' ? '남은 금액' : '시작 잔액'}
          </Field>
          <AmountInput
            id={`${id}-balance`}
            value={draft.balance}
            onValueChange={(balance) => setDraft({ ...draft, balance: balance ?? 0 })}
            placeholder="0"
          />
        </Stack>
        <Stack gap={2}>
          <Field htmlFor={`${id}-since`}>기준일</Field>
          <DateField
            id={`${id}-since`}
            value={draft.since}
            onValueChange={(since) => setDraft({ ...draft, since })}
            required
          />
        </Stack>
        <Stack gap={2}>
          <ChipSelect
            label="연동할 가계부"
            multiple
            options={choices.map((ledger) => ({
              id: ledger.id,
              name: `${ledger.name} · ${ledgerMeta(ledger)}`,
              color: LINK_COLOR,
            }))}
            value={draft.ledgerIds}
            onValueChange={(ledgerIds) => setDraft({ ...draft, ledgerIds })}
          />
          <p className="view-meta">
            기준일부터 연동한 가계부의 내역 중 "자산에 반영"된 수입은 더하고 지출은 빼요. 상위
            가계부를 고르면 그 아래 가계부도 함께 따라요. 다른 자산에 연동된 가계부는 빠져요.
          </p>
        </Stack>
      </Stack>
    </FullScreenSheet>
  );
}
