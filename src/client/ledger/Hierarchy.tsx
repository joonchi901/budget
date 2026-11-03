import { UgaIcon, type UgaIconName } from '../brand/Uga';
import { Amount, ChipSelect, Field, List, ListRow, SelectField, SelectOption } from '../ui';
import {
  canNest,
  isParent,
  ledgerForDate,
  leafLedgers,
  roomRecords,
  totals,
  type Id,
  type IsoDate,
  type Ledger,
  type LedgerRecord,
} from '../../shared/ledger';
import { periodLabel } from './format';

/** "하위 3개" for a parent, the period for a ledger that holds records. */
export const ledgerMeta = (ledger: Ledger) =>
  isParent(ledger) ? `하위 ${ledger.childIds.length}개` : periodLabel(ledger.period);

/** A parent's direct children with their totals; each opens its own room, so parents drill down. */
export function ChildLedgerList({
  parent,
  ledgers,
  records,
  onOpen,
}: {
  parent: Ledger;
  /** All ledgers, to resolve children and their records. */
  ledgers: Ledger[];
  records: LedgerRecord[];
  onOpen(ledger: Ledger): void;
}) {
  const children = parent.childIds
    .map((id) => ledgers.find((ledger) => ledger.id === id))
    .filter((ledger): ledger is Ledger => !!ledger && !ledger.archived);
  return (
    <List aria-label="하위 가계부">
      {children.map((child) => {
        const own = roomRecords(ledgers, child, records);
        const sum = totals(own, leafLedgers(ledgers, child));
        return (
          <ListRow
            key={child.id}
            leading={<UgaIcon name={child.icon as UgaIconName} size={32} />}
            title={child.name}
            description={`${ledgerMeta(child)} · 내역 ${own.length}건`}
            trailing={
              <>
                <Amount value={sum.expense} tone="expense" signed size="sm" />
                {sum.income > 0 && <Amount value={sum.income} tone="income" signed size="sm" />}
              </>
            }
            onClick={() => onOpen(child)}
          />
        );
      })}
    </List>
  );
}

const PARENT_COLOR = '#B9A27A';

/**
 * Parents a ledger sits under; several at once. Parents that would create a cycle (the ledger
 * itself or anything below it) are not offered.
 */
export function ParentPicker({
  ledgers,
  self,
  value,
  onValueChange,
  onCreateParent,
}: {
  ledgers: Ledger[];
  /** The ledger being placed; omit while creating one. */
  self?: Ledger;
  value: Id[];
  onValueChange(value: Id[]): void;
  onCreateParent?(name: string): Id;
}) {
  return (
    <ChipSelect
      label="상위 가계부"
      options={ledgers
        .filter((ledger) => isParent(ledger) && (!self || canNest(ledgers, ledger, self)))
        .map((ledger) => ({
          id: ledger.id,
          name: ledger.name,
          color: PARENT_COLOR,
          archived: ledger.archived,
        }))}
      value={value}
      onValueChange={onValueChange}
      multiple
      onCreateOption={onCreateParent && ((name) => onCreateParent(name))}
      optionColors={false}
    />
  );
}

/** Which ledger a record from a parent room goes to; the one whose period has the date is marked. */
export function LedgerPicker({
  ledgers,
  value,
  onValueChange,
  date,
}: {
  /** Ledgers that hold records. */
  ledgers: Ledger[];
  value: Id;
  onValueChange(value: Id): void;
  date: IsoDate;
}) {
  const suggested = ledgerForDate(ledgers, date);
  return (
    <Field className="ledger-picker">
      저장할 가계부
      <SelectField value={value} onValueChange={onValueChange}>
        {ledgers
          .filter((ledger) => !ledger.archived)
          .map((ledger) => (
            <SelectOption key={ledger.id} value={ledger.id}>
              {ledger.name} · {periodLabel(ledger.period)}
              {ledger.id === suggested?.id && ' · 날짜 맞음'}
            </SelectOption>
          ))}
      </SelectField>
    </Field>
  );
}

/** Children of a parent; ledgers that would create a cycle (the parent or its ancestors) are left out. */
export function ChildPicker({
  ledgers,
  self,
  value,
  onValueChange,
}: {
  ledgers: Ledger[];
  /** The parent being edited; omit while creating one. */
  self?: Ledger;
  value: Id[];
  onValueChange(value: Id[]): void;
}) {
  return (
    <ChipSelect
      label="하위 가계부"
      options={ledgers
        .filter((ledger) => !self || canNest(ledgers, self, ledger))
        .map((ledger) => ({
          id: ledger.id,
          name: `${ledger.name} · ${ledgerMeta(ledger)}`,
          color: PARENT_COLOR,
          archived: ledger.archived,
        }))}
      value={value}
      onValueChange={onValueChange}
      multiple
    />
  );
}
