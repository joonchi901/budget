import { useEffect, useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ColorField, TAG_PALETTE, pickTagColor } from '../../client/ui';

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
  title: '03 Molecules · 분자/ColorField',
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
export const Compact: Story = {
  args: { compact: true, 'aria-label': '장보기 색상' },
  parameters: {
    docs: {
      description: {
        story:
          '태그 옵션 목록처럼 좁은 곳에서는 색 견본만 보이고, 누르면 팔레트와 직접 입력이 열립니다.',
      },
    },
  },
};
export const AutoColor: Story = {
  render: () => {
    const used = ['#D28C70', '#64866F'];
    return (
      <p>
        사용 중 {used.join(', ')} → 다음 자동 색 <strong>{pickTagColor(used)}</strong>
      </p>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          '새 태그는 같은 필드가 가장 적게 쓴 팔레트 색을 받습니다. 안 쓴 색이 있으면 그중 앞의 것, 모두 쓰였으면 가장 적게 쓰인 색입니다. 대소문자는 구분하지 않습니다.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(pickTagColor([])).toBe('#D28C70');
    await expect(pickTagColor(['#d28c70'])).toBe('#F08A5D');
    await expect(pickTagColor([...TAG_PALETTE, '#D28C70', '#F08A5D'])).toBe('#E8AD3F');
    await expect(within(canvasElement).getByText('#F08A5D')).toBeVisible();
  },
};
