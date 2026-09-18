import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import LedgerView from '../../client/LedgerView';
import { makeStoryBootstrap, STORY_MONTH } from '../fixtures';
const data = makeStoryBootstrap();
const meta = {
  title: '06 Screens/Ledger',
  component: LedgerView,
  tags: ['root-screens'],
  parameters: {
    docs: {
      description: {
        component:
          '실제 거래 목록 화면입니다. 검색·종류·정렬·하위 원본 이동과 편집 중 표시를 같은 컴포넌트로 확인합니다. 합성 데이터만 사용합니다.',
      },
    },
  },
  args: {
    data,
    ledger: data.ledgers[2],
    entries: data.transactions.filter((t) => t.ledgerId === 'sb-june'),
    month: STORY_MONTH,
    peers: [],
    onEdit: fn(),
    onNavigate: fn(),
    period: 'month',
    includeDescendants: true,
  },
} satisfies Meta<typeof LedgerView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Populated: Story = {};
export const Empty: Story = { args: { entries: [] } };
export const EditRecord: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: '함께 먹은 점심 수정' }),
    );
    await expect(args.onEdit).toHaveBeenCalledWith(data.transactions[0]);
  },
};
export const SearchAndReset: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByRole('searchbox', { name: '내역 검색' }), '  점심  ');
    await expect(c.getByRole('status', { name: '목록 조회 결과' })).toHaveTextContent('1건');
    await userEvent.click(c.getByRole('button', { name: '조회 조건 초기화' }));
    await expect(c.getByRole('searchbox')).toHaveValue('');
    await expect(c.getByText('버스 이용')).toBeVisible();
  },
};
export const NoSearchResults: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByRole('searchbox'), '없는 기록');
    await expect(c.getByText(/조건에 맞는 내역이 없어요/)).toBeVisible();
  },
};
export const KeyboardFilter: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement),
      group = within(c.getByRole('group', { name: '내역 종류 필터' }));
    await userEvent.click(group.getByRole('button', { name: '수입' }));
    await expect(c.queryByText('버스 이용')).toBeNull();
    await userEvent.keyboard('{Home}');
    await expect(group.getByRole('button', { name: '전체' })).toHaveFocus();
    await expect(c.getByText('버스 이용')).toBeVisible();
  },
};
export const SortAmount: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('combobox', { name: '내역 정렬' }));
    await userEvent.click(within(document.body).getByRole('option', { name: '금액 낮은순' }));
    const rows = within(c.getByRole('table')).getAllByRole('row');
    await expect(rows[1]).toHaveTextContent('버스 이용');
  },
};
export const InheritedRecords: Story = {
  args: { ledger: data.ledgers[0] },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: '함께 먹은 점심 원본 가계부 열기' }),
    );
    await expect(args.onNavigate).toHaveBeenCalledWith('sb-june');
  },
};
export const CollaboratorEditing: Story = {
  args: {
    peers: [
      {
        userId: 'u2',
        name: '구성원 B',
        color: '#9b78a8',
        ledgerId: 'sb-june',
        transactionId: 'sb-lunch',
        field: 'amount',
      },
    ],
  },
};
export const LongContent: Story = {
  args: {
    entries: data.transactions
      .filter((t) => t.ledgerId === 'sb-june')
      .map((t) => ({
        ...t,
        description: '함께 기록하는 아주 긴 내역 이름과 메모가 있는 예시 거래 — ' + t.description,
      })),
  },
};
