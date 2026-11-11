import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Field, Stack, Switch } from '../../client/ui';

const meta = {
  title: '02 Atoms · 원자/Switch',
  component: Switch,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '바로 적용되는 켜기/끄기 설정. role="switch"인 native checkbox라 라벨 클릭·Space 키·폼 값이 그대로 동작합니다. 저장 버튼과 함께 제출하는 선택에는 Checkbox를 씁니다.',
      },
    },
  },
  render: (args) => (
    <Field>
      <Switch {...args} /> 지난 기간 고정지출 가져오기
    </Field>
  ),
} satisfies Meta<typeof Switch>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {
  play: async ({ canvasElement }) => {
    const toggle = within(canvasElement).getByRole('switch', {
      name: '지난 기간 고정지출 가져오기',
    });
    await userEvent.click(toggle);
    await expect(toggle).toBeChecked();
    await userEvent.keyboard(' ');
    await expect(toggle).not.toBeChecked();
  },
};
export const On: Story = { args: { defaultChecked: true } };
export const Disabled: Story = {
  render: () => (
    <Stack gap={2}>
      <Field>
        <Switch disabled /> 꺼진 상태로 잠김
      </Field>
      <Field>
        <Switch disabled defaultChecked /> 켜진 상태로 잠김
      </Field>
    </Stack>
  ),
};
