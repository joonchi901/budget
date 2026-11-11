import { useId } from 'react';
import { Trash2 } from 'lucide-react';
import {
  Amount,
  AmountInput,
  Empty,
  Field,
  IconButton,
  List,
  ListRow,
  SelectField,
  SelectOption,
  Stack,
  Switch,
  TextField,
} from '../ui';
import { recurringDates, type IsoDate, type Ledger, type RecurringRule } from '../../shared/ledger';
import { addMonths, shortDate } from './format';

/** "매달 25일" or "매달 마지막 날". */
export const dayName = (day: number) => (day >= 31 ? '매달 마지막 날' : `매달 ${day}일`);

/** The rule's next day from today on. */
const nextDate = (rule: RecurringRule, today: IsoDate) =>
  recurringDates(rule.day, { start: today, end: addMonths(today, 2) })[0];

/**
 * A ledger's 반복 내역: what repeats, on which day, and when it comes next. Choosing one opens it
 * to change; the bin stops it. New ones are made from 내역 추가 (반복).
 */
export function RecurringList({
  ledger,
  rules,
  today,
  onOpen,
  onRemove,
}: {
  ledger: Ledger;
  rules: RecurringRule[];
  today: IsoDate;
  onOpen(rule: RecurringRule): void;
  onRemove(rule: RecurringRule): void;
}) {
  if (!rules.length)
    return <Empty>아직 반복 내역이 없어요. 내역을 추가할 때 반복을 고르면 여기에 모여요.</Empty>;
  return (
    <List aria-label="반복 내역">
      {rules.map((rule) => {
        const kind = ledger.kinds.find((item) => item.id === rule.kindId);
        return (
          <ListRow
            key={rule.id}
            className="ledger-recurring"
            title={rule.title}
            description={[
              dayName(rule.day),
              `다음 ${shortDate(nextDate(rule, today))}`,
              ...(rule.variable ? ['금액이 달라요'] : []),
            ].join(' · ')}
            trailing={
              <Amount value={rule.amount} tone={kind?.nature ?? 'expense'} signed size="sm" />
            }
            onClick={() => onOpen(rule)}
            footer={
              <IconButton aria-label={`${rule.title} 반복 그만하기`} onClick={() => onRemove(rule)}>
                <Trash2 size={18} />
              </IconButton>
            }
          />
        );
      })}
    </List>
  );
}

/** Changing a rule: 내용, 금액, its day and whether the amount varies. 유형 and tags stay. */
export function RecurringRuleForm({
  rule,
  onChange,
}: {
  rule: RecurringRule;
  onChange(rule: RecurringRule): void;
}) {
  const id = useId();
  return (
    <Stack gap={5}>
      <TextField
        label="내용"
        value={rule.title}
        maxLength={100}
        onChange={(event) => onChange({ ...rule, title: event.target.value })}
      />
      <Stack gap={2}>
        <Field htmlFor={`${id}-amount`}>금액</Field>
        <AmountInput
          id={`${id}-amount`}
          value={rule.amount}
          onValueChange={(amount) => onChange({ ...rule, amount: amount ?? 0 })}
        />
      </Stack>
      <Stack gap={2}>
        <Field htmlFor={`${id}-day`}>날짜</Field>
        <SelectField
          id={`${id}-day`}
          value={String(Math.min(rule.day, 31))}
          onValueChange={(day) => onChange({ ...rule, day: Number(day) })}
        >
          {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
            <SelectOption key={day} value={String(day)}>
              {dayName(day)}
            </SelectOption>
          ))}
        </SelectField>
      </Stack>
      <Field>
        <Switch
          checked={Boolean(rule.variable)}
          onChange={(event) => {
            const { variable: _, ...rest } = rule;
            onChange(event.target.checked ? { ...rest, variable: true } : rest);
          }}
        />
        금액이 달마다 달라요
      </Field>
    </Stack>
  );
}
