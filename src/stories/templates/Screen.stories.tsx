import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Screen } from '../../client/templates';
import { Button, Surface } from '../../client/ui';

const Slot = ({ label, height = 56 }: { label: string; height?: number }) => (
  <Surface padding={3} tone="subtle" style={{ minHeight: height }}>
    <span className="small muted">{label}</span>
  </Surface>
);

const meta = {
  title: '05 Templates · 템플릿/Screen',
  component: Screen,
  tags: ['autodocs'],
  parameters: {
    ownsMain: true,
    docs: {
      description: {
        component:
          '방 목록과 방 화면의 모바일 틀. 위쪽(제목 막대·요약·보기 전환)은 스크롤해도 고정되고, 아래쪽 행동(내역 추가)은 화면 하단에 붙습니다. 본문은 하단 행동에 가리지 않도록 여백을 둡니다. 이 틀이 main 랜드마크를 가집니다.',
      },
    },
  },
  args: {
    top: (
      <>
        <Slot label="제목 막대" />
        <Slot label="요약 · 보기 전환" />
      </>
    ),
    bottom: <Button variant="primary">하단 행동</Button>,
    children: Array.from({ length: 8 }, (_, index) => (
      <Slot key={index} label={`본문 ${index + 1}`} height={96} />
    )),
  },
} satisfies Meta<typeof Screen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithBottomAction: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('main')).toBeVisible();
    await expect(getComputedStyle(c.getByRole('banner')).position).toBe('sticky');
  },
};
export const WithoutBottomAction: Story = { args: { bottom: undefined } };
