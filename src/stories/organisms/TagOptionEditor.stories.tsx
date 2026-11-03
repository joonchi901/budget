import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { TagOptionEditor } from '../../client/ledger';
import type { FieldDef } from '../../shared/ledger';
import { november } from '../fixtures';

const payment = november.fields[0] as Extract<FieldDef, { type: 'select' | 'multiSelect' }>;

const meta = {
  title: '04 Organisms · 유기체/TagOptionEditor',
  component: TagOptionEditor,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '선택 필드 하나의 태그 옵션 관리. 색상·이름을 바꾸고, 지우는 대신 보관합니다(과거 내역의 값은 남음). 새 옵션은 다음 색상을 자동으로 받습니다.',
      },
    },
  },
  args: { field: payment, onChange: () => {} },
  render: function Controlled(args) {
    const [field, setField] = useState(args.field);
    return (
      <div style={{ maxWidth: 390 }}>
        <TagOptionEditor field={field} onChange={(options) => setField({ ...field, options })} />
        <p role="status">
          {field.options
            .map((option) => `${option.name}${option.archived ? '(보관)' : ''}`)
            .join(', ')}
        </p>
      </div>
    );
  },
} satisfies Meta<typeof TagOptionEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

export const EditOptions: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const buttons = c.getAllByRole('button', { name: '보관' });
    await userEvent.click(buttons[3]);
    await userEvent.type(
      c.getByRole('textbox', { name: '결제방식 새 옵션 이름' }),
      '네이버페이{Enter}',
    );
    await expect(c.getByRole('status')).toHaveTextContent('삼성카드(보관), 자동이체, 네이버페이');
    // 결제방식이 쓰는 색을 피해 팔레트 첫 색(#D28C70)을 자동으로 받는다.
    const swatch = c.getByRole('button', { name: '네이버페이 색상' }).firstElementChild!;
    await expect(getComputedStyle(swatch).backgroundColor).toBe('rgb(210, 140, 112)');
  },
};
