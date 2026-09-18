import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { SegmentedControl, Tabs } from '../../client/ui';
function Example({ tabs = false, disabled = false }) {
  const [value, setValue] = useState('list');
  const options = [
    { value: 'list', label: '목록', panelId: 'panel-list' },
    { value: 'disabled', label: '사용 불가', disabled: true, panelId: 'panel-disabled' },
    { value: 'calendar', label: '캘린더', panelId: 'panel-calendar' },
  ];
  return tabs ? (
    <>
      <Tabs
        aria-label="보기"
        value={value}
        onValueChange={setValue}
        options={options}
        disabled={disabled}
      />
      {options.map((o) => (
        <section
          key={o.value}
          id={o.panelId}
          role="tabpanel"
          aria-label={o.label}
          hidden={value !== o.value}
        >
          {o.label} 내용
        </section>
      ))}
    </>
  ) : (
    <SegmentedControl
      aria-label="보기"
      value={value}
      onValueChange={setValue}
      options={options}
      disabled={disabled}
    />
  );
}
const meta = {
  title: '02 Components/ChoiceGroup',
  component: Example,
  tags: ['root-screens'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Segmented: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '목록' }));
    await userEvent.keyboard('{ArrowRight}');
    await expect(c.getByRole('button', { name: '캘린더' })).toHaveFocus();
    await expect(c.getByRole('button', { name: '캘린더' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.keyboard('{Home}');
    await expect(c.getByRole('button', { name: '목록' })).toHaveFocus();
  },
};
export const TabPanels: Story = {
  args: { tabs: true },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('tab', { name: '목록' }));
    await userEvent.keyboard('{End}');
    await expect(c.getByRole('tab', { name: '캘린더' })).toHaveAttribute('aria-selected', 'true');
    await expect(c.getByRole('tabpanel', { name: '캘린더' })).toBeVisible();
    await expect(c.queryByRole('tabpanel', { name: '목록' })).toBeNull();
  },
};
