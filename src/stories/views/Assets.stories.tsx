import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { HomeTabBar } from '../../client/ledger';
import { won } from '../../client/ui';
import { AssetEditView, AssetManageView, AssetsView } from '../../client/views';
import { assetBalance } from '../../shared/assets';
import { FIXTURE_TODAY, assets, ledgers, records } from '../fixtures';

const living = assets[0];
const livingBalance = assetBalance(living, ledgers, records);

const meta = {
  title: '06 Views · 화면/자산',
  component: AssetsView,
  tags: ['autodocs'],
  globals: { viewport: { value: 'mobile390', isRotated: false } },
  parameters: {
    ownsMain: true,
    docs: {
      description: {
        component:
          '하단 탭의 자산 화면은 보기 전용입니다. 위에 순자산(자산 − 부채)과 종류별(현금·통장 / 저축·청약 / 투자 / 부채) 목록, 아래 분석에서 가계부를 연동한 자산 하나를 골라 기준일 이후 반영된 내역의 수입·지출·잔액 변화, 월별 흐름(월말 잔액), 항목별(유형·카테고리 등) 통계를 봅니다. 자산 추가·수정과 가계부 연동은 설정 → 자산 관리에서 합니다. 자산은 나만 봅니다.',
      },
    },
  },
  args: {
    assets,
    ledgers,
    records,
    onManage: () => {},
    tabBar: <HomeTabBar tab="assets" onTabChange={() => {}} />,
  },
  render: function Logged(args) {
    const [log, setLog] = useState('');
    return (
      <>
        <AssetsView {...args} onManage={() => setLog('자산 관리')} />
        <p role="status" className="sr-only">
          {log}
        </p>
      </>
    );
  },
} satisfies Meta<typeof AssetsView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    // 생활비 통장 follows 하반기: its starting balance plus November's reflected records.
    const cash = c.getByRole('list', { name: '현금·통장' });
    await expect(cash).toHaveTextContent(`${won(livingBalance)}원`);
    await expect(cash).toHaveTextContent('하반기 연동');
    // Looking only: no 자산 추가 here, and rows do not open.
    await expect(c.queryByRole('button', { name: '자산 추가' })).toBeNull();
    await expect(within(cash).queryByRole('button')).toBeNull();
    await expect(c.getByRole('combobox', { name: '분석할 자산' })).toHaveTextContent('생활비 통장');
    await expect(c.getByText('잔액 변화').nextElementSibling).toHaveTextContent(
      `${won(livingBalance - living.balance)}원`,
    );
    const months = within(c.getByRole('list', { name: '월별 흐름' })).getAllByRole('listitem');
    await expect(
      months.map((month) => month.querySelector('.ui-list-row-title')!.textContent),
    ).toEqual(['2026년 11월', '2026년 10월']);
    await expect(months[0]).toHaveTextContent(`${won(livingBalance)}원`);
    await expect(c.getByRole('list', { name: '카테고리별 지출' })).toBeVisible();
  },
};
export const FirstUse: Story = {
  args: { assets: [] },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '자산 관리' }));
    await expect(c.getByRole('status')).toHaveTextContent('자산 관리');
  },
};
export const NothingLinked: Story = {
  args: { assets: assets.filter((asset) => !asset.ledgerIds.length) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByText(/가계부를 연동한 자산이 없어요/)).toBeVisible();
    await expect(c.queryByRole('combobox', { name: '분석할 자산' })).toBeNull();
  },
};
export const Manage: Story = {
  render: function Managing() {
    const [log, setLog] = useState('');
    return (
      <>
        <AssetManageView
          assets={assets}
          ledgers={ledgers}
          records={records}
          onAdd={() => setLog('추가')}
          onOpenAsset={(asset) => setLog(`열기: ${asset.name}`)}
          onBack={() => setLog('설정으로')}
          tabBar={<HomeTabBar tab="settings" onTabChange={() => {}} />}
        />
        <p role="status" className="sr-only">
          {log}
        </p>
      </>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          '설정 → 자산 관리. 하단 탭은 그대로 있고 설정이 선택돼 있습니다. 오른쪽 위 자산 추가, 줄을 누르면 수정·삭제합니다.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '자산 추가' }));
    await expect(c.getByRole('status')).toHaveTextContent('추가');
    await userEvent.click(c.getByRole('button', { name: /^전세대출/ }));
    await expect(c.getByRole('status')).toHaveTextContent('열기: 전세대출');
    await userEvent.click(c.getByRole('button', { name: '설정으로' }));
    await expect(c.getByRole('status')).toHaveTextContent('설정으로');
  },
};
export const Edit: Story = {
  render: function Editing() {
    const [log, setLog] = useState('');
    return (
      <>
        <AssetEditView
          asset={assets[0]}
          assets={assets}
          ledgers={ledgers}
          today={FIXTURE_TODAY}
          onSave={(asset) => setLog(`저장: ${asset.name} ${asset.ledgerIds.join(',')}`)}
          onDelete={(asset) => setLog(`삭제: ${asset.name}`)}
          onClose={() => {}}
        />
        <p role="status" className="sr-only">
          {log}
        </p>
      </>
    );
  },
  parameters: { ownsMain: false },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: /^여행/ }));
    await userEvent.click(page.getByRole('button', { name: '저장' }));
    await expect(page.getByRole('status')).toHaveTextContent('저장: 생활비 통장 h2,travel');
  },
};
export const Add: Story = {
  render: () => (
    <AssetEditView
      assets={assets}
      ledgers={ledgers}
      today={FIXTURE_TODAY}
      onSave={() => {}}
      onClose={() => {}}
    />
  ),
  parameters: { ownsMain: false },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: '저장' }));
    await expect(page.getByRole('alert')).toHaveTextContent('이름');
    // 11월·12월 follow 생활비 통장 already, so neither they nor their parents are offered.
    await expect(page.queryByRole('button', { name: /^11월/ })).toBeNull();
    await expect(page.queryByRole('button', { name: /^2026/ })).toBeNull();
  },
};
