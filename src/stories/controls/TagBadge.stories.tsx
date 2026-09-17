import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { TagBadge } from '../../client/TagBadge';

const meta = {
  title: '02 Components/TagBadge',
  component: TagBadge,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '내역·선택기·태그 관리에서 같은 색상을 사용하는 태그 배지. 긴 이름은 가용 너비에 맞춰 줄바꿈하며 보관 상태와 선택 해제를 선택적으로 조립합니다. 텍스트 대비는 저장된 색상에서 계산합니다.',
      },
    },
  },
  args: { name: '식비', color: '#D28C70', archived: false, disabled: false },
  argTypes: {
    name: { control: 'text' },
    color: { control: 'color' },
    archived: { control: 'boolean' },
    disabled: { control: 'boolean' },
    onRemove: { control: false },
  },
} satisfies Meta<typeof TagBadge>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const Archived: Story = { args: { archived: true } };
export const LongLabel: Story = {
  args: {
    name: '함께 떠난 여름 여행에서 사용한 교통비와 숙박비',
    title: '함께 떠난 여름 여행에서 사용한 교통비와 숙박비',
  },
};
export const Colors: Story = {
  parameters: {
    docs: {
      description: {
        story: '밝고 어두운 사용자 지정 색상이 모두 동일한 배지 규칙으로 표현됩니다.',
      },
    },
  },
  render: () => (
    <div className="tag-badge-list" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <TagBadge name="식비" color="#D28C70" />
      <TagBadge name="교통" color="#6C89A4" />
      <TagBadge name="주거" color="#64866F" />
      <TagBadge name="여가" color="#9176A6" />
      <TagBadge name="밝은 색상" color="#FFFFDD" />
      <TagBadge name="어두운 색상" color="#222222" />
    </div>
  ),
};
export const Removable: Story = {
  args: { onRemove: fn() },
  render: function RemovableTag(args) {
    const [removed, setRemoved] = useState(false);
    return removed ? (
      <p role="status">태그 선택을 해제했어요.</p>
    ) : (
      <TagBadge
        {...args}
        onRemove={() => {
          setRemoved(true);
          args.onRemove?.();
        }}
      />
    );
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '식비 선택 해제' }));
    await expect(args.onRemove).toHaveBeenCalledOnce();
    await expect(canvas.getByRole('status')).toHaveTextContent('태그 선택을 해제했어요.');
  },
};
export const DisabledRemoval: Story = {
  args: { onRemove: fn(), disabled: true },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: '식비 선택 해제' }),
    ).toBeDisabled();
  },
};
