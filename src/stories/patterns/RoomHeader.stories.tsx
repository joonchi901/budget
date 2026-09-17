import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import RoomHeader, { type RoomHeaderProps } from '../../client/RoomHeader';

function InteractiveRoom(args: RoomHeaderProps) {
  const [view, setView] = useState(args.view);
  useEffect(() => setView(args.view), [args.view]);
  return (
    <RoomHeader
      {...args}
      view={view}
      onViewChange={(next) => {
        args.onViewChange(next);
        setView(next);
      }}
    />
  );
}

const meta = {
  title: '04 Patterns/RoomHeader',
  component: RoomHeader,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '앱이 사용하는 실제 가계부 방 헤더입니다. 방 이름·부모 경로·현재 보기를 유지하며 탐색 결정은 호출자가 처리합니다. 목록/캘린더/통계/계획은 버튼 그룹으로 선택 상태를 aria-pressed에 표시합니다. 전체 모아보기는 설정을 노출하지 않습니다. 일반 사용자도 가계부 설정을 볼 수 있고 관리자 전용 동작은 기존 설정 폼에서 통제합니다. 경로가 길면 데스크톱에서는 자체 Tooltip, 모바일에서는 줄바꿈으로 확인합니다.',
      },
    },
  },
  args: {
    name: '우리의 일상',
    path: '우리의 일상',
    parentPath: '',
    icon: '🏠',
    view: 'list',
    archived: false,
    aggregate: false,
    onBack: fn(),
    onViewChange: fn(),
    onMenu: fn(),
    onSettings: fn(),
  },
  argTypes: {
    view: { control: 'select', options: ['list', 'calendar', 'analytics', 'planning'] },
  },
  render: (args) => <InteractiveRoom {...args} />,
} satisfies Meta<typeof RoomHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const RootRoom: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { level: 1, name: '우리의 일상' })).toBeVisible();
    const tabs = within(canvas.getByRole('group', { name: '가계부 보기' }));
    await expect(tabs.getByRole('button', { name: '목록' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(tabs.getByRole('button', { name: '캘린더' }));
    await expect(args.onViewChange).toHaveBeenCalledWith('calendar');
    await expect(tabs.getByRole('button', { name: '캘린더' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(tabs.getByRole('button', { name: '목록' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await userEvent.click(canvas.getByRole('button', { name: '가계부 목록' }));
    await expect(args.onBack).toHaveBeenCalledOnce();
  },
};

export const NestedRoom: Story = {
  args: { name: '1월', path: '2026 가계부 / 1월', parentPath: '2026 가계부', view: 'calendar' },
};

export const ArchivedRoom: Story = {
  args: {
    name: '지난 여행',
    path: '2025 가계부 / 지난 여행',
    parentPath: '2025 가계부',
    archived: true,
    view: 'analytics',
  },
};

export const Aggregate: Story = {
  args: { name: '전체 가계부', path: '전체 가계부', aggregate: true, onSettings: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('모든 가계부 모아보기', { exact: false })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: '가계부 설정' })).not.toBeInTheDocument();
  },
};

export const Mobile320: Story = {
  args: {
    name: '아주 긴 이름을 가진 가족과 함께 떠나는 가을 여행 가계부',
    path: '2026 가계부 / 가족 여행 기록 / 아주 긴 이름을 가진 가족과 함께 떠나는 가을 여행 가계부',
    parentPath: '2026 가계부 / 가족 여행 기록',
    view: 'planning',
  },
  globals: { viewport: { value: 'mobile320', isRotated: false } },
  play: async ({ canvasElement }) => {
    const header = within(canvasElement).getByRole('region', { name: '현재 가계부' });
    await expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth + 1);
    await expect(within(header).getByRole('group', { name: '가계부 보기' })).toBeVisible();
    for (const button of within(header).getAllByRole('button')) {
      const bounds = button.getBoundingClientRect();
      const container = header.getBoundingClientRect();
      await expect(bounds.right).toBeLessThanOrEqual(container.right + 1);
      await expect(bounds.left).toBeGreaterThanOrEqual(container.left - 1);
    }
  },
};

export const Mobile390: Story = {
  ...Mobile320,
  globals: { viewport: { value: 'mobile390', isRotated: false } },
};
