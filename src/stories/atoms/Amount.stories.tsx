import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Amount, Stack } from '../../client/ui';

const meta = {
  title: '02 Atoms · 원자/Amount',
  component: Amount,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '원 단위 금액. 숫자는 고정 폭이고 단위는 작게 표시합니다. 수입·지출은 색과 함께 signed로 +/− 부호를 붙여 색만으로 구분하지 않습니다. value는 금액의 크기이며, 남은 금액처럼 결과가 음수일 때만 음수를 넘깁니다.',
      },
    },
  },
  args: { value: 48000, tone: 'neutral', signed: false, size: 'md' },
  argTypes: {
    tone: { control: 'inline-radio', options: ['neutral', 'income', 'expense'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof Amount>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};
export const Income: Story = { args: { value: 2736060, tone: 'income', signed: true } };
export const Expense: Story = {
  args: { value: 115000, tone: 'expense', signed: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/115,000/)).toHaveTextContent('−115,000원');
  },
};
export const NegativeBalance: Story = {
  args: { value: -50000 },
  parameters: { docs: { description: { story: '수입보다 지출이 많은 남은 금액.' } } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/50,000/)).toHaveTextContent('−50,000원');
  },
};
export const Sizes: Story = {
  render: (args) => (
    <Stack gap={2}>
      <Amount {...args} size="sm" />
      <Amount {...args} size="md" />
      <Amount {...args} size="lg" value={8332170} />
    </Stack>
  ),
};
