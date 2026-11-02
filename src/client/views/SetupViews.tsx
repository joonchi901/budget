import { useId, useState } from 'react';
import { UgaIcon, type UgaIconName } from '../brand/Uga';
import {
  ChildPicker,
  FieldSchemaEditor,
  ParentPicker,
  TagOptionEditor,
  addDays,
  addMonths,
  periodLabel,
} from '../ledger';
import { FullScreenSheet } from '../templates';
import {
  Button,
  DateField,
  Field,
  Grid,
  SegmentedControl,
  SelectField,
  SelectOption,
  Stack,
  Switch,
  TextField,
} from '../ui';
import {
  isParent,
  leafLedgers,
  type FieldDef,
  type Id,
  type IsoDate,
  type KindOption,
  type Ledger,
} from '../../shared/ledger';

const ICONS: { value: UgaIconName; label: string }[] = [
  { value: 'ledger', label: '기록' },
  { value: 'sprout', label: '새싹' },
  { value: 'heart', label: '하트' },
  { value: 'star', label: '별' },
  { value: 'home', label: '집' },
  { value: 'planning', label: '달력' },
];
const DEFAULT_KINDS: Omit<KindOption, 'id'>[] = [
  { name: '수입', color: '#38735B', nature: 'income' },
  { name: '지출', color: '#AE393B', nature: 'expense' },
];

/** Name, period and icon, shared by creating and editing a ledger. Parents have no period. */
function LedgerBasics({
  name,
  onNameChange,
  period,
  onPeriodChange,
  icon,
  onIconChange,
  nameError,
}: {
  name: string;
  onNameChange(name: string): void;
  /** Omit for a parent, whose span comes from its children. */
  period?: { start: IsoDate; end: IsoDate };
  onPeriodChange?(period: { start: IsoDate; end: IsoDate }): void;
  icon: string;
  onIconChange(icon: string): void;
  nameError?: string;
}) {
  const id = useId();
  return (
    <Stack gap={4}>
      <TextField
        label="이름"
        value={name}
        placeholder={period ? '예: 12월, 일본여행' : '예: 2026, 여행'}
        required
        error={nameError}
        onChange={(event) => onNameChange(event.target.value)}
      />
      {period && onPeriodChange && (
        <Grid columns={2} mobileColumns={2} gap={2}>
          <Stack gap={2}>
            <Field htmlFor={`${id}-start`}>시작일</Field>
            <DateField
              id={`${id}-start`}
              value={period.start}
              max={period.end}
              onValueChange={(start) => onPeriodChange({ ...period, start })}
            />
          </Stack>
          <Stack gap={2}>
            <Field htmlFor={`${id}-end`}>종료일</Field>
            <DateField
              id={`${id}-end`}
              value={period.end}
              min={period.start}
              onValueChange={(end) => onPeriodChange({ ...period, end })}
            />
          </Stack>
        </Grid>
      )}
      <Field>
        아이콘
        <SelectField value={icon} onValueChange={onIconChange}>
          {ICONS.map((choice) => (
            <SelectOption key={choice.value} value={choice.value}>
              <span className="view-icon-option">
                <UgaIcon name={choice.value} size={22} />
                {choice.label}
              </span>
            </SelectOption>
          ))}
        </SelectField>
      </Field>
    </Stack>
  );
}

/** Fresh ids keep a copied ledger independent; names stay so parent stats still merge. */
function copySchema(source: Ledger) {
  return {
    kinds: source.kinds.map((kind) => ({ ...kind, id: crypto.randomUUID() })),
    fields: source.fields.map((field): FieldDef =>
      field.type === 'text'
        ? { ...field, id: crypto.randomUUID() }
        : {
            ...field,
            id: crypto.randomUUID(),
            options: field.options.map((option) => ({ ...option, id: crypto.randomUUID() })),
          },
    ),
  };
}

/** A parent spans its record-holding ledgers' periods. */
function spanOf(ledgers: Ledger[], childIds: Id[], fallback: { start: IsoDate; end: IsoDate }) {
  const periods = childIds
    .map((id) => ledgers.find((ledger) => ledger.id === id))
    .flatMap((child) => (child ? leafLedgers(ledgers, child) : []))
    .map((leaf) => leaf.period);
  if (!periods.length) return fallback;
  return {
    start: periods.reduce(
      (min, period) => (period.start < min ? period.start : min),
      periods[0].start,
    ),
    end: periods.reduce((max, period) => (period.end > max ? period.end : max), periods[0].end),
  };
}

type Role = 'records' | 'parent';

/**
 * Creating a ledger. One that holds records starts empty or copied from another (fields, tags
 * and kinds, period one month later, optionally its 고정지출 records). A 상위 가계부 only picks
 * its children. Either can sit under several parents.
 */
export function CreateLedgerView({
  ledgers,
  today,
  initialSourceId,
  onCreate,
  onCreateParent,
  onClose,
}: {
  ledgers: Ledger[];
  today: IsoDate;
  /** Start in copy mode from this ledger, e.g. from a room's 복사해서 만들기. */
  initialSourceId?: Id;
  onCreate(result: { ledger: Ledger; parentIds: Id[]; copyFixedFrom?: Id }): void;
  onCreateParent?(name: string): Id;
  onClose(): void;
}) {
  const sources = ledgers.filter((ledger) => !ledger.archived && !isParent(ledger));
  const [role, setRole] = useState<Role>('records');
  const [mode, setMode] = useState<'empty' | 'copy'>(initialSourceId ? 'copy' : 'empty');
  const [sourceId, setSourceId] = useState(initialSourceId ?? sources[0]?.id ?? '');
  const source = sources.find((ledger) => ledger.id === sourceId);
  const thisMonth = { start: today, end: addDays(addMonths(today, 1), -1) };
  const nextPeriod = (ledger?: Ledger) =>
    ledger
      ? { start: addMonths(ledger.period.start, 1), end: addMonths(ledger.period.end, 1) }
      : thisMonth;
  const [name, setName] = useState('');
  const [period, setPeriod] = useState(() => nextPeriod(mode === 'copy' ? source : undefined));
  const [icon, setIcon] = useState(source && mode === 'copy' ? source.icon : 'ledger');
  const [fields, setFields] = useState<FieldDef[]>(() =>
    mode === 'copy' && source ? copySchema(source).fields : [],
  );
  const [childIds, setChildIds] = useState<Id[]>([]);
  const [parentIds, setParentIds] = useState<Id[]>([]);
  const [copyFixed, setCopyFixed] = useState(true);
  const [nameError, setNameError] = useState<string>();

  const switchSource = (nextMode: 'empty' | 'copy', id = sourceId) => {
    const next = sources.find((ledger) => ledger.id === id);
    setMode(nextMode);
    setSourceId(id);
    setPeriod(nextPeriod(nextMode === 'copy' ? next : undefined));
    setFields(nextMode === 'copy' && next ? copySchema(next).fields : []);
    if (nextMode === 'copy' && next) setIcon(next.icon);
  };
  const create = () => {
    if (!name.trim()) {
      setNameError('이름을 입력해 주세요.');
      return;
    }
    const id = crypto.randomUUID();
    if (role === 'parent') {
      onCreate({
        ledger: {
          id,
          name: name.trim(),
          icon,
          period: spanOf(ledgers, childIds, thisMonth),
          kinds: [],
          fields: [],
          childIds,
        },
        parentIds,
      });
      return;
    }
    const kinds =
      mode === 'copy' && source
        ? copySchema(source).kinds
        : DEFAULT_KINDS.map((kind) => ({ ...kind, id: crypto.randomUUID() }));
    onCreate({
      ledger: { id, name: name.trim(), icon, period, kinds, fields, childIds: [] },
      parentIds,
      copyFixedFrom: mode === 'copy' && copyFixed ? source?.id : undefined,
    });
  };

  return (
    <FullScreenSheet
      title="가계부 만들기"
      dirty={name !== ''}
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={create}>
          만들기
        </Button>
      }
    >
      <Stack gap={6}>
        <SegmentedControl<Role>
          aria-label="가계부 종류"
          value={role}
          onValueChange={setRole}
          options={[
            { value: 'records', label: '내역을 적는 가계부' },
            { value: 'parent', label: '상위 가계부' },
          ]}
        />
        {role === 'records' && (
          <Stack gap={3}>
            <SegmentedControl
              aria-label="시작 방식"
              value={mode}
              onValueChange={(next) => switchSource(next)}
              options={[
                { value: 'empty', label: '빈 가계부' },
                { value: 'copy', label: '복사해서 만들기', disabled: !sources.length },
              ]}
            />
            {mode === 'copy' && source && (
              <>
                <Field>
                  복사할 가계부
                  <SelectField value={sourceId} onValueChange={(id) => switchSource('copy', id)}>
                    {sources.map((ledger) => (
                      <SelectOption key={ledger.id} value={ledger.id}>
                        {ledger.name} · {periodLabel(ledger.period)}
                      </SelectOption>
                    ))}
                  </SelectField>
                </Field>
                <Field>
                  <Switch
                    checked={copyFixed}
                    onChange={(event) => setCopyFixed(event.target.checked)}
                  />
                  고정지출 내역도 가져오기
                </Field>
              </>
            )}
          </Stack>
        )}
        <LedgerBasics
          name={name}
          onNameChange={(value) => {
            setName(value);
            setNameError(undefined);
          }}
          period={role === 'records' ? period : undefined}
          onPeriodChange={setPeriod}
          icon={icon}
          onIconChange={setIcon}
          nameError={nameError}
        />
        {role === 'records' ? (
          <Stack gap={3}>
            <h3>필드</h3>
            <FieldSchemaEditor fields={fields} onChange={setFields} />
          </Stack>
        ) : (
          <ChildPicker ledgers={ledgers} value={childIds} onValueChange={setChildIds} />
        )}
        <ParentPicker
          ledgers={ledgers}
          value={parentIds}
          onValueChange={setParentIds}
          onCreateParent={onCreateParent}
        />
      </Stack>
    </FullScreenSheet>
  );
}

/**
 * A ledger's settings. One that holds records edits basics, fields and each select field's
 * tags; a parent edits its children. Both choose their parents and can be archived.
 */
export function LedgerSettingsView({
  ledger,
  ledgers,
  onSave,
  onArchive,
  onClose,
}: {
  ledger: Ledger;
  /** All ledgers, to place this one among parents and children. */
  ledgers: Ledger[];
  onSave(result: { ledger: Ledger; parentIds: Id[] }): void;
  onArchive(ledger: Ledger): void;
  onClose(): void;
}) {
  const parent = isParent(ledger);
  const initialParents = ledgers
    .filter((item) => item.childIds.includes(ledger.id))
    .map((item) => item.id);
  const [draft, setDraft] = useState(ledger);
  const [parentIds, setParentIds] = useState(initialParents);
  const selectFields = draft.fields.filter(
    (field): field is Extract<FieldDef, { type: 'select' | 'multiSelect' }> =>
      field.type !== 'text',
  );
  const [tagFieldId, setTagFieldId] = useState(selectFields[0]?.id ?? '');
  const tagField = selectFields.find((field) => field.id === tagFieldId);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(ledger) || parentIds.join() !== initialParents.join();
  return (
    <FullScreenSheet
      title="가계부 설정"
      subtitle={ledger.name}
      dirty={dirty}
      onClose={onClose}
      footer={
        <>
          <Button className="view-danger" onClick={() => onArchive(ledger)}>
            보관
          </Button>
          <Button
            variant="primary"
            disabled={!draft.name.trim() || (parent && !draft.childIds.length)}
            onClick={() =>
              onSave({
                ledger: {
                  ...draft,
                  name: draft.name.trim(),
                  period: parent ? spanOf(ledgers, draft.childIds, draft.period) : draft.period,
                },
                parentIds,
              })
            }
          >
            저장
          </Button>
        </>
      }
    >
      <Stack gap={6}>
        <LedgerBasics
          name={draft.name}
          onNameChange={(name) => setDraft({ ...draft, name })}
          period={parent ? undefined : draft.period}
          onPeriodChange={(period) => setDraft({ ...draft, period })}
          icon={draft.icon}
          onIconChange={(icon) => setDraft({ ...draft, icon })}
          nameError={draft.name.trim() ? undefined : '이름을 입력해 주세요.'}
        />
        {parent ? (
          <ChildPicker
            ledgers={ledgers}
            self={ledger}
            value={draft.childIds}
            onValueChange={(childIds) => setDraft({ ...draft, childIds })}
          />
        ) : (
          <>
            <Stack gap={3}>
              <h3>필드</h3>
              <FieldSchemaEditor
                fields={draft.fields}
                onChange={(fields) => setDraft({ ...draft, fields })}
              />
            </Stack>
            {tagField && (
              <Stack gap={3}>
                <h3>태그 옵션</h3>
                <Field>
                  필드
                  <SelectField value={tagFieldId} onValueChange={setTagFieldId}>
                    {selectFields.map((field) => (
                      <SelectOption key={field.id} value={field.id}>
                        {field.name}
                      </SelectOption>
                    ))}
                  </SelectField>
                </Field>
                <TagOptionEditor
                  field={tagField}
                  onChange={(options) =>
                    setDraft({
                      ...draft,
                      fields: draft.fields.map((field) =>
                        field.id === tagField.id ? { ...tagField, options } : field,
                      ),
                    })
                  }
                />
              </Stack>
            )}
          </>
        )}
        <ParentPicker
          ledgers={ledgers}
          self={ledger}
          value={parentIds}
          onValueChange={setParentIds}
        />
      </Stack>
    </FullScreenSheet>
  );
}
