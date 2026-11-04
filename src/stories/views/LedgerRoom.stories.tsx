import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ChatThread } from '../../client/ledger';
import { ledgerPath } from '../../shared/ledger';
import { LedgerRoomView, LedgerSettingsView } from '../../client/views';
import {
  FIXTURE_TODAY,
  december,
  ledgers,
  me,
  members,
  messages,
  november,
  records,
  travel,
  upcoming,
  year2026,
  yedi,
} from '../fixtures';

const meta = {
  title: '06 Views · 화면/가계부 방',
  component: LedgerRoomView,
  tags: ['autodocs'],
  globals: { viewport: { value: 'mobile390', isRotated: false } },
  parameters: {
    ownsMain: true,
    docs: {
      description: {
        component:
          '가계부 하나의 방. 상단에 방 이름·기간·요약, 하단에 내역·통계·설정 탭이 있습니다. 내역 탭은 위쪽 조회 도구 옆에서 표/캘린더를 바꾸고, 탭 막대 바로 위에 가로 전체 내역 추가 버튼이 늘 보입니다. 설정은 탭 안에서 바로 고칩니다. 하위 가계부가 있으면(상위 가계부) 아래 모든 내역을 한 번씩 모으고 금액 아래에 원본 가계부로 가는 링크("11월 →")를 두며, 캘린더는 월 단위로 넘깁니다. 하위 탭은 없고 이 링크로 하위 방에 들어갑니다. 통계 탭은 내역과 같은 조회 조건을 쓰고 그 아래 차트(요약·순위·비율·추이)를 보여 줍니다. 차트의 태그를 누르면 모든 차트가 그 조건으로 좁혀지고 "이 조건으로 내역 보기"로 표로 갑니다. 기준은 차트마다 잠깐 바꿔 볼 수 있고, 소유자는 그 기준을 기본으로 저장하거나 편집에서 차트를 더하고 빼고 순서를 바꿉니다. 내역마다 우가 스티커로 반응할 수 있습니다. 가계부마다(상위 포함) 설정 왼쪽에 그 가계부만의 대화 탭이 있고, 혼자 쓰면 메모라고 부릅니다. 입력창은 화면 아래 끝에 가로 전체로 붙습니다.',
      },
    },
  },
  args: {
    ledger: november,
    ledgers,
    records,
    today: FIXTURE_TODAY,
    onBack: () => {},
    onAddRecord: () => {},
    onOpenRecord: () => {},
    settings: null,
    onCopy: () => {},
    onOpenLedger: () => {},
  },
  render: function Logged(args) {
    const [log, setLog] = useState('');
    // 통계's charts save onto the ledger, as the app does for an owner.
    const [ledger, setLedger] = useState(args.ledger);
    return (
      <>
        <LedgerRoomView
          {...args}
          ledger={ledger}
          path={ledgerPath(args.ledgers, ledger.id)}
          onOpenPath={(item) => setLog(`경로: ${item.name}`)}
          onBack={() => setLog('가계부 목록')}
          onSaveStatCards={(statCards) => {
            setLedger({ ...ledger, statCards });
            setLog(`통계 저장: ${statCards.map((card) => card.chart).join(', ')}`);
          }}
          onAddRecord={(date) => setLog(`추가: ${date ?? '오늘'}`)}
          onOpenRecord={(record) => setLog(`열기: ${record.title}`)}
          reacting={{
            memberId: 'u1',
            members,
            onToggleReaction: (record, reaction) => setLog(`반응: ${record.title} ${reaction}`),
          }}
          settings={
            <LedgerSettingsView
              ledger={args.ledger}
              ledgers={args.ledgers}
              onSave={({ ledger }) => setLog(`설정 저장: ${ledger.name}`)}
              onArchive={() => setLog('보관')}
            />
          }
          chat={
            <ChatThread
              messages={messages.filter((message) => message.ledgerId === args.ledger.id)}
              memberId="u1"
              members={members}
              people={[me, yedi]}
              onToggleReaction={(_, reaction) => setLog(`반응: ${reaction}`)}
              onSend={(content) =>
                setLog(`대화: ${'text' in content ? content.text : content.sticker}`)
              }
            />
          }
          onCopy={() => setLog('복사')}
          onOpenLedger={(ledger) => setLog(`하위: ${ledger.name}`)}
          onOpenMembers={() => setLog('멤버')}
        />
        <p role="status" className="sr-only">
          {log}
        </p>
      </>
    );
  },
} satisfies Meta<typeof LedgerRoomView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Table: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('heading', { level: 1, name: '11월' })).toBeVisible();
    await userEvent.type(c.getByRole('searchbox', { name: '내역 검색' }), '쿠팡이츠');
    await expect(c.getAllByRole('button', { name: /쿠팡이츠/ })).toHaveLength(6);
    await expect(c.getByText(/^조건에 맞는 내역 6건 · 수입 0원 · 지출/)).toBeVisible();
    await userEvent.click(c.getByRole('button', { name: '조회 조건' }));
    await userEvent.click(c.getByRole('switch', { name: '넓게 보기' }));
    await expect(c.getByRole('region', { name: '내역 표' })).toBeVisible();
    await expect(c.getByRole('button', { name: '표' })).toHaveAttribute('aria-pressed', 'true');
    await expect(c.getByRole('button', { name: '내역 추가' })).toBeVisible();
  },
};
export const Settings: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '설정' }));
    await expect(c.queryByRole('button', { name: '내역 추가' })).toBeNull();
    await expect(c.getByRole('button', { name: '저장' })).toBeDisabled();
    const name = c.getByRole('textbox', { name: /^이름/ });
    await userEvent.clear(name);
    await userEvent.type(name, '11월 생활비');
    await userEvent.click(c.getByRole('button', { name: '저장' }));
    await expect(c.getByRole('status')).toHaveTextContent('설정 저장: 11월 생활비');
  },
};
export const CalendarDay: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(c.getByRole('button', { name: '캘린더' }));
    await userEvent.click(c.getByRole('button', { name: /^10월 31일/ }));
    await expect(page.getByRole('dialog', { name: '10월 31일 (토)' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: '이 날짜로 추가' }));
    await expect(c.getByRole('status')).toHaveTextContent('추가: 2026-10-31');
  },
};
export const Stats: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '통계' }));
    // A room starts with 요약, 순위, 비율 and 추이.
    for (const name of ['지출 요약', '지출 순위', '지출 비율', '날짜별 지출'])
      await expect(c.getByRole('heading', { level: 2, name })).toBeVisible();
    // Choosing 용돈 narrows every chart to it and stays on 통계.
    await userEvent.click(c.getByRole('button', { name: /^용돈/ }));
    await expect(c.getByRole('button', { name: '카테고리: 용돈 필터 해제' })).toBeVisible();
    await expect(
      within(c.getByRole('region', { name: '지출 요약' })).getAllByText(/500,000/)[0],
    ).toBeVisible();
    await userEvent.click(c.getByRole('button', { name: '이 조건으로 내역 보기' }));
    await expect(c.getAllByRole('heading', { level: 2 })[0]).toHaveTextContent('11월 1일');
    await expect(c.getByRole('button', { name: '카테고리: 용돈 필터 해제' })).toBeVisible();
    // The 유형 tag over the amount is a little shorter than the title line.
    const title = canvasElement.querySelector('.ui-list-row-title')!;
    const tag = canvasElement.querySelector('.ui-list-row-trailing > .tag-badge')!;
    await expect(tag.getBoundingClientRect().height).toBeLessThan(
      parseFloat(getComputedStyle(title).lineHeight),
    );
  },
};
export const StatsEdit: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(c.getByRole('button', { name: '통계' }));
    // A 기준 picked for now; the owner keeps it as the chart's own.
    await userEvent.click(c.getByRole('combobox', { name: '지출 순위 기준' }));
    await userEvent.click(c.getByRole('option', { name: '누가별' }));
    await userEvent.click(c.getByRole('button', { name: '이 기준을 기본으로 저장' }));
    await expect(c.getByRole('status')).toHaveTextContent('통계 저장: total, rank, donut, trend');
    await expect(c.queryByRole('button', { name: '이 기준을 기본으로 저장' })).toBeNull();
    // 편집: drop 비율, move 추이 up, add a 수입 순위, then 완료 saves them together.
    await userEvent.click(c.getByRole('button', { name: '편집' }));
    await userEvent.click(c.getByRole('button', { name: '결제방식별 지출 비율 삭제' }));
    await userEvent.click(c.getByRole('button', { name: '날짜별 지출 위로' }));
    await userEvent.click(c.getByRole('button', { name: '차트 추가' }));
    const sheet = within(page.getByRole('dialog', { name: '차트 추가' }));
    await userEvent.click(sheet.getByRole('button', { name: '수입' }));
    await userEvent.click(sheet.getByRole('button', { name: '추가' }));
    await userEvent.click(c.getByRole('button', { name: '완료' }));
    await expect(c.getByRole('status')).toHaveTextContent('통계 저장: total, trend, rank, rank');
    await expect(c.getByRole('heading', { level: 2, name: '수입 순위' })).toBeVisible();
  },
};
export const Reactions: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '빵 터짐 1명' }));
    await expect(c.getByRole('status')).toHaveTextContent('반응: 프레드피자_쿠팡이츠 cracking-up');
  },
};
export const Chat: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '대화' }));
    await expect(c.getByText('11월 고정지출 다 넣었어')).toBeVisible();
    await userEvent.type(c.getByRole('textbox', { name: '메시지' }), '확인했어{Enter}');
    await expect(c.getByRole('status')).toHaveTextContent('대화: 확인했어');
  },
};
export const Empty: Story = { args: { ledger: december } };
export const ParentYear: Story = {
  args: { ledger: year2026 },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByText('하위 2개')).toBeVisible();
    await expect(c.getByText('남은 금액').nextElementSibling).toHaveTextContent('5,645,218원');
    await expect(c.queryByRole('menuitem', { name: '복사해서 만들기' })).toBeNull();
    // Parents have no 하위 tab; each record links to its own ledger instead.
    await expect(c.queryByRole('button', { name: '하위' })).toBeNull();
    await userEvent.click(c.getAllByRole('button', { name: '11월 가계부로 이동' })[0]);
    await expect(c.getByRole('status')).toHaveTextContent('하위: 11월');
  },
};
export const ParentMonthCalendar: Story = {
  args: { ledger: year2026 },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '캘린더' }));
    await expect(c.getByRole('heading', { name: '2026년 11월' })).toBeVisible();
    await userEvent.click(c.getByRole('button', { name: '이전 달' }));
    await expect(c.getByRole('heading', { name: '2026년 10월' })).toBeVisible();
    await expect(c.getByRole('button', { name: /^10월 9일 \(금\), 지출 692,000원/ })).toBeEnabled();
  },
};
export const ParentTravel: Story = {
  args: { ledger: travel },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    // Each record links to the ledger it came from, under its amount.
    await userEvent.click(c.getAllByRole('button', { name: '일본여행 가계부로 이동' })[0]);
    await expect(c.getByRole('status')).toHaveTextContent('하위: 일본여행');
  },
};
export const MembersMenu: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(c.getByRole('button', { name: '11월 메뉴' }));
    await userEvent.click(page.getByRole('menuitem', { name: '멤버' }));
    await expect(c.getByRole('status')).toHaveTextContent('멤버');
  },
};
export const Recurring: Story = {
  args: { records: [...records, ...upcoming] },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    // 예정 stays out of 지출 and shows under it; the list leads with it, faded.
    await expect(c.getByText('예정 55,000원')).toBeVisible();
    await expect(c.getByRole('button', { name: /^통신비 예정/ })).toBeVisible();
    await expect(c.getByRole('button', { name: /^도시가스 금액 확인/ })).toBeVisible();
    await userEvent.click(c.getByRole('button', { name: '캘린더' }));
    await expect(
      c.getByRole('button', { name: /^11월 15일 \(일\), 예정 지출 55,000원/ }),
    ).toBeVisible();
  },
};
export const Memo: Story = {
  args: { memo: true },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    // Used alone, the ledger's 대화 is its owner's 메모.
    await userEvent.click(c.getByRole('button', { name: '메모' }));
    await expect(c.getByRole('textbox', { name: '메시지' })).toBeVisible();
    // The composer is the screen's bottom edge: full width, right on the tab bar.
    const composer = canvasElement.querySelector('.ledger-chat-composer')!.getBoundingClientRect();
    const screen = canvasElement.querySelector('.ui-screen')!.getBoundingClientRect();
    const bar = canvasElement.querySelector('.ui-screen-bottom')!.getBoundingClientRect();
    await expect(composer.left).toBeCloseTo(screen.left, 0);
    await expect(composer.right).toBeCloseTo(screen.right, 0);
    await expect(composer.bottom).toBeCloseTo(bar.top, 0);
  },
};
export const ParentChat: Story = {
  args: { ledger: year2026, memo: true },
  play: async ({ canvasElement }) => {
    // A 상위 가계부 keeps its own thread too.
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '메모' }));
    await expect(c.getByRole('textbox', { name: '메시지' })).toBeVisible();
  },
};
export const Path: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    // 11월 sits under 하반기 under 2026; its title says so and leads up.
    await expect(c.getByRole('navigation', { name: '상위 가계부' })).toHaveTextContent(
      '2026하반기',
    );
    await userEvent.click(c.getByRole('button', { name: '2026' }));
    await expect(c.getByRole('status')).toHaveTextContent('경로: 2026');
    // Back is the room list, not the page before.
    await userEvent.click(c.getByRole('button', { name: '가계부 목록' }));
    await expect(c.getByRole('status')).toHaveTextContent('가계부 목록');
  },
};
