import { UgaIcon, type UgaIconName } from '../brand/Uga';
import { Amount, ChipSelect, Field, List, ListRow, SelectField, SelectOption } from '../ui';
import {
  ledgerForDate,
  totals,
  type Group,
  type Id,
  type IsoDate,
  type Ledger,
  type LedgerRecord,
} from '../../shared/ledger';
import { periodLabel } from './format';

/** A group's ledgers with their record count and expense, each opening its own room. */
export function LedgerCardList({
  ledgers,
  records,
  onOpen,
}: {
  ledgers: Ledger[];
  records: LedgerRecord[];
  onOpen(ledger: Ledger): void;
}) {
  return (
    <List aria-label="포함된 가계부">
      {ledgers.map((ledger) => {
        const own = records.filter((record) => record.ledgerId === ledger.id);
        const sum = totals(own, ledgers);
        return (
          <ListRow
            key={ledger.id}
            leading={<UgaIcon name={ledger.icon as UgaIconName} size={32} />}
            title={ledger.name}
            description={`${periodLabel(ledger.period)} · 내역 ${own.length}건`}
            trailing={
              <>
                <Amount value={sum.expense} tone="expense" signed size="sm" />
                {sum.income > 0 && <Amount value={sum.income} tone="income" signed size="sm" />}
              </>
            }
            onClick={() => onOpen(ledger)}
          />
        );
      })}
    </List>
  );
}

const GROUP_COLOR = '#B9A27A';

/** Groups a ledger belongs to. A ledger may be in several groups at once. */
export function GroupPicker({
  groups,
  value,
  onValueChange,
  onCreateGroup,
}: {
  groups: Group[];
  value: Id[];
  onValueChange(value: Id[]): void;
  onCreateGroup?(name: string): Id;
}) {
  return (
    <ChipSelect
      label="묶음"
      options={groups.map((group) => ({
        id: group.id,
        name: group.name,
        color: GROUP_COLOR,
        archived: group.archived,
      }))}
      value={value}
      onValueChange={onValueChange}
      multiple
      onCreateOption={onCreateGroup}
    />
  );
}

/** Which ledger a record from a group room goes to; the ledger whose period has the date is marked. */
export function LedgerPicker({
  ledgers,
  value,
  onValueChange,
  date,
}: {
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
