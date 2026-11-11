import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Checkbox, Field, Input, Radio, Stack, Textarea } from '../../client/ui';

const meta = {
  title: '02 Atoms · 원자/Inputs',
  component: Input,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'native input·textarea·checkbox·radio. props·ref·폼 검증을 그대로 유지합니다. 라벨·설명·오류 연결은 Molecules의 Field·TextField로 조립합니다.',
      },
    },
  },
  args: { 'aria-label': '내용', placeholder: '장보기_쿠팡' },
} satisfies Meta<typeof Input>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TextInput: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole('textbox', { name: '내용' });
    await userEvent.type(input, '식빵_핀토');
    await expect(input).toHaveValue('식빵_핀토');
  },
};
export const Disabled: Story = { args: { disabled: true, defaultValue: '보관된 내역' } };
export const MultilineText: Story = {
  render: () => <Textarea aria-label="비고" defaultValue="닭다리살, 감자, 당근" />,
};
export const Choices: Story = {
  render: () => (
    <Stack gap={2}>
      <Field>
        <Checkbox defaultChecked /> 고정지출
      </Field>
      <Field>
        <Checkbox disabled /> 보관된 옵션
      </Field>
      <fieldset>
        <legend>유형</legend>
        <Field>
          <Radio name="kind" value="expense" defaultChecked /> 지출
        </Field>
        <Field>
          <Radio name="kind" value="income" /> 수입
        </Field>
      </fieldset>
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('radio', { name: '수입' }));
    await expect(c.getByRole('radio', { name: '수입' })).toBeChecked();
    await expect(c.getByRole('radio', { name: '지출' })).not.toBeChecked();
  },
};
