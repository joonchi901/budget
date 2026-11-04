import { useId } from 'react';
import { AmountInput, Button, ChipSelect, DateField, Field, Inline, Stack, TextField } from '../ui';
import type { FieldDef, FieldValue, Id, IsoDate, Ledger } from '../../shared/ledger';

export type RecordDraft = {
  date: IsoDate;
  kindId: Id;
  title: string;
  amount: number | null;
  values: { [fieldId: Id]: FieldValue };
};

/** The input for one ledger field: text → TextField, select → ChipSelect. */
export function DynamicField({
  field,
  value,
  onChange,
  onCreateOption,
}: {
  field: FieldDef;
  value: FieldValue | undefined;
  onChange(value: FieldValue): void;
  /** Adds an option with the chosen color to the field and returns its id. */
  onCreateOption?(fieldId: Id, name: string, color: string): Id;
}) {
  if (field.type === 'text')
    return (
      <TextField
        label={field.name}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  return (
    <ChipSelect
      label={field.name}
      options={field.options}
      value={Array.isArray(value) ? value : []}
      onValueChange={onChange}
      multiple={field.type === 'multiSelect'}
      onCreateOption={onCreateOption && ((name, color) => onCreateOption(field.id, name, color))}
    />
  );
}

/**
 * 유형 → 금액 → 내용 → 날짜 → the ledger's own fields, in the order a record is usually told.
 * 유형 are chips like other tags; they are added in settings, where each gets 수입 or 지출.
 */
export function RecordForm({
  ledger,
  draft,
  onChange,
  onCreateOption,
  suggestions = [],
  autoFocusAmount = false,
}: {
  ledger: Ledger;
  draft: RecordDraft;
  onChange(draft: RecordDraft): void;
  onCreateOption?(fieldId: Id, name: string, color: string): Id;
  /** Earlier 내용 values; up to four that extend what is typed are offered. */
  suggestions?: string[];
  /** Start on 금액 so phones open the number pad, e.g. for a new record. */
  autoFocusAmount?: boolean;
}) {
  const id = useId();
  const set = (patch: Partial<RecordDraft>) => onChange({ ...draft, ...patch });
  const natureOf = (kindId: Id) => ledger.kinds.find((kind) => kind.id === kindId)?.nature;
  // Tags picked for 지출 rarely fit 수입, so switching between them clears tags; text stays.
  const withKind = (kindId: Id): Partial<RecordDraft> =>
    natureOf(kindId) === natureOf(draft.kindId)
      ? { kindId }
      : {
          kindId,
          values: Object.fromEntries(
            Object.entries(draft.values).filter(
              ([fieldId]) => ledger.fields.find((field) => field.id === fieldId)?.type === 'text',
            ),
          ),
        };
  const typed = draft.title.trim().toLocaleLowerCase();
  const matches = typed
    ? [...new Set(suggestions)]
        .filter(
          (title) =>
            title.toLocaleLowerCase().includes(typed) && title.toLocaleLowerCase() !== typed,
        )
        .slice(0, 4)
    : [];
  return (
    <Stack gap={5}>
      <ChipSelect
        label="유형"
        options={ledger.kinds}
        value={[draft.kindId]}
        onValueChange={([kindId]) => kindId && set(withKind(kindId))}
      />
      <Stack gap={2}>
        <Field htmlFor={`${id}-amount`}>금액</Field>
        <AmountInput
          id={`${id}-amount`}
          value={draft.amount}
          onValueChange={(amount) => set({ amount })}
          data-autofocus={autoFocusAmount || undefined}
          placeholder="0"
          required
        />
      </Stack>
      <Stack gap={2}>
        <TextField
          label="내용"
          value={draft.title}
          placeholder="무엇_어디서"
          required
          onChange={(event) => set({ title: event.target.value })}
        />
        {matches.length > 0 && (
          <Inline gap={2} role="group" aria-label="이전에 쓴 내용">
            {matches.map((title) => (
              <Button
                key={title}
                variant="plain"
                className="ui-chip"
                onClick={() => set({ title })}
              >
                {title}
              </Button>
            ))}
          </Inline>
        )}
      </Stack>
      <Stack gap={2}>
        <Field htmlFor={`${id}-date`}>날짜</Field>
        <DateField
          id={`${id}-date`}
          value={draft.date}
          onValueChange={(date) => set({ date })}
          required
        />
      </Stack>
      {ledger.fields
        .filter((field) => !field.hidden)
        .map((field) => (
          <DynamicField
            key={field.id}
            field={field}
            value={draft.values[field.id]}
            onChange={(value) => set({ values: { ...draft.values, [field.id]: value } })}
            onCreateOption={onCreateOption}
          />
        ))}
    </Stack>
  );
}
