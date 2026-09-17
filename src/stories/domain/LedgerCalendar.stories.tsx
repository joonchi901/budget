import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import LedgerCalendar from '../../client/LedgerCalendar';
import { makeStoryBootstrap, STORY_MONTH, storyLedgers, storyTransactions } from '../fixtures';

const meta = {
  title: '05 Domain/가계부 방/LedgerCalendar',
  component: LedgerCalendar,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '방 안에서 사용하는 월 캘린더입니다. 날짜 영역은 onAdd(ISO 날짜), 내역은 onOpen(원본 거래)를 전달합니다. 합계는 전달된 entries 중 선택 월의 고유 거래로 계산하며 데이터 조회와 저장은 수행하지 않습니다. 예시는 고정된 합성 날짜를 사용합니다. 오늘 강조만 실행 날짜를 따릅니다.',
      },
    },
  },
  args: {
    data: makeStoryBootstrap(),
    ledger: storyLedgers[0],
    month: STORY_MONTH,
    entries: storyTransactions.filter((transaction) => transaction.ledgerId === 'sb-june'),
    onAdd: fn(),
    onOpen: fn(),
  },
  argTypes: {
    data: { control: false },
    ledger: { control: false },
    entries: { control: false },
    month: {
      control: 'text',
      description: 'YYYY-MM. 회계월 시작일과 무관하게 해당 달 전체를 보여줍니다.',
    },
    onAdd: { description: '새 내역을 쓸 날짜. Storybook에서는 Actions에만 남습니다.' },
    onOpen: { description: '선택한 원본 거래. 상위 가계부에서도 원본 ledgerId가 보존됩니다.' },
  },
} satisfies Meta<typeof LedgerCalendar>;

export default meta;
type Story = StoryObj<typeof meta>;

async function openLunchEntry(canvasElement: HTMLElement, archived = false) {
  const canvas = within(canvasElement);
  const lunchButton = { name: '함께 먹은 점심 내역 열기' };
  if (canvasElement.ownerDocument.defaultView!.matchMedia('(max-width: 650px)').matches) {
    // The compact calendar intentionally exposes the day count instead of individual previews.
    await expect(canvas.queryByRole('button', lunchButton)).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: '2026-06-12 내역 3건 보기' }));
    const dialog = within(
      within(canvasElement.ownerDocument.body).getByRole('dialog', { name: '6월 12일 내역' }),
    );
    if (archived) {
      await expect(dialog.getByRole('button', { name: '이 날짜에 내역 추가' })).toBeDisabled();
    }
    await userEvent.click(dialog.getByRole('button', lunchButton));
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole('dialog', { name: '6월 12일 내역' }),
    ).toBeNull();
  } else {
    await userEvent.click(canvas.getByRole('button', lunchButton));
  }
}

export const Populated: Story = {
  name: '하위 가계부 내역을 포함한 월',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '2026-06-15 내역 추가' }));
    await expect(args.onAdd).toHaveBeenCalledWith('2026-06-15');
    await openLunchEntry(canvasElement);
    await expect(args.onOpen).toHaveBeenCalledWith(storyTransactions[0]);
    await expect(canvas.getByRole('group', { name: '월 지출 60,000원' })).toBeVisible();
  },
};

export const DayDetail: Story = {
  name: '하루 내역 모아보기',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '2026-06-12 내역 3건 보기' }));
    const dialog = within(canvasElement.ownerDocument.body).getByRole('dialog', {
      name: '6월 12일 내역',
    });
    await expect(
      within(dialog).getByRole('button', { name: '주말 장보기 내역 열기' }),
    ).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: '이 날짜에 내역 추가' }));
    await expect(args.onAdd).toHaveBeenCalledWith('2026-06-12');
  },
};

export const EmptyMonth: Story = {
  name: '기록이 없는 월',
  args: { month: '2026-07', entries: [] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('0건의 기록')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '2026-07-31 내역 추가' }));
    await expect(args.onAdd).toHaveBeenCalledWith('2026-07-31');
  },
};

export const ArchivedLedger: Story = {
  name: '보관한 방은 조회만',
  args: { ledger: { ...storyLedgers[0], archived: true } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: '2026-06-12 내역 추가' })).toBeDisabled();
    await openLunchEntry(canvasElement, true);
    await expect(args.onOpen).toHaveBeenCalledWith(storyTransactions[0]);
    await expect(args.onAdd).not.toHaveBeenCalled();
  },
};

export const InvalidMonth: Story = {
  name: '잘못된 월 입력',
  args: { month: '2026-13' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent(
      '조회할 월을 선택해 주세요.',
    );
  },
};
