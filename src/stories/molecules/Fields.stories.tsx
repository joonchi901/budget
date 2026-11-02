import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import {
  Button,
  Checkbox,
  Field,
  FormBody,
  FormFooter,
  FormGrid,
  Input,
  Radio,
  Textarea,
  TextField,
  Panel,
} from '../../client/ui';
const meta = {
  title: '03 Molecules · 분자/Fields',
  component: TextField,
  tags: ['root-screens'],
  args: { label: '가계부 이름', placeholder: '이름을 입력해 주세요.' },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TextField>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Hint: Story = { args: { hint: '함께 알아보기 쉬운 이름을 사용해요.' } };
export const Error: Story = { args: { error: '이름을 입력해 주세요.', required: true } };
export const Disabled: Story = { args: { disabled: true, value: '보관된 가계부' } };
export const FormComposition: Story = {
  render: () => {
    const [saved, setSaved] = useState(false);
    return (
      <Panel>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSaved(true);
          }}
        >
          <FormBody>
            <FormGrid>
              <TextField label="제목" required />
              <Field>
                메모
                <Textarea name="memo" />
              </Field>
            </FormGrid>
            <Field>
              <Checkbox defaultChecked /> 알림 받기
            </Field>
            <fieldset>
              <legend>공개 범위</legend>
              <Field>
                <Radio name="scope" value="private" defaultChecked /> 우리 집
              </Field>
              <Field>
                <Radio name="scope" value="personal" /> 나만
              </Field>
            </fieldset>
            <Field>
              금액
              <Input type="number" min="1" required defaultValue="1000" />
            </Field>
          </FormBody>
          <FormFooter>
            <Button type="submit" variant="primary">
              저장
            </Button>
          </FormFooter>
          {saved && <p role="status">입력 완료</p>}
        </form>
      </Panel>
    );
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByRole('textbox', { name: '제목' }), '기록');
    await userEvent.click(c.getByRole('button', { name: '저장' }));
    await expect(c.getByRole('status')).toHaveTextContent('입력 완료');
  },
};
