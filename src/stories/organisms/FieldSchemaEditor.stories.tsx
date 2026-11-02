import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { FieldSchemaEditor } from '../../client/ledger';
import { november } from '../fixtures';

const meta = {
  title: '04 Organisms · 유기체/FieldSchemaEditor',
  component: FieldSchemaEditor,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '가계부 param(필드 구성) 편집. 날짜·구분·내용·금액은 잠긴 공통 필드이고, 가계부 필드는 순서 변경·숨기기·추가를 합니다. 이미 쓰는 필드의 형태는 바꾸지 않습니다. 같은 이름은 추가하지 않습니다.',
      },
    },
  },
  args: { fields: november.fields, onChange: () => {} },
  render: function Controlled(args) {
    const [fields, setFields] = useState(args.fields);
    return (
      <div style={{ maxWidth: 390 }}>
        <FieldSchemaEditor fields={fields} onChange={setFields} />
        <p role="status">
          {fields.map((field) => `${field.name}${field.hidden ? '(숨김)' : ''}`).join(', ')}
        </p>
      </div>
    );
  },
} satisfies Meta<typeof FieldSchemaEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

export const EditFields: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '카테고리 위로' }));
    await userEvent.click(c.getByRole('switch', { name: '비고 표시' }));
    await userEvent.type(c.getByRole('textbox', { name: '새 필드 이름' }), '카테고리');
    await userEvent.click(c.getByRole('button', { name: '필드 추가' }));
    await expect(c.getByText('이미 있는 필드 이름이에요.')).toBeVisible();
    await userEvent.clear(c.getByRole('textbox', { name: /새 필드 이름/ }));
    await userEvent.type(c.getByRole('textbox', { name: /새 필드 이름/ }), '사용처');
    await userEvent.click(c.getByRole('button', { name: '필드 추가' }));
    await expect(c.getByRole('status')).toHaveTextContent(
      '카테고리, 결제방식, 누가, 비고(숨김), 사용처',
    );
  },
};
export const Empty: Story = { args: { fields: [] } };
