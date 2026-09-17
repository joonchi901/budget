import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import LedgerTree from '../../client/LedgerTree';
import { makeStoryBootstrap, storyLedgers, storyUsers } from '../fixtures';

const meta = {
  title: '05 Domain/가계부 계위/LedgerTree',
  component: LedgerTree,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 380 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          '가계부 계위를 탐색하는 트리입니다. 관리자에게만 이동 메뉴와 드래그 동작이 나타나며 일반 사용자는 방 탐색과 접기·펼치기를 할 수 있습니다. onMove는 현재 hierarchyVersion을 담은 이동 의도를 전달할 뿐 저장하지 않습니다. 동시 변경 충돌과 최종 권한은 서버에서 검증합니다. 이 명세는 관리자·일반 사용자 UI 차이를 확인합니다.',
      },
    },
  },
  args: {
    data: makeStoryBootstrap(),
    selectedId: 'sb-june',
    onNavigate: fn(),
    onMove: fn(),
  },
  argTypes: { data: { control: false } },
} satisfies Meta<typeof LedgerTree>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AdminHierarchy: Story = {
  name: '관리자와 여러 단계 계위',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('treeitem', { name: '6월 생활비' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await userEvent.click(canvas.getByRole('button', { name: '6월 생활비' }));
    await expect(args.onNavigate).toHaveBeenCalledWith('sb-june');
    await userEvent.click(canvas.getByRole('button', { name: '2026 기록 접기' }));
    await expect(canvas.queryByRole('treeitem', { name: '6월 생활비' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: '2026 기록 펼치기' }));
    await expect(canvas.getByRole('treeitem', { name: '6월 생활비' })).toBeVisible();
  },
};

export const AdminMoveIntent: Story = {
  name: '위치 변경 요청',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '6월 생활비 관리 메뉴' }));
    await userEvent.click(canvas.getByRole('button', { name: '6월 생활비 위치 변경' }));
    await expect(args.onMove).toHaveBeenCalledWith({
      ledger: storyLedgers[2],
      hierarchyVersion: 1,
      parentId: 'sb-year',
      beforeId: null,
      automatic: false,
    });
  },
};

export const UserNavigation: Story = {
  name: '일반 사용자는 탐색만',
  args: { data: makeStoryBootstrap({ user: storyUsers[1] }) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('button', { name: /관리 메뉴/ })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: '여름 바다 여행' }));
    await expect(args.onNavigate).toHaveBeenCalledWith('sb-trip');
    await expect(args.onMove).not.toHaveBeenCalled();
  },
};

export const ArchivedVisible: Story = {
  name: '보관한 가계부 탐색',
  args: { data: makeStoryBootstrap({ user: storyUsers[1] }), selectedId: 'sb-archived' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('checkbox', { name: '보관한 가계부 표시' }));
    await userEvent.click(canvas.getByRole('button', { name: '지난 봄 소풍 (보관)' }));
    await expect(args.onNavigate).toHaveBeenCalledWith('sb-archived');
  },
};
