import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Archive, Copy, MoreHorizontal, Settings2 } from 'lucide-react';
import { IconButton, Menu, Stack } from '../../client/ui';

const meta = {
  title: '03 Molecules · 분자/Menu',
  component: Menu,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '방의 ⋯ 메뉴 같은 드롭다운 메뉴. trigger에 받은 props를 IconButton에 펼쳐 연결합니다. 열리면 첫 항목에 포커스가 가고, 방향키·Home·End로 이동하며 Escape는 닫고 트리거로 돌아갑니다. 위험한 동작은 tone="danger"로 구분합니다.',
      },
    },
  },
  args: { label: '가계부 메뉴', items: [], trigger: () => null },
  render: function RoomMenu(args) {
    const [last, setLast] = useState('');
    return (
      <Stack gap={3}>
        <Menu
          {...args}
          trigger={(props) => (
            <IconButton {...props} aria-label="가계부 메뉴">
              <MoreHorizontal size={20} />
            </IconButton>
          )}
          items={[
            { label: '설정', icon: <Settings2 size={18} />, onSelect: () => setLast('설정') },
            {
              label: '복사해서 만들기',
              icon: <Copy size={18} />,
              onSelect: () => setLast('복사해서 만들기'),
            },
            {
              label: '보관',
              icon: <Archive size={18} />,
              tone: 'danger',
              onSelect: () => setLast('보관'),
            },
          ]}
        />
        <p role="status">{last && `선택: ${last}`}</p>
      </Stack>
    );
  },
} satisfies Meta<typeof Menu>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const trigger = c.getByRole('button', { name: '가계부 메뉴' });
    await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole('menuitem', { name: '설정' })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    await expect(page.getByRole('menuitem', { name: '보관' })).toHaveFocus();
    await userEvent.keyboard('{Home}{ArrowDown}{Enter}');
    await expect(c.getByRole('status')).toHaveTextContent('선택: 복사해서 만들기');
    await expect(trigger).toHaveFocus();
    await expect(page.queryByRole('menu')).toBeNull();
  },
};
export const EscapeCloses: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const trigger = c.getByRole('button', { name: '가계부 메뉴' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    await expect(within(canvasElement.ownerDocument.body).queryByRole('menu')).toBeNull();
    await expect(trigger).toHaveFocus();
  },
};
