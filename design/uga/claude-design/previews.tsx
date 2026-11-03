/**
 * Live previews for the Claude Design system, one per Storybook catalog entry (Atoms to
 * Organisms). They mount the real components with the Storybook sample data.
 */
import { useState, type ReactNode } from 'react';
import { Info, MoreHorizontal, Plus, Settings2 } from 'lucide-react';
import {
  Amount,
  AmountInput,
  Bar,
  Button,
  Checkbox,
  ChipSelect,
  ColorField,
  CountBadge,
  DateField,
  Empty,
  Field,
  FilterChip,
  FormFooter,
  FormGrid,
  IconButton,
  Inline,
  Input,
  List,
  ListRow,
  Menu,
  MonthField,
  Notice,
  Panel,
  Radio,
  SearchField,
  SegmentedControl,
  SelectField,
  SelectOption,
  Slider,
  Stack,
  Stat,
  StatBar,
  SummaryGrid,
  Surface,
  Switch,
  Tag,
  Textarea,
  TextField,
  Toolbar,
  Tooltip,
} from '../../../src/client/ui';
import {
  AvatarPicker,
  FriendList,
  FriendPicker,
  MemberList,
  ParentPicker,
  PeriodCalendar,
  PersonRow,
  RecordFilterBar,
  RecordForm,
  RecordList,
  RecordTable,
  RoomHeader,
  RoomInviteRow,
  RoomListItem,
  RoomTabBar,
  StatsBreakdown,
  SummaryStrip,
  TagOptionEditor,
  type NatureFilter,
  type RecordDraft,
  type RoomView,
} from '../../../src/client/ledger';
import { UgaIcon } from '../../../src/client/brand/Uga';
import {
  defaultStatAxis,
  roomRecords,
  totals,
  type FieldDef,
  type KindOption,
} from '../../../src/shared/ledger';
import {
  FIXTURE_TODAY,
  friends,
  invites,
  ledgers,
  me,
  minho,
  november,
  records,
  seoyeon,
  tripMembers,
  yedi,
  year2026,
} from '../../../src/stories/fixtures';

const noop = () => {};
const Phone = ({ children }: { children: ReactNode }) => (
  <div className="ds-frame ds-phone">{children}</div>
);
const Wide = ({ children }: { children: ReactNode }) => <div className="ds-frame">{children}</div>;
const novemberRecords = roomRecords(ledgers, november, records);
const latestOf = (ledgerId: string) =>
  roomRecords(
    ledgers,
    ledgers.find((ledger) => ledger.id === ledgerId)!,
    records,
  ).reduce<(typeof records)[number] | undefined>(
    (last, record) => (!last || record.createdAt > last.createdAt ? record : last),
    undefined,
  );
const categoryField = november.fields.find(
  (field): field is Extract<FieldDef, { type: 'select' | 'multiSelect' }> =>
    field.type !== 'text' && field.name === '카테고리',
)!;

export const previews: Record<string, () => ReactNode> = {
  Button: () => (
    <Wide>
      <Inline gap={2} align="center">
        <Button variant="primary">저장</Button>
        <Button>저장하고 계속</Button>
        <Button variant="plain">취소</Button>
        <Button variant="primary" busy>
          저장 중
        </Button>
        <Button disabled>보관됨</Button>
        <IconButton aria-label="설정">
          <Settings2 size={20} />
        </IconButton>
      </Inline>
    </Wide>
  ),
  Input: () => (
    <Phone>
      <Stack gap={3}>
        <Input aria-label="내용" placeholder="무엇_어디서" />
        <Textarea aria-label="메모" placeholder="메모" rows={2} />
        <Inline gap={4} align="center">
          <Field className="ds-check">
            <Checkbox defaultChecked /> 고정지출 가져오기
          </Field>
          <Field className="ds-check">
            <Radio name="kind" defaultChecked /> 지출
          </Field>
          <Field className="ds-check">
            <Radio name="kind" /> 수입
          </Field>
        </Inline>
      </Stack>
    </Phone>
  ),
  Switch: () => (
    <Wide>
      <Inline gap={6} align="center">
        <Field className="ds-check">
          <Switch defaultChecked /> 결제방식 표시
        </Field>
        <Field className="ds-check">
          <Switch /> 비고 표시
        </Field>
      </Inline>
    </Wide>
  ),
  Slider: () => (
    <Phone>
      <Slider aria-label="예산 사용률" defaultValue={64} />
    </Phone>
  ),
  Tag: () => (
    <Wide>
      <Inline gap={2} align="center">
        <Tag name="장보기" color="#64866F" />
        <Tag name="외식/배달/간식" color="#D28C70" />
        <Tag name="자동이체" color="#286588" />
        <Tag name="통신비" color="#7CC7F2" archived />
        <Tag name="준상" color="#7CC7F2" onRemove={noop} removeLabel="준상 빼기" />
      </Inline>
    </Wide>
  ),
  Tooltip: () => (
    <Wide>
      <Tooltip content="하위 가계부의 내역을 함께 포함해요.">
        <IconButton aria-label="조회 대상 도움말">
          <Info size={20} />
        </IconButton>
      </Tooltip>
    </Wide>
  ),
  Stack: () => (
    <Phone>
      <Surface padding={4} raised>
        <Stack gap={3}>
          <strong>11월</strong>
          <p className="muted">10/23 – 11/22 · 내역 36건</p>
          <Inline gap={2}>
            <Button variant="primary">열기</Button>
            <Button>설정</Button>
          </Inline>
        </Stack>
      </Surface>
    </Phone>
  ),
  Amount: () => (
    <Wide>
      <Inline gap={6} align="center">
        <Amount value={48000} />
        <Amount value={3200000} tone="income" signed />
        <Amount value={9550} tone="expense" signed size="lg" />
      </Inline>
    </Wide>
  ),
  CountBadge: () => (
    <Wide>
      <Inline gap={4} align="center">
        <CountBadge count={3} label="새 내역 3건" />
        <CountBadge count={128} label="새 내역 128건" />
      </Inline>
    </Wide>
  ),
  Bar: () => (
    <Phone>
      <Stack gap={3}>
        <Bar value={646490} max={1228562} />
        <Bar value={263820} max={1228562} color="#64866F" />
        <Bar value={98000} max={1228562} color="#286588" />
      </Stack>
    </Phone>
  ),
  TextField: () => (
    <Phone>
      <Stack gap={4}>
        <TextField
          label="이름"
          placeholder="예: 12월, 일본여행"
          hint="방 목록에 보이는 이름이에요."
        />
        <TextField
          label="아이디"
          defaultValue="JS"
          error="아이디는 영문 소문자·숫자·밑줄 4–20자로 정해 주세요."
        />
      </Stack>
    </Phone>
  ),
  SelectField: () => (
    <Phone>
      <Field>
        필드
        <SelectField value="cat" onValueChange={noop}>
          <SelectOption value="pay">결제방식</SelectOption>
          <SelectOption value="cat">카테고리</SelectOption>
          <SelectOption value="who">누가</SelectOption>
        </SelectField>
      </Field>
    </Phone>
  ),
  DateField: function DatePreview() {
    const [date, setDate] = useState(FIXTURE_TODAY);
    const [month, setMonth] = useState(FIXTURE_TODAY.slice(0, 7));
    return (
      <Phone>
        <Stack gap={3}>
          <DateField aria-label="날짜" value={date} onValueChange={setDate} />
          <MonthField aria-label="월" value={month} onValueChange={setMonth} />
        </Stack>
      </Phone>
    );
  },
  ColorField: function ColorPreview() {
    const [color, setColor] = useState('#64866F');
    return (
      <Wide>
        <Inline gap={4} align="center">
          <ColorField compact aria-label="장보기 색상" value={color} onValueChange={setColor} />
          <span className="muted">{color}</span>
        </Inline>
      </Wide>
    );
  },
  SegmentedControl: function SegmentedPreview() {
    const [nature, setNature] = useState('expense');
    return (
      <Phone>
        <SegmentedControl
          aria-label="구분"
          value={nature}
          onValueChange={setNature}
          options={[
            { value: 'income', label: '수입' },
            { value: 'fixed', label: '고정지출' },
            { value: 'expense', label: '지출' },
          ]}
        />
      </Phone>
    );
  },
  Empty: () => (
    <Phone>
      <Empty>아직 기록한 내역이 없어요. 첫 내역을 추가해 보세요.</Empty>
    </Phone>
  ),
  Stat: () => (
    <Wide>
      <Inline gap={3}>
        <Stat label="이번 달 지출" amount={1250000} hint="11월 · 10/23 – 11/22" />
        <Stat label="남은 금액" amount={6452618} hint="수입 − 지출" accent />
      </Inline>
    </Wide>
  ),
  AmountInput: function AmountPreview() {
    const [value, setValue] = useState<number | null>(9550);
    return (
      <Phone>
        <Stack gap={2}>
          <Field htmlFor="ds-amount">금액</Field>
          <AmountInput id="ds-amount" value={value} onValueChange={setValue} placeholder="0" />
        </Stack>
      </Phone>
    );
  },
  SearchField: function SearchPreview() {
    const [query, setQuery] = useState('쿠팡');
    return (
      <Phone>
        <SearchField
          aria-label="내역 검색"
          placeholder="내용·메모 검색"
          value={query}
          onValueChange={setQuery}
        />
      </Phone>
    );
  },
  FilterChip: () => (
    <Wide>
      <Inline gap={2}>
        <FilterChip label="구분: 지출" onRemove={noop} />
        <FilterChip label="카테고리: 외식/배달/간식" onRemove={noop} />
        <FilterChip label="누가: 예디" onRemove={noop} />
      </Inline>
    </Wide>
  ),
  ChipSelect: function ChipPreview() {
    const [options, setOptions] = useState(categoryField.options.slice(0, 5));
    const [value, setValue] = useState([options[1].id]);
    return (
      <Phone>
        <ChipSelect
          label="카테고리"
          options={options}
          value={value}
          onValueChange={setValue}
          onCreateOption={(name, color) => {
            const id = `new-${name}`;
            setOptions((all) => [...all, { id, name, color }]);
            return id;
          }}
        />
      </Phone>
    );
  },
  Menu: () => (
    <Wide>
      <Menu
        label="11월 메뉴"
        items={[
          { label: '설정', icon: <Settings2 size={18} />, onSelect: noop },
          { label: '복사해서 만들기', onSelect: noop },
          { label: '보관', tone: 'danger', onSelect: noop },
        ]}
        trigger={(props) => (
          <IconButton {...props} aria-label="11월 메뉴">
            <MoreHorizontal size={22} />
          </IconButton>
        )}
      />
    </Wide>
  ),
  List: () => (
    <Phone>
      <List aria-label="가계부">
        <ListRow
          leading={<UgaIcon name="ledger" size={36} />}
          title="11월"
          description="장보기_쿠팡 · 9,550원"
          trailing={<span>오후 8:12</span>}
          onClick={noop}
        />
        <ListRow
          leading={<UgaIcon name="sprout" size={36} />}
          title="일본여행"
          description="공항 리무진 · 32,000원"
          trailing={<span>10월 12일</span>}
          onClick={noop}
        />
      </List>
    </Phone>
  ),
  StatBar: () => (
    <Phone>
      <Stack gap={3}>
        <StatBar label="장보기" value={200380} total={654320} max={200380} color="#64866F" />
        <StatBar
          label="외식/배달/간식"
          value={154300}
          total={654320}
          max={200380}
          color="#D28C70"
        />
        <StatBar label="교통" value={56000} total={654320} max={200380} color="#286588" />
      </Stack>
    </Phone>
  ),
  FormBody: () => (
    <Phone>
      <Stack gap={4}>
        <FormGrid>
          <TextField label="이름" defaultValue="12월" />
          <TextField label="아이콘" defaultValue="가계부" />
        </FormGrid>
        <FormFooter>
          <Button>저장하고 계속</Button>
          <Button variant="primary">저장</Button>
        </FormFooter>
      </Stack>
    </Phone>
  ),
  Panel: () => (
    <Wide>
      <Panel>
        <Toolbar>
          <strong>11월 요약</strong>
          <Button>
            <Plus size={16} />
            내역 추가
          </Button>
        </Toolbar>
        <SummaryGrid>
          <Stat label="수입" amount={8332170} hint="10/23 – 11/22" />
          <Stat label="지출" amount={1879552} hint="10/23 – 11/22" />
          <Stat label="남은 금액" amount={6452618} hint="수입 − 지출" accent />
        </SummaryGrid>
      </Panel>
    </Wide>
  ),
  Notice: () => <Notice onClose={noop}>저장하지 못했어요. 잠시 후 다시 해 주세요.</Notice>,
  RoomListItem: () => (
    <Phone>
      <List aria-label="방 목록">
        {[november, year2026, ledgers.find((ledger) => ledger.id === 'dec')!].map((room, index) => (
          <RoomListItem
            key={room.id}
            room={room}
            latest={latestOf(room.id)}
            unseen={index === 0 ? 3 : 0}
            today={FIXTURE_TODAY}
            onOpen={noop}
          />
        ))}
      </List>
    </Phone>
  ),
  RoomHeader: () => (
    <Phone>
      <RoomHeader
        title="11월"
        subtitle="10/23 – 11/22"
        onBack={noop}
        menuItems={[
          { label: '설정', onSelect: noop },
          { label: '멤버', onSelect: noop },
        ]}
      />
    </Phone>
  ),
  RoomTabBar: function TabPreview() {
    const [view, setView] = useState<RoomView>('table');
    return (
      <Phone>
        <RoomTabBar
          views={['table', 'calendar', 'stats']}
          view={view}
          onViewChange={setView}
          onAdd={noop}
        />
      </Phone>
    );
  },
  SummaryStrip: () => (
    <Phone>
      <SummaryStrip totals={totals(novemberRecords, ledgers)} />
    </Phone>
  ),
  RecordList: () => (
    <Phone>
      <RecordList records={novemberRecords.slice(-6)} ledgers={ledgers} onOpenRecord={noop} />
    </Phone>
  ),
  RecordTable: () => (
    <Wide>
      <RecordTable records={novemberRecords.slice(-6)} ledgers={ledgers} onOpenRecord={noop} />
    </Wide>
  ),
  RecordFilterBar: function FilterPreview() {
    const [query, setQuery] = useState('');
    const [nature, setNature] = useState<NatureFilter>('all');
    const [wide, setWide] = useState(false);
    const [conditions, setConditions] = useState(['카테고리: 장보기']);
    return (
      <Phone>
        <RecordFilterBar
          query={query}
          onQueryChange={setQuery}
          nature={nature}
          onNatureChange={setNature}
          wide={wide}
          onWideChange={setWide}
          conditions={conditions}
          onRemoveCondition={(condition) =>
            setConditions((all) => all.filter((item) => item !== condition))
          }
        />
      </Phone>
    );
  },
  PeriodCalendar: function CalendarPreview() {
    const [selected, setSelected] = useState(FIXTURE_TODAY);
    return (
      <Phone>
        <PeriodCalendar
          period={november.period}
          records={novemberRecords}
          ledgers={ledgers}
          today={FIXTURE_TODAY}
          selected={selected}
          onSelect={setSelected}
        />
      </Phone>
    );
  },
  StatsBreakdown: function StatsPreview() {
    const [axis, setAxis] = useState(defaultStatAxis([november]));
    const [nature, setNature] = useState<KindOption['nature']>('expense');
    return (
      <Phone>
        <StatsBreakdown
          records={novemberRecords}
          ledgers={ledgers}
          axis={axis}
          onAxisChange={setAxis}
          nature={nature}
          onNatureChange={setNature}
        />
      </Phone>
    );
  },
  RecordForm: function FormPreview() {
    const [draft, setDraft] = useState<RecordDraft>({
      date: FIXTURE_TODAY,
      kindId: november.kinds.find((kind) => kind.name === '지출')!.id,
      title: '장보기_쿠팡',
      amount: 9550,
      values: { [categoryField.id]: [categoryField.options[2].id] },
    });
    return (
      <Phone>
        <RecordForm ledger={november} draft={draft} onChange={setDraft} />
      </Phone>
    );
  },
  TagOptionEditor: function TagPreview() {
    const [field, setField] = useState(categoryField);
    return (
      <Phone>
        <TagOptionEditor
          field={{ ...field, options: field.options.slice(0, 4) }}
          onChange={(options) => setField({ ...field, options })}
        />
      </Phone>
    );
  },
  ParentPicker: function ParentPreview() {
    const [value, setValue] = useState(['h2']);
    return (
      <Phone>
        <ParentPicker ledgers={ledgers} self={november} value={value} onValueChange={setValue} />
      </Phone>
    );
  },
  PersonRow: () => (
    <Phone>
      <List aria-label="사람">
        <PersonRow profile={me} description="@junsang · 나" />
        <PersonRow profile={yedi} trailing={<span className="ledger-member-role">편집</span>} />
      </List>
    </Phone>
  ),
  AvatarPicker: function AvatarPreview() {
    const [avatar, setAvatar] = useState('calm');
    return (
      <Phone>
        <AvatarPicker value={avatar} onValueChange={setAvatar} />
      </Phone>
    );
  },
  FriendList: () => (
    <Phone>
      <Stack gap={5}>
        <FriendList
          friends={friends}
          onAccept={noop}
          onDecline={noop}
          onCancel={noop}
          onRemove={noop}
          onBlock={noop}
          onUnblock={noop}
        />
      </Stack>
    </Phone>
  ),
  MemberList: () => (
    <Phone>
      <MemberList
        members={tripMembers}
        meId={me.id}
        canManage
        onRoleChange={noop}
        onRemove={noop}
      />
    </Phone>
  ),
  FriendPicker: function PickerPreview() {
    const [value, setValue] = useState([seoyeon.id]);
    return (
      <Phone>
        <FriendPicker
          label="초대할 친구"
          friends={[yedi, minho, seoyeon]}
          value={value}
          onValueChange={setValue}
        />
      </Phone>
    );
  },
  RoomInviteRow: () => (
    <Phone>
      <List aria-label="받은 가계부 초대">
        <RoomInviteRow invite={invites[0]} today={FIXTURE_TODAY} onOpen={noop} />
      </List>
    </Phone>
  ),
};
