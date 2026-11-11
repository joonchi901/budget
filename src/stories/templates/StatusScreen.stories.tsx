import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { StatusScreen } from '../../client/templates';
import { Button } from '../../client/ui';

const meta = {
  title: '05 Templates · 템플릿/StatusScreen',
  component: StatusScreen,
  tags: ['autodocs'],
  globals: { viewport: { value: 'mobile390', isRotated: false } },
  parameters: {
    ownsMain: true,
    docs: {
      description: {
        component:
          '앱이 데이터를 불러오는 동안과 불러오지 못했을 때의 전체 화면. 실패하면 이유와 다시 시도 버튼을 보여줍니다. 저장 실패처럼 화면이 이미 있을 때는 Notice를 씁니다.',
      },
    },
  },
  args: { children: '불러오는 중이에요', busy: true },
} satisfies Meta<typeof StatusScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent('불러오는 중이에요');
  },
};
export const Failed: Story = {
  args: {
    busy: false,
    children: '서버에 연결하지 못했어요.',
    action: <Button>다시 시도</Button>,
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: '다시 시도' })).toBeVisible();
  },
};
