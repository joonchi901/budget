import { useEffect, useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ColorField } from '../../client/ColorField';

function ControlledColor(args: ComponentProps<typeof ColorField>) {
  const [value, setValue] = useState(args.value);
  useEffect(() => setValue(args.value), [args.value]);
  return (
    <div className="form-body">
      <label>
        태그 색상
        <ColorField
          {...args}
          value={value}
          onValueChange={(next) => {
            setValue(next);
            args.onValueChange(next);
          }}
        />
      </label>
      <button type="button" className="secondary">
        입력 완료
      </button>
    </div>
  );
}

const meta = {
  title: '02 Components/ColorField',
  component: ColorField,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '6자리 HEX 색상을 입력하는 공통 필드. 운영 화면과 같은 색상 미리보기를 표시합니다. 불완전한 값은 편집 중에만 유지하고, 포커스를 벗어나면 마지막 유효한 값으로 돌아갑니다.',
      },
    },
  },
  args: { value: '#64866F', 'aria-label': '태그 색상', onValueChange: fn(), disabled: false },
  argTypes: {
    value: { control: 'color' },
    disabled: { control: 'boolean' },
    onValueChange: { control: false },
  },
  render: (args) => <ControlledColor {...args} />,
} satisfies Meta<typeof ColorField>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const ValidColor: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox', { name: '태그 색상' });
    await userEvent.clear(input);
    await expect(input).toHaveValue('');
    await userEvent.type(input, '#D28C70');
    await expect(input).toHaveValue('#D28C70');
    await expect(args.onValueChange).toHaveBeenCalledWith('#D28C70');
    await userEvent.click(canvas.getByRole('button', { name: '입력 완료' }));
    await expect(input).toHaveValue('#D28C70');
  },
};
export const InvalidDraft: Story = {
  parameters: {
    docs: {
      description: {
        story:
          '불완전한 문자열을 저장하지 않고 기존 색상을 유지하는 동작을 검증합니다. 현재 컴포넌트는 별도 오류 문구 없이 입력값을 복원합니다.',
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox', { name: '태그 색상' });
    await userEvent.clear(input);
    await userEvent.type(input, '#ZZZ');
    await expect(args.onValueChange).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole('button', { name: '입력 완료' }));
    await expect(input).toHaveValue('#64866F');
  },
};
