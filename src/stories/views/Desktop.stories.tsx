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

/** The rail as the app shows it: the logo (or, folded, the mark) over the home tabs. */
const rail = (tab: HomeTab) => ({
  logo: <UgaLogo size={120} alt="우리의 가계부" />,
  mark: <UgaLogo variant="mark" size={36} />,
  nav: <HomeTabBar tab={tab} pending={2} onTabChange={noop} />,
});

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
      <AppShell {...rail('ledgers')} aside={roomList(open, setOpen)} asideLabel="가계부 목록">
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
          onSaveStatCards={noop}
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
          '1024px 이상 화면. 하단 탭은 접고 펼칠 수 있는 왼쪽 메뉴가 되고(1440px 미만은 접힌 채 시작), 가계부 탭에서는 방 목록을 왼쪽에 둔 채 고른 방을 옆에 엽니다. 방은 탭(내역·통계·대화·설정)을 제목 아래에 두고, 내역 추가는 제목 막대로 올라갑니다. 내역은 조회 조건 옆 토글로 캘린더·테이블을 고릅니다. 캘린더는 왼쪽에 고정된 달력 옆에 내역을 보여 주고(본문이 좁으면 휴대폰처럼 전환), 테이블은 달력 없이 표가 폭 전체를 쓰며 옆으로 스크롤하지 않게 내용·비고와 태그가 줄바꿈합니다. 내역 아래 반응 추가·가계부 이동 버튼은 마우스를 올리면 행 위로 떠올라 구분됩니다. 통계는 차트를 두 개씩 나란히(요약·추이는 한 줄 전체) 놓습니다. 설정은 메뉴 옆에 페이지를, 자산은 요약과 분석을 나란히 보여 줍니다. 내역 입력은 오른쪽에서 밀려 나오는 시트로 열려 뒤 화면이 보입니다.',
      },
    },
  },
  args: { logo: null, mark: null, nav: null, children: null },
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
    // From 1280px the room opens on 캘린더: the calendar pinned left of the records.
    if (!matchMedia('(min-width: 1280px)').matches) return;
    await expect(c.getByRole('button', { name: '캘린더' })).toHaveAttribute('aria-pressed', 'true');
    await expect(
      c.getByRole('group', { name: '기간 달력' }).getBoundingClientRect().right,
    ).toBeLessThan(c.getByRole('list', { name: /^11월 1일/ }).getBoundingClientRect().left);
    await expect(c.getByRole('button', { name: '내역 추가' })).toBeVisible();
    const tabs = c.getByRole('group', { name: '보기' });
    await expect(tabs.getBoundingClientRect().top).toBeLessThan(
      c.getByRole('searchbox', { name: '내역 검색' }).getBoundingClientRect().top,
    );
  },
};
export const WideTable: Story = {
  render: () => <Room ledgerId={year2026.id} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    // A wide body has the 캘린더/테이블 toggle; phones keep 넓게 보기 in the panel.
    const table = c.queryByRole('button', { name: '테이블' });
    if (table) {
      await userEvent.click(table);
      await expect(table).toHaveAttribute('aria-pressed', 'true');
      await expect(c.queryByRole('group', { name: '기간 달력' })).toBeNull();
    } else {
      await userEvent.click(c.getByRole('button', { name: '조회 조건' }));
      await userEvent.click(c.getByRole('switch', { name: '넓게 보기' }));
      await userEvent.click(c.getByRole('button', { name: '조회 조건' }));
    }
    await expect(c.getByRole('region', { name: '내역 표' })).toBeVisible();
  },
};
export const Stats: Story = {
  render: () => <Room ledgerId={november.id} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '통계' }));
    await expect(c.getByRole('heading', { level: 2, name: '지출 요약' })).toBeVisible();
    // A wide body sets the charts two to a row, 요약 and 추이 across both.
    if (!matchMedia('(min-width: 1280px)').matches) return;
    const rank = c.getByRole('region', { name: '지출 순위' }).getBoundingClientRect();
    const donut = c.getByRole('region', { name: '지출 비율' }).getBoundingClientRect();
    await expect(donut.left).toBeGreaterThan(rank.right);
    await expect(donut.top).toBeCloseTo(rank.top, 0);
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
    <AppShell {...rail('ledgers')} aside={roomList()} asideLabel="가계부 목록">
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
    <AppShell {...rail('assets')}>
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
        {...rail('settings')}
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
