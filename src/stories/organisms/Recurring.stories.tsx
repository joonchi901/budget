import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { RecurringList, RecurringRuleForm } from '../../client/ledger';
import type { RecurringRule } from '../../shared/ledger';
import { FIXTURE_TODAY, november } from '../fixtures';

const meta = {
  title: '04 Organisms · 유기체/RecurringList',
  component: RecurringList,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '가계부의 반복 내역(고정지출·자동이체). 매달 며칠인지, 다음 날짜, 금액이 달마다 다른지와 금액을 보여 줍니다. 누르면 고치고, 휴지통으로 그만둡니다. 새 반복은 내역 추가에서 "반복"을 골라 만듭니다. 반복 내역은 가계부 기간의 날짜마다 내역을 미리 예정으로 넣고, 복사해서 만든 다음 가계부로 이어집니다.',
      },
    },
  },
  args: {
    ledger: november,
    rules: november.recurring!,
    today: FIXTURE_TODAY,
    onOpen: () => {},
    onRemove: () => {},
  },
  render: function Logged(args) {
    const [log, setLog] = useState('');
    return (
      <div style={{ maxWidth: 390 }}>
        <RecurringList
          {...args}
          onOpen={(rule) => setLog(`열기: ${rule.title}`)}
          onRemove={(rule) => setLog(`그만: ${rule.title}`)}
        />
        <p role="status">{log}</p>
      </div>
    );
  },
} satisfies Meta<typeof RecurringList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Rules: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    // 관리비 comes next on 11/27; 청약저축's 1st has passed, so next month.
    await expect(
      c.getByRole('button', { name: /^아파트 관리비 매달 27일 · 다음 11\/27 · 금액이 달라요/ }),
    ).toBeVisible();
    await expect(c.getByRole('button', { name: /^청약저축 매달 1일 · 다음 12\/1/ })).toBeVisible();
    await userEvent.click(c.getByRole('button', { name: '통신비 반복 그만하기' }));
    await expect(c.getByRole('status')).toHaveTextContent('그만: 통신비');
  },
};
export const None: Story = { args: { rules: [] } };

export const Form: StoryObj<typeof RecurringRuleForm> = {
  render: function Draft() {
    const [rule, setRule] = useState<RecurringRule>(november.recurring![2]);
    return (
      <div style={{ maxWidth: 390 }}>
        <RecurringRuleForm rule={rule} onChange={setRule} />
        <p role="status">
          {rule.title} {rule.day} {rule.amount} {rule.variable ? '변동' : '고정'}
        </p>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('combobox', { name: '날짜' }));
    await userEvent.click(c.getByRole('option', { name: '매달 마지막 날' }));
    await userEvent.click(c.getByRole('switch', { name: '금액이 달마다 달라요' }));
    await expect(c.getByRole('status')).toHaveTextContent('통신비 31 55000 변동');
  },
};
