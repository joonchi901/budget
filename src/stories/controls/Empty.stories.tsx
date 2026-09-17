import type { Meta, StoryObj } from '@storybook/react-vite';
import { Empty } from '../../client/components';

const meta = {
  title: '02 Components/Empty',
  component: Empty,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '기록이 없는 상태와 검색 결과가 없는 상태를 구분합니다. 우가 일러스트와 다음 행동을 설명하는 문장을 함께 사용합니다. 오류 상태를 빈 상태로 숨기지 않습니다.',
      },
    },
  },
  args: { children: '아직 기록한 내역이 없어요. 첫 내역을 추가해 보세요.', illustration: 'empty' },
  argTypes: {
    children: { control: 'text' },
    illustration: { control: 'radio', options: ['empty', 'search'] },
  },
} satisfies Meta<typeof Empty>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NoRecords: Story = {};
export const NoSearchResults: Story = {
  args: {
    illustration: 'search',
    children: '조건에 맞는 내역이 없어요. 기간이나 검색어를 바꿔 보세요.',
  },
};
