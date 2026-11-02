import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { CountBadge, Inline } from '../../client/ui';

const meta = {
  title: '02 Atoms · 원자/CountBadge',
  component: CountBadge,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '방 목록의 새 내역 수처럼 작은 개수. 화면에는 숫자만, 스크린 리더에는 label 전체를 전달합니다. 0이면 표시하지 않고 max를 넘으면 `max+`로 줄입니다.',
      },
    },
  },
  args: { count: 3, max: 99, label: '새 내역 3건' },
} satisfies Meta<typeof CountBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('새 내역 3건')).toHaveClass('sr-only');
  },
};
export const Overflow: Story = {
  args: { count: 120, label: '새 내역 120건' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('99+')).toBeVisible();
  },
};
export const Zero: Story = {
  args: { count: 0, label: '새 내역 없음' },
  render: (args) => (
    <Inline gap={2}>
      <span>우리의 일상</span>
      <CountBadge {...args} />
    </Inline>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.ui-count-badge')).toBeNull();
  },
};
