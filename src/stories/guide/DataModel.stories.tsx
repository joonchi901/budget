import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Amount, Grid, Inline, Stack, Surface, Tag } from '../../client/ui';
import { groupRecords, ledgerForDate, totals, type Ledger, type Totals } from '../../shared/ledger';
import { FIXTURE_TODAY, groups, ledgers, records } from '../fixtures';

const natureName = { income: '수입', expense: '지출' };
const fieldType = { text: '텍스트', select: '단일 선택', multiSelect: '다중 선택' };

function TotalsLine({ label, value }: { label: string; value: Totals }) {
  return (
    <Inline gap={4} role="group" aria-label={`${label} 합계`} className="small">
      <span>
        <span className="muted">수입 </span>
        <Amount value={value.income} tone="income" />
      </span>
      <span>
        <span className="muted">지출 </span>
        <Amount value={value.expense} tone="expense" />
      </span>
      <span>
        <span className="muted">남은 금액 </span>
        <Amount value={value.balance} />
      </span>
    </Inline>
  );
}

function LedgerCard({ ledger }: { ledger: Ledger }) {
  const own = records.filter((record) => record.ledgerId === ledger.id);
  return (
    <Surface as="article" padding={4} raised aria-labelledby={`ledger-${ledger.id}`}>
      <Stack gap={3}>
        <Stack gap={1}>
          <h3 id={`ledger-${ledger.id}`}>{ledger.name}</h3>
          <p className="small muted">
            {ledger.period.start} ~ {ledger.period.end} · 내역 {own.length}건
          </p>
        </Stack>
        <Inline gap={2} aria-label="구분">
          {ledger.kinds.map((kind) => (
            <Tag
              key={kind.id}
              name={
                kind.name === natureName[kind.nature]
                  ? kind.name
                  : `${kind.name} · ${natureName[kind.nature]}`
              }
              color={kind.color}
            />
          ))}
        </Inline>
        <ul className="small">
          {ledger.fields.map((field) => (
            <li key={field.id}>
              {field.name} · {fieldType[field.type]}
              {field.type !== 'text' && ` · 옵션 ${field.options.length}개`}
            </li>
          ))}
        </ul>
        <TotalsLine label={ledger.name} value={totals(own, ledgers)} />
      </Stack>
    </Surface>
  );
}

function DataModel() {
  return (
    <Stack gap={6}>
      <header>
        <p className="eyebrow">DATA MODEL · SYNTHETIC</p>
        <h1>데이터 모델과 합성 데이터</h1>
        <p>
          src/shared/ledger.ts의 타입과 src/stories/fixtures.ts의 합성 데이터입니다.
          날짜·구분·내용·금액은 모든 가계부의 고정 필드이고, 나머지 필드와 태그 옵션은 가계부마다
          따로 둡니다. 내역은 한 가계부에만 속하고, 묶음은 가계부를 모아 보기만 합니다.
        </p>
      </header>
      <section aria-labelledby="ledgers-title">
        <Stack gap={3}>
          <h2 id="ledgers-title">가계부</h2>
          <Grid columns={3} tabletColumns={2} mobileColumns={1} gap={3}>
            {ledgers.map((ledger) => (
              <LedgerCard key={ledger.id} ledger={ledger} />
            ))}
          </Grid>
        </Stack>
      </section>
      <section aria-labelledby="groups-title">
        <Stack gap={3}>
          <h2 id="groups-title">묶음</h2>
          <p className="small muted">
            한 가계부가 여러 묶음에 들어갈 수 있습니다(일본여행 → 2026, 여행). 합계는 각 내역을 한
            번만 셉니다.
          </p>
          <Grid columns={2} mobileColumns={1} gap={3}>
            {groups.map((group) => (
              <Surface key={group.id} as="article" padding={4} raised>
                <Stack gap={2}>
                  <h3>{group.name}</h3>
                  <p className="small muted">
                    {group.ledgerIds
                      .map((id) => ledgers.find((ledger) => ledger.id === id)?.name)
                      .join(' · ')}{' '}
                    · 내역 {groupRecords(group, records).length}건
                  </p>
                  <TotalsLine
                    label={group.name}
                    value={totals(groupRecords(group, records), ledgers)}
                  />
                </Stack>
              </Surface>
            ))}
          </Grid>
        </Stack>
      </section>
      <p className="small muted">
        기준일 {FIXTURE_TODAY}에 묶음 방에서 내역을 추가하면 기간이 맞는{' '}
        <strong>{ledgerForDate(ledgers, FIXTURE_TODAY)?.name}</strong> 가계부를 제안합니다.
      </p>
    </Stack>
  );
}

const meta = {
  title: '00 Guide · 안내/데이터 모델',
  component: DataModel,
  parameters: {
    docs: {
      description: {
        component:
          '도메인 타입과 합성 데이터의 기준. 금액은 Notion 샘플과 같아 합계가 맞는지 play에서 확인합니다. 합성 데이터가 타입 규칙(recordProblems)을 어기면 모든 스토리가 실패합니다.',
      },
    },
  },
} satisfies Meta<typeof DataModel>;
export default meta;

export const Overview: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const expectTotals = async (label: string, values: string[]) => {
      const totalsList = c.getByLabelText(`${label} 합계`);
      for (const value of values) await expect(totalsList).toHaveTextContent(value);
    };
    await expectTotals('11월', ['8,332,170원', '1,875,052원', '6,457,118원']);
    await expectTotals('일본여행', ['811,900원']);
    await expectTotals('2026', ['8,332,170원', '2,686,952원', '5,645,218원']);
    await expectTotals('여행', ['811,900원', '−811,900원']);
    await expect(c.getByText('11월', { selector: 'strong' })).toBeVisible();
  },
};
