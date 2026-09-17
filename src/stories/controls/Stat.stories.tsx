import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stat } from '../../client/components';

const meta = {
  title: '02 Components/Stat',
  component: Stat,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '금액·통계 이름·집계 범위를 함께 표시합니다. 원 단위와 천 단위 구분은 공통 포맷터에서 처리합니다. 숫자만 표시하지 않고 hint로 기간과 대상 범위를 설명합니다.',
      },
    },
  },
  args: {
    label: '이번 달 지출',
    amount: 1250000,
    hint: '선택한 가계부 · 2026년 9월',
    accent: false,
  },
  argTypes: {
    label: { control: 'text' },
    amount: { control: 'number' },
    hint: { control: 'text' },
    accent: { control: 'boolean' },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 'min(100%, 400px)' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Stat>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const Accent: Story = { args: { label: '남은 예산', amount: 750000, accent: true } };
export const Zero: Story = { args: { amount: 0, hint: '이번 달 등록된 지출이 없어요.' } };
export const Negative: Story = {
  args: {
    label: '남은 예산',
    amount: -250000,
    hint: '계획보다 250,000원 더 사용했어요.',
    accent: true,
  },
};
export const LargeAmount: Story = {
  args: { label: '총 자산', amount: 123456789012, hint: '우리 집 공통 · 최신 잔액' },
};
