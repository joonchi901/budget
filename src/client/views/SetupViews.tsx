import { useId, useState } from 'react';
import { UgaIcon, type UgaIconName } from '../brand/Uga';
import {
  ChildPicker,
  FieldSchemaEditor,
  KindOptionEditor,
  ParentPicker,
  RecurringList,
  RecurringRuleForm,
  TagOptionEditor,
  addDays,
  addMonths,
  dayName,
  periodLabel,
} from '../ledger';
import { FullScreenSheet, useUnsavedGuard } from '../templates';
import {
  Button,
  Checkbox,
  DateField,
  Field,
  Grid,
  SegmentedControl,
  SelectField,
  SelectOption,
  Stack,
  TextField,
  won,
} from '../ui';
import {
  carriedRules,
  isParent,
  leafLedgers,
  type FieldDef,
  type Id,
  type IsoDate,
  type KindOption,
  type Ledger,
  type RecurringRule,
} from '../../shared/ledger';

const ICONS: { value: UgaIconName; label: string }[] = [
  { value: 'ledger', label: '기록' },
  { value: 'sprout', label: '새싹' },
  { value: 'heart', label: '하트' },
  { value: 'star', label: '별' },
  { value: 'home', label: '집' },
  { value: 'planning', label: '달력' },
];
const KINDS = 'kinds';
const DEFAULT_KINDS: Omit<KindOption, 'id'>[] = [
  { name: '수입', color: '#38735B', nature: 'income', base: true },
  { name: '지출', color: '#AE393B', nature: 'expense', base: true },
];
// A new empty ledger starts with these fields and no tags; tags are added while writing.
const defaultFields = (): FieldDef[] => [
  { id: crypto.randomUUID(), name: '결제방식', type: 'select', options: [] },
  { id: crypto.randomUUID(), name: '카테고리', type: 'select', options: [] },
  { id: crypto.randomUUID(), name: '누가', type: 'multiSelect', options: [], emptyLabel: '공동' },
  { id: crypto.randomUUID(), name: '비고', type: 'text' },
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
        <Grid columns={2} mobileColumns={2} gap={2} className="view-period">
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

/** The name a copy suggests: 12월 after 11월, 2027년 1월 after 2026년 12월; otherwise none. */
function nextName(name: string) {
  const found = /(?:(\d{4})년\s*)?(\d{1,2})월/.exec(name);
  if (!found) return '';
  const [text, year, month] = found;
  const wraps = Number(month) === 12;
  const next = `${year ? `${Number(year) + (wraps ? 1 : 0)}년 ` : ''}${wraps ? 1 : Number(month) + 1}월`;
  return name.replace(text, next);
}

/**
 * Creating a ledger. One that holds records starts empty or copied from another (fields, tags
 * and kinds, period one month later, the next month's name and the same parents, so a new
 * month joins its year and any asset following it). A 상위 가계부 only picks its children.
 * Either can sit under several parents.
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
  onCreate(result: { ledger: Ledger; parentIds: Id[] }): void;
  onCreateParent?(name: string): Id;
  onClose(): void;
}) {
  const sources = ledgers.filter((ledger) => !ledger.archived && !isParent(ledger));
  const [role, setRole] = useState<Role>('records');
  const [mode, setMode] = useState<'empty' | 'copy'>(initialSourceId ? 'copy' : 'empty');
  const [sourceId, setSourceId] = useState(initialSourceId ?? sources[0]?.id ?? '');
  const source = sources.find((ledger) => ledger.id === sourceId);
  /** 반복 내역 of the source left out of the copy. */
  const [skipped, setSkipped] = useState<Id[]>([]);
  const thisMonth = { start: today, end: addDays(addMonths(today, 1), -1) };
  const nextPeriod = (ledger?: Ledger) =>
    ledger
      ? { start: addMonths(ledger.period.start, 1), end: addMonths(ledger.period.end, 1) }
      : thisMonth;
  const parentsOf = (ledger?: Ledger) =>
    ledger
      ? ledgers.filter((item) => item.childIds.includes(ledger.id)).map((item) => item.id)
      : [];
  const suggestion = mode === 'copy' && source ? nextName(source.name) : '';
  const [name, setName] = useState(suggestion);
  const [period, setPeriod] = useState(() => nextPeriod(mode === 'copy' ? source : undefined));
  const [icon, setIcon] = useState(source && mode === 'copy' ? source.icon : 'ledger');
  const [fields, setFields] = useState<FieldDef[]>(() =>
    mode === 'copy' && source ? copySchema(source).fields : defaultFields(),
  );
  const [childIds, setChildIds] = useState<Id[]>([]);
  const [parentIds, setParentIds] = useState<Id[]>(() =>
    parentsOf(mode === 'copy' ? source : undefined),
  );
  const [nameError, setNameError] = useState<string>();

  const switchSource = (nextMode: 'empty' | 'copy', id = sourceId) => {
    const next = sources.find((ledger) => ledger.id === id);
    setMode(nextMode);
    setSourceId(id);
    setPeriod(nextPeriod(nextMode === 'copy' ? next : undefined));
    setFields(nextMode === 'copy' && next ? copySchema(next).fields : defaultFields());
    if (nextMode === 'copy' && next) setIcon(next.icon);
    // A name the person typed stays; a suggested one follows the source.
    if (name === suggestion) setName(nextMode === 'copy' && next ? nextName(next.name) : '');
    setParentIds(parentsOf(nextMode === 'copy' ? next : undefined));
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
    // A copy keeps the source's 통계 charts; they name fields, which keep their names.
    const statCards = mode === 'copy' ? source?.statCards : undefined;
    const ledger: Ledger = {
      id,
      name: name.trim(),
      icon,
      period,
      kinds,
      fields,
      childIds: [],
      ...(statCards ? { statCards } : {}),
    };
    // …and the 반복 내역 kept, found again by name in the copy's new kinds and tags.
    const kept = (mode === 'copy' && source?.recurring) || [];
    const recurring = carriedRules(
      kept.filter((rule) => !skipped.includes(rule.id)),
      source!,
      ledger,
    );
    onCreate({ ledger: recurring.length ? { ...ledger, recurring } : ledger, parentIds });
  };

  return (
    <FullScreenSheet
      title="가계부 만들기"
      dirty={name !== suggestion}
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
                {(source.recurring?.length ?? 0) > 0 && (
                  <Stack gap={2}>
                    <p className="view-meta">반복 내역은 새 기간의 날짜에 예정으로 넣어요.</p>
                    {source.recurring!.map((rule) => (
                      <Field key={rule.id}>
                        <Checkbox
                          checked={!skipped.includes(rule.id)}
                          onChange={(event) =>
                            setSkipped(
                              event.target.checked
                                ? skipped.filter((ruleId) => ruleId !== rule.id)
                                : [...skipped, rule.id],
                            )
                          }
                        />
                        {rule.title} · {dayName(rule.day)} · {won(rule.amount)}원
                      </Field>
                    ))}
                  </Stack>
                )}
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
 * A ledger's settings, shown in the room's 설정 tab. One that holds records edits basics, fields
 * and each select field's tags; a parent edits its children. Both choose their parents. 저장
 * stays above the tab bar and turns on once something changed; leaving with changes asks first.
 * 보관 takes a second tap, and an archived ledger offers 보관 해제.
 */
/** One 반복 내역 to change; 적용 puts it in the settings draft that 저장 keeps. */
function RuleSheet({
  initial,
  onApply,
  onClose,
}: {
  initial: RecurringRule;
  onApply(rule: RecurringRule): void;
  onClose(): void;
}) {
  const [rule, setRule] = useState(initial);
  return (
    <FullScreenSheet
      title="반복 내역"
      subtitle={dayName(rule.day)}
      dirty={JSON.stringify(rule) !== JSON.stringify(initial)}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          disabled={!rule.title.trim() || rule.amount <= 0}
          onClick={() => onApply({ ...rule, title: rule.title.trim() })}
        >
          적용
        </Button>
      }
    >
      <RecurringRuleForm rule={rule} onChange={setRule} />
    </FullScreenSheet>
  );
}

export function LedgerSettingsView({
  ledger,
  ledgers,
  today = new Date().toISOString().slice(0, 10),
  onSave,
  onArchive,
  onRestore,
  readOnly = false,
}: {
  ledger: Ledger;
  /** All ledgers, to place this one among parents and children. */
  ledgers: Ledger[];
  /** For each 반복 내역's next day. */
  today?: IsoDate;
  onSave(result: { ledger: Ledger; parentIds: Id[] }): void;
  onArchive(ledger: Ledger): void;
  onRestore?(ledger: Ledger): void;
  /** Someone else's ledger: shown as it is, since only its owner changes it (the server agrees). */
  readOnly?: boolean;
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
  // 유형 comes first among the tags: every ledger that holds records has it.
  const [tagFieldId, setTagFieldId] = useState(KINDS);
  const tagField = selectFields.find((field) => field.id === tagFieldId);
  // 보관 and 보관 해제 save at once and 통계 arranges its own charts, so neither is an unsaved
  // change here.
  const withoutArchive = ({ archived: _, statCards: __, ...rest }: Ledger) => JSON.stringify(rest);
  const dirty =
    withoutArchive(draft) !== withoutArchive(ledger) || parentIds.join() !== initialParents.join();
  useUnsavedGuard(dirty);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [rule, setRule] = useState<RecurringRule>();
  return (
    <Stack gap={6} className="view-settings">
      {readOnly && <p className="view-meta">설정은 이 가계부를 만든 사람만 바꿀 수 있어요.</p>}
      <fieldset className="view-fieldset" disabled={readOnly}>
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
              <h2 className="view-section-title">필드</h2>
              <FieldSchemaEditor
                fields={draft.fields}
                onChange={(fields) => setDraft({ ...draft, fields })}
              />
            </Stack>
            <Stack gap={3}>
              <h2 className="view-section-title">태그 옵션</h2>
              <Field>
                필드
                <SelectField value={tagFieldId} onValueChange={setTagFieldId}>
                  <SelectOption value={KINDS}>유형</SelectOption>
                  {selectFields.map((field) => (
                    <SelectOption key={field.id} value={field.id}>
                      {field.name}
                    </SelectOption>
                  ))}
                </SelectField>
              </Field>
              {tagField ? (
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
              ) : (
                <KindOptionEditor
                  kinds={draft.kinds}
                  onChange={(kinds) => setDraft({ ...draft, kinds })}
                />
              )}
            </Stack>
            <Stack gap={3}>
              <h2 className="view-section-title">반복 내역</h2>
              <p className="view-meta">
                바꾸거나 그만두면 아직 오지 않은 예정 내역에도 저장할 때 함께 적용돼요.
              </p>
              <RecurringList
                ledger={draft}
                rules={draft.recurring ?? []}
                today={today}
                onOpen={setRule}
                onRemove={(removed) =>
                  setDraft({
                    ...draft,
                    recurring: (draft.recurring ?? []).filter((item) => item.id !== removed.id),
                  })
                }
              />
            </Stack>
            {rule && (
              <RuleSheet
                initial={rule}
                onApply={(changed) => {
                  setDraft({
                    ...draft,
                    recurring: (draft.recurring ?? []).map((item) =>
                      item.id === changed.id ? changed : item,
                    ),
                  });
                  setRule(undefined);
                }}
                onClose={() => setRule(undefined)}
              />
            )}
          </>
        )}
        <ParentPicker
          ledgers={ledgers}
          self={ledger}
          value={parentIds}
          onValueChange={setParentIds}
        />
        <Stack gap={2}>
          <h2 className="view-section-title">보관</h2>
          <p className="view-meta">
            {ledger.archived
              ? '보관한 가계부예요. 보관을 풀면 방 목록에 다시 보여요.'
              : '보관하면 방 목록 맨 아래 "보관한 가계부"로 옮겨요. 내역은 그대로 남아요.'}
          </p>
          {ledger.archived ? (
            onRestore && <Button onClick={() => onRestore(ledger)}>보관 해제</Button>
          ) : (
            <Button
              className="view-danger"
              onClick={() => (confirmArchive ? onArchive(ledger) : setConfirmArchive(true))}
            >
              {confirmArchive ? '한 번 더 누르면 보관' : '보관'}
            </Button>
          )}
        </Stack>
      </fieldset>
      {!readOnly && (
        <Button
          variant="primary"
          className="view-sticky-action"
          disabled={!dirty || !draft.name.trim()}
          onClick={() =>
            onSave({
              ledger: {
                ...draft,
                archived: ledger.archived,
                statCards: ledger.statCards,
                name: draft.name.trim(),
                period: parent ? spanOf(ledgers, draft.childIds, draft.period) : draft.period,
              },
              parentIds,
            })
          }
        >
          저장
        </Button>
      )}
    </Stack>
  );
}
