import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Bar, Stack } from '../../client/ui';

const meta = {
  title: '02 Atoms · 원자/Bar',
  component: Bar,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '통계용 가로 막대. 장식 요소라 스크린 리더에서 숨기므로 항상 금액·비율을 글자로 함께 보여줍니다(StatBar에서 조립). color에는 태그 옵션의 저장 색상을 그대로 넘깁니다.',
      },
    },
  },
  args: { value: 646490, max: 1228562 },
  argTypes: { color: { control: 'color' } },
  render: (args) => (
    <div style={{ maxWidth: 320 }}>
      <Bar {...args} />
    </div>
  ),
} satisfies Meta<typeof Bar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvasElement }) => {
    const bar = canvasElement.querySelector('.ui-bar')!;
    await expect(bar).toHaveAttribute('aria-hidden', 'true');
    const fill = bar.querySelector<HTMLElement>('.ui-bar-fill')!;
    const ratio = fill.getBoundingClientRect().width / bar.getBoundingClientRect().width;
    await expect(ratio).toBeCloseTo(646490 / 1228562, 1);
  },
};
export const TagColors: Story = {
  render: () => (
    <Stack gap={3} style={{ maxWidth: 320 }}>
      <Bar value={80} max={100} color="#D28C70" />
      <Bar value={55} max={100} color="#6C89A4" />
      <Bar value={30} max={100} color="#64866F" />
      <Bar value={20} max={100} color="#FFFFDD" />
    </Stack>
  ),
  parameters: {
    docs: { description: { story: '아주 밝은 저장 색상도 테두리로 트랙과 구분됩니다.' } },
  },
};
export const Empty: Story = {
  args: { value: 0, max: 0 },
  parameters: { docs: { description: { story: 'max가 0이면 빈 트랙만 보입니다.' } } },
};
