import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Stack, StatBar } from '../../client/ui';

const spending = [
  { label: '외식/배달/간식', value: 381710, color: '#D28C70' },
  { label: '장보기', value: 200380, color: '#64866F' },
  { label: '병원/약국', value: 72800, color: '#6C89A4' },
];
const total = spending.reduce((sum, item) => sum + item.value, 0);

const meta = {
  title: '03 Molecules · 분자/StatBar',
  component: StatBar,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '통계 한 줄. 이름과 금액, 막대와 비율을 보여줍니다. 비율은 value / total, 막대 길이는 value / max입니다. 목록에서는 가장 큰 항목을 max로 넘겨 첫 막대가 가득 차게 합니다.',
      },
    },
  },
  args: { label: '장보기', value: 200380, total, color: '#64866F' },
  render: (args) => (
    <div style={{ maxWidth: 390 }}>
      <StatBar {...args} />
    </div>
  ),
} satisfies Meta<typeof StatBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('30.6%')).toBeVisible();
  },
};
export const Breakdown: Story = {
  render: () => (
    <Stack gap={4} style={{ maxWidth: 390 }}>
      {spending.map((item) => (
        <StatBar key={item.label} {...item} total={total} max={spending[0].value} />
      ))}
    </Stack>
  ),
};
export const ZeroTotal: Story = { args: { value: 0, total: 0 } };
