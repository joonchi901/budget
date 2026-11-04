import { useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { UgaLogo } from '../../client/brand/Uga';
import { HomeTabBar, type HomeTab } from '../../client/ledger';
import { AppShell, WIDE_QUERY } from '../../client/templates';
import {
  AccountView,
  AppSettingsView,
  AssetManageView,
  AssetsView,
  LedgerRoomView,
  LedgerSettingsView,
  RecordEntryView,
  RoomListView,
  RoomPlaceholderView,
} from '../../client/views';
import {
  FIXTURE_TODAY,
  assets,
  ledgers,
  me,
  members,
  november,
  records,
  year2026,
} from '../fixtures';

const noop = () => {};

/** The rail as the app shows it: the logo over the home tabs. */
function Rail({ tab, onTabChange = noop }: { tab: HomeTab; onTabChange?(tab: HomeTab): void }) {
  return (
    <>
      <UgaLogo size={120} alt="우리의 가계부" />
      <HomeTabBar tab={tab} pending={2} onTabChange={onTabChange} />
    </>
  );
}

const roomList = (currentId?: string, onOpenRoom: (id: string) => void = noop) => (
  <RoomListView
    ledgers={ledgers}
    records={records}
    unseen={{ y2026: 3 }}
    today={FIXTURE_TODAY}
    currentId={currentId}
    onOpenRoom={(room) => onOpenRoom(room.id)}
    onCreate={noop}
  />
);

function Room({ ledgerId, entry }: { ledgerId: string; entry?: ReactNode }) {
  const [open, setOpen] = useState(ledgerId);
  const ledger = ledgers.find((item) => item.id === open)!;
  return (
    <>
      <AppShell
        nav={<Rail tab="ledgers" />}
        aside={roomList(open, setOpen)}
        asideLabel="가계부 목록"
      >
        <LedgerRoomView
          key={open}
          ledger={ledger}
          ledgers={ledgers}
          records={records}
          today={FIXTURE_TODAY}
          onBack={noop}
          onAddRecord={noop}
          onOpenRecord={noop}
          reacting={{ memberId: 'u1', members, onToggleReaction: noop }}
          settings={
            <LedgerSettingsView ledger={ledger} ledgers={ledgers} onSave={noop} onArchive={noop} />
          }
          onCopy={noop}
          onOpenLedger={(child) => setOpen(child.id)}
        />
      </AppShell>
      {entry}
    </>
  );
}

const meta = {
  title: '06 Views · 화면/데스크톱',
  component: AppShell,
  tags: ['autodocs', 'desktop'],
  globals: { viewport: { value: 'desktop', isRotated: false } },
  parameters: {
    ownsMain: true,
    docs: {
      description: {
        component:
          '1024px 이상 화면. 하단 탭은 왼쪽 메뉴가 되고(1440px 미만은 아이콘만), 가계부 탭에서는 방 목록을 왼쪽에 둔 채 고른 방을 옆에 엽니다. 방은 탭(내역·통계·대화·설정)을 제목 아래에 두고, 내역 추가는 제목 막대로 올라갑니다. 내역은 표와 캘린더를 함께 보여 주고 캘린더는 옆에 고정됩니다(본문이 좁으면 휴대폰처럼 전환). 설정은 메뉴 옆에 페이지를, 자산은 요약과 분석을 나란히 보여 줍니다. 내역 입력은 오른쪽에서 밀려 나오는 시트로 열려 뒤 화면이 보입니다.',
      },
    },
  },
  args: { nav: null, children: null },
} satisfies Meta<typeof AppShell>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LedgerRoom: Story = {
  render: () => <Room ledgerId={november.id} />,
  play: async ({ canvasElement }) => {
    // The runner also plays this at phone widths, where the shell shows the screen alone.
    if (!matchMedia(WIDE_QUERY).matches) return;
    const c = within(canvasElement);
    // The open room is marked in the list beside it.
    await expect(c.getByRole('button', { name: /^하위 가계부 11월/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    // From 1280px the room has room for 표 and 캘린더 together, so the switch is gone.
    if (!matchMedia('(min-width: 1280px)').matches) return;
    await expect(c.getByRole('group', { name: '기간 달력' })).toBeVisible();
    await expect(c.getByRole('list', { name: /^11월 1일/ })).toBeVisible();
    await expect(c.queryByRole('group', { name: '내역 보기 방식' })).toBeNull();
    await expect(c.getByRole('button', { name: '내역 추가' })).toBeVisible();
    const tabs = c.getByRole('group', { name: '보기' });
    await expect(tabs.getBoundingClientRect().top).toBeLessThan(
      c.getByRole('searchbox', { name: '내역 검색' }).getBoundingClientRect().top,
    );
  },
};
export const ParentRoom: Story = {
  render: () => <Room ledgerId={year2026.id} />,
  play: async ({ canvasElement }) => {
    // The runner also plays this at phone widths, where the shell shows the screen alone.
    if (!matchMedia(WIDE_QUERY).matches) return;
    const c = within(canvasElement);
    // A record's source link opens that ledger beside the same list.
    await userEvent.click(c.getAllByRole('button', { name: '11월 가계부로 이동' })[0]);
    await expect(c.getByRole('heading', { level: 1, name: '11월' })).toBeVisible();
    await expect(c.getByRole('button', { name: /^하위 가계부 11월/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  },
};
export const PickRoom: Story = {
  render: () => (
    <AppShell nav={<Rail tab="ledgers" />} aside={roomList()} asideLabel="가계부 목록">
      <RoomPlaceholderView onCreate={noop} />
    </AppShell>
  ),
};
export const EntrySheet: Story = {
  render: () => (
    <Room
      ledgerId={november.id}
      entry={
        <RecordEntryView
          ledgers={[november]}
          today={FIXTURE_TODAY}
          memberId="u1"
          onSave={noop}
          onClose={noop}
        />
      }
    />
  ),
  play: async ({ canvasElement }) => {
    // The runner also plays this at phone widths, where the shell shows the screen alone.
    if (!matchMedia(WIDE_QUERY).matches) return;
    const page = within(canvasElement.ownerDocument.body);
    // The sheet comes in from the right edge, leaving the room in view.
    const sheet = page.getByRole('dialog', { name: '내역 추가' });
    await expect(sheet.getBoundingClientRect().right).toBeCloseTo(window.innerWidth, 0);
    await expect(sheet.getBoundingClientRect().width).toBeLessThanOrEqual(480);
  },
};
export const Assets: Story = {
  render: () => (
    <AppShell nav={<Rail tab="assets" />}>
      <AssetsView assets={assets} ledgers={ledgers} records={records} onManage={noop} />
    </AppShell>
  ),
  play: async ({ canvasElement }) => {
    // The runner also plays this at phone widths, where the shell shows the screen alone.
    if (!matchMedia(WIDE_QUERY).matches) return;
    const c = within(canvasElement);
    // Overview and analysis side by side.
    await expect(
      c.getByRole('heading', { name: '분석' }).getBoundingClientRect().left,
    ).toBeGreaterThan(c.getByRole('heading', { name: '현금·통장' }).getBoundingClientRect().right);
  },
};
export const Settings: Story = {
  render: function Pages() {
    const [page, setPage] = useState<'profile' | 'assets'>('profile');
    return (
      <AppShell
        nav={<Rail tab="settings" />}
        aside={
          <AppSettingsView
            current={page}
            onOpenProfile={() => setPage('profile')}
            onOpenAssets={() => setPage('assets')}
          />
        }
        asideLabel="설정 메뉴"
      >
        {page === 'profile' ? (
          <AccountView
            profile={me}
            email="junsang@example.com"
            today={FIXTURE_TODAY}
            onSave={noop}
            onLogout={noop}
            onLeave={noop}
          />
        ) : (
          <AssetManageView
            assets={assets}
            ledgers={ledgers}
            records={records}
            onAdd={noop}
            onOpenAsset={noop}
          />
        )}
      </AppShell>
    );
  },
  play: async ({ canvasElement }) => {
    // The runner also plays this at phone widths, where the shell shows the screen alone.
    if (!matchMedia(WIDE_QUERY).matches) return;
    const c = within(canvasElement);
    // The page opens beside its menu, so it has no way back.
    await expect(c.getByRole('heading', { level: 1, name: '프로필' })).toBeVisible();
    await expect(c.queryByRole('button', { name: '설정으로' })).toBeNull();
    await expect(c.getByRole('button', { name: /^프로필/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  },
};
