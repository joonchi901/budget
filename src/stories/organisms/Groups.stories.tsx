import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { GroupPicker, LedgerCardList, LedgerPicker } from '../../client/ledger';
import { Stack } from '../../client/ui';
import { FIXTURE_TODAY, groups, ledgers, records } from '../fixtures';

const meta = {
  title: '04 Organisms · 유기체/Groups',
  component: LedgerCardList,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '묶음 관련 블록. LedgerCardList는 묶음 방의 가계부별 보기, GroupPicker는 가계부가 속할 묶음(여러 개), LedgerPicker는 묶음 방에서 추가한 내역을 저장할 가계부를 고르며 날짜에 맞는 가계부를 표시합니다.',
      },
    },
  },
  args: { ledgers, records, onOpen: () => {} },
} satisfies Meta<typeof LedgerCardList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LedgerCards: Story = {
  render: (args) => (
    <div style={{ maxWidth: 390 }}>
      <LedgerCardList {...args} />
    </div>
  ),
};
export const PickGroups: Story = {
  render: function Controlled() {
    const [options, setOptions] = useState(groups);
    const [value, setValue] = useState(['g-2026']);
    return (
      <div style={{ maxWidth: 390 }}>
        <GroupPicker
          groups={options}
          value={value}
          onValueChange={setValue}
          onCreateGroup={(name) => {
            const id = `g-${name}`;
            setOptions([...options, { id, name, icon: 'star', ledgerIds: [] }]);
            return id;
          }}
        />
        <p role="status">{value.join(', ')}</p>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '여행' }));
    await expect(c.getByRole('status')).toHaveTextContent('g-2026, g-travel');
  },
};
export const PickLedger: Story = {
  render: function Controlled() {
    const [value, setValue] = useState('nov');
    return (
      <Stack gap={2} style={{ maxWidth: 390 }}>
        <LedgerPicker
          ledgers={ledgers}
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
