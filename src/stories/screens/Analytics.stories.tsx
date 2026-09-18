import { useState } from 'react';
import type { ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import AnalyticsView from '../../client/AnalyticsView';
import { makeStoryBootstrap, STORY_MONTH } from '../fixtures';

function AnalyticsScreen(args: ComponentProps<typeof AnalyticsView>) {
  const [ledgerId, setLedgerId] = useState(args.ledgerId);
  return (
    <AnalyticsView
      {...args}
      ledgerId={ledgerId}
      setLedgerId={(id) => {
        setLedgerId(id);
        args.setLedgerId(id);
      }}
    />
  );
}
const meta = {
  title: '06 Screens/Analytics',
  tags: ['analytics-screen'],
  component: AnalyticsView,
  render: (args) => <AnalyticsScreen {...args} />,
  args: {
    data: makeStoryBootstrap(),
    ledgerId: 'sb-home',
    month: STORY_MONTH,
    lockedLedger: true,
    setLedgerId: fn(),
    onEdit: fn(),
  },
  parameters: {
    docs: {
      description: {
        component:
          '실제 통계 화면입니다. 공통 Panel·Grid·Field·SegmentedControl을 조합하며, 그래프·표·일별 달력은 데이터에 맞는 전용 배치를 유지합니다. 고정된 가상 기록으로 집계·필터·거래 원본 열기 동작을 검증합니다.',
      },
    },
  },
} satisfies Meta<typeof AnalyticsView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const MonthlyFlow: Story = { name: '월별 흐름과 가구 요약' };
export const Empty: Story = {
  name: '거래가 없는 가계부',
  args: { data: makeStoryBootstrap({ transactions: [] }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'CSV 내보내기' })).toBeDisabled();
    await expect(canvas.getByLabelText('빈 조회 결과')).toBeVisible();
  },
};
export const FiltersAndReset: Story = {
  name: '태그 필터와 초기화',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('추가 필터'));
    await userEvent.click(canvas.getByRole('button', { name: '# 식비' }));
    await expect(canvas.getByRole('status')).toHaveTextContent('조회 결과 2건');
    await expect(canvas.getByRole('button', { name: '# 식비 필터 해제' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '모두 초기화' }));
    await expect(canvas.getByRole('status')).toHaveTextContent('조회 결과 4건');
    await expect(canvas.getByRole('button', { name: '# 식비' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  },
};
export const Category: Story = {
  name: '분류별 집계',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '분류별' }));
    await expect(canvas.getByRole('button', { name: '분류별' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(canvas.getByRole('combobox', { name: '집계할 태그 유형' })).toBeVisible();
  },
};
export const Sources: Story = {
  name: '가계부와 결제수단별 집계',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '가계부·결제수단' }));
    await expect(canvas.getByRole('button', { name: '가계부·결제수단' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};
export const Transactions: Story = {
  name: '거래 표에서 원본 편집으로 이동',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '거래 내역' }));
    await expect(canvas.getByText('함께 먹은 점심')).toBeVisible();
    await userEvent.click(canvas.getAllByRole('button', { name: '열기' })[0]);
    await expect(args.onEdit).toHaveBeenCalled();
  },
};
export const KeyboardViews: Story = {
  name: '키보드로 분석 보기 전환',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvas.getByRole('button', { name: '소비 흐름' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(canvas.getByRole('button', { name: '분류별' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};
