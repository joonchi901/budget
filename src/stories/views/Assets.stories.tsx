import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { HomeTabBar } from '../../client/ledger';
import { won } from '../../client/ui';
import { AssetEditView, AssetsView } from '../../client/views';
import { assetBalance } from '../../shared/assets';
import { FIXTURE_TODAY, assets, ledgers, records } from '../fixtures';

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
          '하단 탭의 자산 화면. 위에 순자산(자산 − 부채)과 자산·부채 합계, 아래에 종류별(현금·통장 / 저축·청약 / 투자 / 부채) 목록이 있습니다. 자산은 가계부를 연동할 수 있고, 기준일부터 연동된 가계부 내역 중 "자산에 반영"된 수입은 더하고 지출은 뺍니다. 오른쪽 위 자산 추가, 줄을 누르면 수정합니다. 자산은 나만 봅니다.',
      },
    },
  },
  args: {
    assets,
    ledgers,
    records,
    onAdd: () => {},
    onOpenAsset: () => {},
    tabBar: <HomeTabBar tab="assets" onTabChange={() => {}} />,
  },
  render: function Logged(args) {
    const [log, setLog] = useState('');
    return (
      <>
        <AssetsView
          {...args}
          onAdd={() => setLog('추가')}
          onOpenAsset={(asset) => setLog(`열기: ${asset.name}`)}
        />
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
    const living = assetBalance(assets[0], ledgers, records);
    await expect(c.getByRole('button', { name: /^생활비 통장/ })).toHaveTextContent(
      `${won(living)}원`,
    );
    await expect(c.getByRole('button', { name: /^생활비 통장/ })).toHaveTextContent('하반기 연동');
    await userEvent.click(c.getByRole('button', { name: /^전세대출/ }));
    await expect(c.getByRole('status')).toHaveTextContent('열기: 전세대출');
  },
};
export const FirstUse: Story = { args: { assets: [] } };
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
