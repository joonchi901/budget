import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ChildPicker, LedgerPicker, ParentPicker } from '../../client/ledger';
import { Stack } from '../../client/ui';
import { leafLedgers } from '../../shared/ledger';
import { FIXTURE_TODAY, ledgers, november, year2026 } from '../fixtures';

const meta = {
  title: '04 Organisms · 유기체/Hierarchy',
  component: ParentPicker,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '상위·하위 가계부 블록. ParentPicker는 가계부가 속할 상위(여러 개), ChildPicker는 상위 가계부의 하위, LedgerPicker는 상위 방에서 추가한 내역을 저장할 가계부입니다. 순환이 생기는 선택지는 처음부터 보이지 않습니다.',
      },
    },
  },
  args: { ledgers, value: [], onValueChange: () => {} },
} satisfies Meta<typeof ParentPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PickParents: Story = {
  render: function Controlled() {
    const [value, setValue] = useState(['h2']);
    return (
      <div style={{ maxWidth: 390 }}>
        <ParentPicker ledgers={ledgers} self={november} value={value} onValueChange={setValue} />
        <p role="status">{value.join(', ')}</p>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '여행' }));
    await expect(c.getByRole('status')).toHaveTextContent('h2, travel');
  },
};
export const NoCycles: Story = {
  render: function Controlled() {
    const [parents, setParents] = useState<string[]>([]);
    const [children, setChildren] = useState(year2026.childIds);
    return (
      <Stack gap={5} style={{ maxWidth: 390 }}>
        <ParentPicker
          ledgers={ledgers}
          self={year2026}
          value={parents}
          onValueChange={setParents}
        />
        <ChildPicker
          ledgers={ledgers}
          self={year2026}
          value={children}
          onValueChange={setChildren}
        />
      </Stack>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          '2026의 상위로는 자기 아래에 있는 하반기를 고를 수 없고, 하위로는 2026 자신을 고를 수 없습니다.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const parents = within(canvasElement.querySelectorAll('fieldset')[0] as HTMLElement);
    await expect(parents.queryByRole('button', { name: '하반기' })).toBeNull();
    await expect(parents.getByRole('button', { name: '여행' })).toBeVisible();
    const children = within(canvasElement.querySelectorAll('fieldset')[1] as HTMLElement);
    await expect(children.queryByRole('button', { name: /^2026/ })).toBeNull();
    await expect(children.getByRole('button', { name: /^하반기/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};
export const PickLedger: Story = {
  render: function Controlled() {
    const [value, setValue] = useState('nov');
    return (
      <Stack gap={2} style={{ maxWidth: 390 }}>
        <LedgerPicker
          ledgers={leafLedgers(ledgers, year2026)}
          value={value}
          onValueChange={setValue}
          date={FIXTURE_TODAY}
        />
      </Stack>
    );
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('combobox')).toHaveTextContent(
      '11월 · 10/23 – 11/22 · 날짜 맞음',
    );
  },
};
