import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ChatThread } from '../../client/ledger';
import { LedgerRoomView, LedgerSettingsView } from '../../client/views';
import {
  FIXTURE_TODAY,
  december,
  ledgers,
  members,
  messages,
  november,
  records,
  travel,
  year2026,
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
          '가계부 하나의 방. 상단에 방 이름·기간·요약, 하단에 내역·통계·설정 탭이 있습니다. 내역 탭은 위쪽 조회 도구 옆에서 표/캘린더를 바꾸고, 탭 막대 바로 위에 가로 전체 내역 추가 버튼이 늘 보입니다. 설정은 탭 안에서 바로 고칩니다. 하위 가계부가 있으면(상위 가계부) 아래 모든 내역을 한 번씩 모으고 금액 아래에 원본 가계부로 가는 링크("11월 →")를 두며, 캘린더는 월 단위로 넘깁니다. 하위 탭은 없고 이 링크로 하위 방에 들어갑니다. 통계 항목을 누르면 그 조건의 표로 이동합니다. 내역마다 우가 스티커로 반응할 수 있습니다. 내역을 적는 가계부에는 설정 왼쪽에 대화 탭이 있습니다.',
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
    return (
      <>
        <LedgerRoomView
          {...args}
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
export const StatsToTable: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '통계' }));
    await userEvent.click(c.getByRole('button', { name: /^용돈/ }));
    await expect(c.getByRole('button', { name: '카테고리: 용돈 필터 해제' })).toBeVisible();
    // 통계의 지출 쪽에서 골랐으니 지출 유형 태그가 함께 걸려요.
    await expect(c.getByRole('button', { name: '유형: 지출 필터 해제' })).toBeVisible();
    await expect(c.getAllByRole('heading', { level: 2 })[0]).toHaveTextContent('11월 1일');
    // The 유형 tag beside 내용 is a little shorter than the title line.
    const title = canvasElement.querySelector('.ui-list-row-title')!;
    const tag = title.querySelector('.tag-badge')!;
    await expect(tag.getBoundingClientRect().height).toBeLessThan(
      parseFloat(getComputedStyle(title).lineHeight),
    );
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
