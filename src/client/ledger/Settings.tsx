import { useState } from 'react';
import { ArrowDown, ArrowUp, Lock } from 'lucide-react';
import {
  Button,
  ColorField,
  Field,
  IconButton,
  Inline,
  Input,
  List,
  ListRow,
  SegmentedControl,
  Stack,
  Switch,
  TextField,
  pickTagColor,
} from '../ui';
import type { FieldDef, KindOption, TagOption } from '../../shared/ledger';

const FIXED_FIELDS = ['유형', '금액', '내용', '날짜'];
const typeLabel: Record<FieldDef['type'], string> = {
  text: '텍스트',
  select: '단일 선택',
  multiSelect: '다중 선택',
};

/**
 * A ledger's field list. Fixed fields are locked; own fields can be reordered, hidden and
 * added. Existing fields keep their type so recorded values stay valid.
 */
export function FieldSchemaEditor({
  fields,
  onChange,
}: {
  fields: FieldDef[];
  onChange(fields: FieldDef[]): void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<FieldDef['type']>('select');
  const [error, setError] = useState('');
  const move = (index: number, delta: number) => {
    const next = [...fields];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(next);
  };
  const add = () => {
    const trimmed = name.trim();
    const taken = [...FIXED_FIELDS, ...fields.map((field) => field.name)].some(
      (existing) => existing.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
    );
    if (!trimmed || taken) {
      setError(trimmed ? '이미 있는 필드 이름이에요.' : '필드 이름을 입력해 주세요.');
      return;
    }
    const id = crypto.randomUUID();
    onChange([
      ...fields,
      type === 'text' ? { id, name: trimmed, type } : { id, name: trimmed, type, options: [] },
    ]);
    setName('');
    setError('');
  };
  return (
    <Stack gap={4}>
      <List aria-label="필드">
        {FIXED_FIELDS.map((fixed) => (
          <ListRow
            key={fixed}
            title={fixed}
            description={
              fixed === '유형' ? '모든 가계부 공통 · 태그 옵션에서 관리' : '모든 가계부 공통'
            }
            trailing={<Lock size={16} aria-hidden="true" />}
          />
        ))}
        {fields.map((field, index) => (
          <ListRow
            key={field.id}
            title={field.name}
            description={`${typeLabel[field.type]}${field.type === 'text' ? '' : ` · 옵션 ${field.options.length}개`}${field.hidden ? ' · 숨김' : ''}`}
            trailing={
              <Inline gap={1} align="center">
                <IconButton
                  aria-label={`${field.name} 위로`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={18} />
                </IconButton>
                <IconButton
                  aria-label={`${field.name} 아래로`}
                  disabled={index === fields.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={18} />
                </IconButton>
                <Field>
                  <Switch
                    checked={!field.hidden}
                    onChange={(event) =>
                      onChange(
                        fields.map((item) =>
                          item.id === field.id ? { ...item, hidden: !event.target.checked } : item,
                        ),
                      )
                    }
                  />
                  <span className="sr-only">{field.name} 표시</span>
                </Field>
              </Inline>
            }
          />
        ))}
      </List>
      <Stack gap={3} className="ledger-add-box">
        <TextField
          label="새 필드 이름"
          value={name}
          placeholder="예: 결제방식"
          error={error || undefined}
          onChange={(event) => setName(event.target.value)}
        />
        <SegmentedControl<FieldDef['type']>
          aria-label="새 필드 형태"
          value={type}
          onValueChange={setType}
          options={[
            { value: 'select', label: '단일 선택' },
            { value: 'multiSelect', label: '다중 선택' },
            { value: 'text', label: '텍스트' },
          ]}
        />
        <Button onClick={add}>필드 추가</Button>
      </Stack>
    </Stack>
  );
}

/** Options of one select field: color, name, archive, and adding. Archived options stay in history. */
export function TagOptionEditor({
  field,
  onChange,
}: {
  field: Extract<FieldDef, { type: 'select' | 'multiSelect' }>;
  onChange(options: TagOption[]): void;
}) {
  const [name, setName] = useState('');
  // Until the user picks one, a new option takes the palette color its siblings use least.
  const [picked, setPicked] = useState<string>();
  const color = picked ?? pickTagColor(field.options.map((option) => option.color));
  const update = (id: string, patch: Partial<TagOption>) =>
    onChange(field.options.map((option) => (option.id === id ? { ...option, ...patch } : option)));
  const add = () => {
    const trimmed = name.trim();
    if (
      !trimmed ||
      field.options.some(
        (option) => option.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
      )
    )
      return;
    onChange([...field.options, { id: crypto.randomUUID(), name: trimmed, color }]);
    setName('');
    setPicked(undefined);
  };
  return (
    <Stack gap={3}>
      <List aria-label={`${field.name} 옵션`}>
        {field.options.map((option) => (
          <li key={option.id} className="ui-list-item">
            <Inline gap={2} align="center" className="ledger-option-row">
              <ColorField
                compact
                aria-label={`${option.name} 색상`}
                value={option.color}
                onValueChange={(color) => update(option.id, { color })}
                disabled={option.archived}
              />
              <Input
                aria-label={`${option.name} 이름`}
                value={option.name}
                disabled={option.archived}
                onChange={(event) => update(option.id, { name: event.target.value })}
              />
              <Button
                variant="plain"
                className="ledger-option-archive"
                onClick={() => update(option.id, { archived: !option.archived })}
              >
                {option.archived ? '보관 해제' : '보관'}
              </Button>
            </Inline>
          </li>
        ))}
      </List>
      <Inline gap={2} align="center" wrap={false} className="ledger-option-new">
        <ColorField
          compact
          aria-label={`${field.name} 새 옵션 색상`}
          value={color}
          onValueChange={setPicked}
        />
        <Input
          aria-label={`${field.name} 새 옵션 이름`}
          placeholder="새 옵션"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button onClick={add}>추가</Button>
      </Inline>
    </Stack>
  );
}

/**
 * 유형 options, managed like tags, each counted as 수입 or 지출. The base 수입 and 지출 can be
 * renamed and recolored but never archived; others (고정지출 and so on) are added here.
 */
export function KindOptionEditor({
  kinds,
  onChange,
}: {
  kinds: KindOption[];
  onChange(kinds: KindOption[]): void;
}) {
  const [name, setName] = useState('');
  const [nature, setNature] = useState<KindOption['nature']>('expense');
  const [picked, setPicked] = useState<string>();
  const color = picked ?? pickTagColor(kinds.map((kind) => kind.color));
  const update = (id: string, patch: Partial<KindOption>) =>
    onChange(kinds.map((kind) => (kind.id === id ? { ...kind, ...patch } : kind)));
  const add = () => {
    const trimmed = name.trim();
    if (
      !trimmed ||
      kinds.some((kind) => kind.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())
    )
      return;
    onChange([...kinds, { id: crypto.randomUUID(), name: trimmed, color, nature }]);
    setName('');
    setPicked(undefined);
  };
  return (
    <Stack gap={3}>
      <List aria-label="유형 옵션">
        {kinds.map((kind) => (
          <li key={kind.id} className="ui-list-item">
            <Inline gap={2} align="center" className="ledger-option-row">
              <ColorField
                compact
                aria-label={`${kind.name} 색상`}
                value={kind.color}
                onValueChange={(next) => update(kind.id, { color: next })}
                disabled={kind.archived}
              />
              <Input
                aria-label={`${kind.name} 이름`}
                value={kind.name}
                disabled={kind.archived}
                onChange={(event) => update(kind.id, { name: event.target.value })}
              />
              <span className="ledger-kind-nature">
                {kind.nature === 'income' ? '수입' : '지출'}
              </span>
              {kind.base ? (
                <span className="ledger-kind-base">기본</span>
              ) : (
                <Button
                  variant="plain"
                  className="ledger-option-archive"
                  onClick={() => update(kind.id, { archived: !kind.archived })}
                >
                  {kind.archived ? '보관 해제' : '보관'}
                </Button>
              )}
            </Inline>
          </li>
        ))}
      </List>
      <Stack gap={2}>
        <SegmentedControl<KindOption['nature']>
          aria-label="새 유형이 더해지는 곳"
          value={nature}
          onValueChange={setNature}
          options={[
            { value: 'income', label: '수입으로' },
            { value: 'expense', label: '지출로' },
          ]}
        />
        <Inline gap={2} align="center" wrap={false} className="ledger-option-new">
          <ColorField
            compact
            aria-label="유형 새 옵션 색상"
            value={color}
            onValueChange={setPicked}
          />
          <Input
            aria-label="유형 새 옵션 이름"
            placeholder="예: 고정지출"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add();
              }
            }}
          />
          <Button onClick={add}>추가</Button>
        </Inline>
      </Stack>
    </Stack>
  );
}
