import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, within } from 'storybook/test';
import { Amount, Field, Inline, Slider, Stack } from '../../client/ui';

const meta = {
  title: '02 Atoms · 원자/Slider',
  component: Slider,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'native range input을 토큰으로 다시 그린 슬라이더. 방향키·Home·End·드래그와 접근 이름이 그대로 동작하고, 채워진 구간이 현재 값을 따라갑니다. 값은 항상 글자로 함께 보여줍니다.',
      },
    },
  },
  args: { 'aria-label': '최소 금액', min: 0, max: 500000, step: 10000, defaultValue: 120000 },
  render: (args) => (
    <div style={{ maxWidth: 360 }}>
      <Slider {...args} />
    </div>
  ),
} satisfies Meta<typeof Slider>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Uncontrolled: Story = {
  play: async ({ canvasElement }) => {
    const slider = within(canvasElement).getByRole('slider', { name: '최소 금액' });
    await expect(slider.style.getPropertyValue('--ui-slider-ratio')).toBe('0.24');
    fireEvent.change(slider, { target: { value: '250000' } });
    await expect(slider.style.getPropertyValue('--ui-slider-ratio')).toBe('0.5');
  },
};
export const WithValue: Story = {
  render: function AmountFilter() {
    const [value, setValue] = useState(50000);
    return (
      <Stack gap={1} style={{ maxWidth: 360 }}>
        <Inline gap={2} justify="between">
          <Field htmlFor="min-amount">최소 금액</Field>
          <Amount value={value} size="sm" />
        </Inline>
        <Slider
          id="min-amount"
          min={0}
          max={200000}
          step={5000}
          value={value}
          onChange={(event) => setValue(Number(event.target.value))}
        />
      </Stack>
    );
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    fireEvent.change(c.getByRole('slider', { name: '최소 금액' }), { target: { value: '100000' } });
    await expect(c.getByText(/100,000/)).toBeVisible();
  },
};
export const Disabled: Story = { args: { disabled: true } };
