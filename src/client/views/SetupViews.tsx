import { useId, useState } from 'react';
import { UgaIcon, type UgaIconName } from '../brand/Uga';
import {
  FieldSchemaEditor,
  GroupPicker,
  TagOptionEditor,
  addDays,
  addMonths,
  periodLabel,
} from '../ledger';
import { FullScreenSheet } from '../templates';
import {
  Button,
  ChipSelect,
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
import type { FieldDef, Group, Id, IsoDate, KindOption, Ledger } from '../../shared/ledger';

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

/** Name, period and icon, shared by creating and editing a ledger. */
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
  period: { start: IsoDate; end: IsoDate };
  onPeriodChange(period: { start: IsoDate; end: IsoDate }): void;
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
        placeholder="예: 12월, 일본여행"
        required
        error={nameError}
        onChange={(event) => onNameChange(event.target.value)}
      />
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

/** Fresh ids keep a copied ledger independent; names stay so group stats still merge. */
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

/**
 * Creating a ledger: empty, or copied from an existing one with its fields, tags and kinds and
 * the period moved one month later. Copying can also bring the source's 고정지출 records.
 */
export function CreateLedgerView({
  ledgers,
  groups,
  today,
  initialSourceId,
  onCreate,
  onCreateGroup,
  onClose,
}: {
  ledgers: Ledger[];
  groups: Group[];
  today: IsoDate;
  /** Start in copy mode from this ledger, e.g. from a room's 복사해서 만들기. */
  initialSourceId?: Id;
  onCreate(result: { ledger: Ledger; groupIds: Id[]; copyFixedFrom?: Id }): void;
  onCreateGroup?(name: string): Id;
  onClose(): void;
}) {
  const sources = ledgers.filter((ledger) => !ledger.archived);
  const [mode, setMode] = useState<'empty' | 'copy'>(initialSourceId ? 'copy' : 'empty');
  const [sourceId, setSourceId] = useState(initialSourceId ?? sources[0]?.id ?? '');
  const source = sources.find((ledger) => ledger.id === sourceId);
  const nextPeriod = (ledger?: Ledger) =>
    ledger
      ? { start: addMonths(ledger.period.start, 1), end: addMonths(ledger.period.end, 1) }
      : { start: today, end: addDays(addMonths(today, 1), -1) };
  const [name, setName] = useState('');
  const [period, setPeriod] = useState(() => nextPeriod(mode === 'copy' ? source : undefined));
  const [icon, setIcon] = useState(source && mode === 'copy' ? source.icon : 'ledger');
  const [fields, setFields] = useState<FieldDef[]>(() =>
    mode === 'copy' && source ? copySchema(source).fields : [],
  );
  const [groupIds, setGroupIds] = useState<Id[]>([]);
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
    const kinds =
      mode === 'copy' && source
        ? copySchema(source).kinds
        : DEFAULT_KINDS.map((kind) => ({ ...kind, id: crypto.randomUUID() }));
    onCreate({
      ledger: { id: crypto.randomUUID(), name: name.trim(), icon, period, kinds, fields },
      groupIds,
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
        <LedgerBasics
          name={name}
          onNameChange={(value) => {
            setName(value);
            setNameError(undefined);
          }}
          period={period}
          onPeriodChange={setPeriod}
          icon={icon}
          onIconChange={setIcon}
          nameError={nameError}
        />
        <Stack gap={3}>
          <h3>필드</h3>
          <FieldSchemaEditor fields={fields} onChange={setFields} />
        </Stack>
        <GroupPicker
          groups={groups}
          value={groupIds}
          onValueChange={setGroupIds}
          onCreateGroup={onCreateGroup}
        />
      </Stack>
    </FullScreenSheet>
  );
}

/** A ledger's settings: basics, fields, each select field's tags, groups and archiving. */
export function LedgerSettingsView({
  ledger,
  groups,
  onSave,
  onArchive,
  onClose,
}: {
  ledger: Ledger;
  groups: Group[];
  onSave(result: { ledger: Ledger; groupIds: Id[] }): void;
  onArchive(ledger: Ledger): void;
  onClose(): void;
}) {
  const initialGroups = groups
    .filter((group) => group.ledgerIds.includes(ledger.id))
    .map((group) => group.id);
  const [draft, setDraft] = useState(ledger);
  const [groupIds, setGroupIds] = useState(initialGroups);
  const selectFields = draft.fields.filter(
    (field): field is Extract<FieldDef, { type: 'select' | 'multiSelect' }> =>
      field.type !== 'text',
  );
  const [tagFieldId, setTagFieldId] = useState(selectFields[0]?.id ?? '');
  const tagField = selectFields.find((field) => field.id === tagFieldId);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(ledger) || groupIds.join() !== initialGroups.join();
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
            disabled={!draft.name.trim()}
            onClick={() => onSave({ ledger: { ...draft, name: draft.name.trim() }, groupIds })}
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
          period={draft.period}
          onPeriodChange={(period) => setDraft({ ...draft, period })}
          icon={draft.icon}
          onIconChange={(icon) => setDraft({ ...draft, icon })}
          nameError={draft.name.trim() ? undefined : '이름을 입력해 주세요.'}
        />
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
        <GroupPicker groups={groups} value={groupIds} onValueChange={setGroupIds} />
      </Stack>
    </FullScreenSheet>
  );
}

/** A group's settings: name, icon and which ledgers it gathers; a ledger may be in many groups. */
export function GroupSettingsView({
  group,
  ledgers,
  onSave,
  onArchive,
  onClose,
}: {
  /** Omit to create a group. */
  group?: Group;
  ledgers: Ledger[];
  onSave(group: Group): void;
  onArchive?(group: Group): void;
  onClose(): void;
}) {
  const [initial] = useState<Group>(
    () => group ?? { id: crypto.randomUUID(), name: '', icon: 'star', ledgerIds: [] },
  );
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string>();
  const save = () => {
    if (!draft.name.trim()) {
      setError('이름을 입력해 주세요.');
      return;
    }
    onSave({ ...draft, name: draft.name.trim() });
  };
  return (
    <FullScreenSheet
      title={group ? '묶음 설정' : '묶음 만들기'}
      subtitle={group?.name}
      dirty={JSON.stringify(draft) !== JSON.stringify(initial)}
      onClose={onClose}
      footer={
        <>
          {group && onArchive && (
            <Button className="view-danger" onClick={() => onArchive(group)}>
              보관
            </Button>
          )}
          <Button variant="primary" onClick={save}>
            {group ? '저장' : '만들기'}
          </Button>
        </>
      }
    >
      <Stack gap={5}>
        <TextField
          label="이름"
          value={draft.name}
          placeholder="예: 2026, 여행"
          required
          error={error}
          onChange={(event) => {
            setDraft({ ...draft, name: event.target.value });
            setError(undefined);
          }}
        />
        <Field>
          아이콘
          <SelectField value={draft.icon} onValueChange={(icon) => setDraft({ ...draft, icon })}>
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
        <ChipSelect
          label="포함할 가계부"
          options={ledgers.map((ledger) => ({
            id: ledger.id,
            name: `${ledger.name} · ${periodLabel(ledger.period)}`,
            color: '#B9A27A',
            archived: ledger.archived,
          }))}
          value={draft.ledgerIds}
          onValueChange={(ledgerIds) => setDraft({ ...draft, ledgerIds })}
          multiple
        />
      </Stack>
    </FullScreenSheet>
  );
}
