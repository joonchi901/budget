import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { SearchField } from '../../client/ui';

const meta = {
  title: '03 Molecules · 분자/SearchField',
  component: SearchField,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '검색 입력. 값이 있으면 지우기 버튼이 나타나고, Escape로도 지웁니다. 지운 뒤에는 입력에 포커스를 돌려줍니다.',
      },
    },
  },
  args: { value: '', onValueChange: () => {}, 'aria-label': '내역 검색', placeholder: '내용 검색' },
  render: function Controlled(args) {
    const [value, setValue] = useState(args.value);
    return (
      <div style={{ maxWidth: 360 }}>
        <SearchField {...args} value={value} onValueChange={setValue} />
      </div>
    );
  },
} satisfies Meta<typeof SearchField>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const input = c.getByRole('searchbox', { name: '내역 검색' });
    await userEvent.type(input, '쿠팡');
    await userEvent.click(c.getByRole('button', { name: '검색어 지우기' }));
    await expect(input).toHaveValue('');
    await expect(input).toHaveFocus();
    await userEvent.type(input, '마트{Escape}');
    await expect(input).toHaveValue('');
  },
};
export const WithQuery: Story = { args: { value: '쿠팡이츠' } };
