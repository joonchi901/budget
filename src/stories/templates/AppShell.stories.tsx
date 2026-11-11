import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { AppShell, Screen, WIDE_QUERY } from '../../client/templates';
import { Surface } from '../../client/ui';

const Slot = ({ label, height = 56 }: { label: string; height?: number }) => (
  <Surface padding={3} tone="subtle" style={{ minHeight: height }}>
    <span className="small muted">{label}</span>
  </Surface>
);

const meta = {
  title: '05 Templates · 템플릿/AppShell',
  component: AppShell,
  tags: ['autodocs', 'desktop'],
  globals: { viewport: { value: 'desktop', isRotated: false } },
  parameters: {
    ownsMain: true,
    docs: {
      description: {
        component:
          '데스크톱 틀. 1024px부터 왼쪽에 앱 메뉴(오른쪽 위 버튼으로 접고 펼침. 접히면 아이콘만 남고 맨 위 마크가 마우스를 올리면 펼치기 버튼으로 바뀜. 1440px 미만은 접힌 채 시작하고, 고른 상태는 이 브라우저에 기억), 그 옆에 목록 칸(방이 열려 있을 때 방 목록, 설정 페이지 옆 설정 메뉴), 나머지에 화면을 두고 칸마다 따로 스크롤합니다. 화면의 탭(방 탭)은 제목 아래로 올라가고, 휴대폰 하단 메뉴는 왼쪽 메뉴에 자리를 내줍니다. 휴대폰에서는 화면만 보입니다.',
      },
    },
  },
  args: {
    logo: <Slot label="로고" />,
    mark: <Slot label="마크" />,
    nav: <Slot label="앱 탭" height={200} />,
    aside: (
      <Screen top={<Slot label="목록 제목 · 검색" />}>
        <Slot label="목록" height={420} />
      </Screen>
    ),
    asideLabel: '목록',
    children: (
      <Screen top={<Slot label="화면 제목 · 요약" />} bottom={<Slot label="화면 탭" />}>
        <Slot label="본문" height={640} />
      </Screen>
    ),
  },
} satisfies Meta<typeof AppShell>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ListAndScreen: Story = {
  play: async ({ canvasElement }) => {
    // The runner also plays this at phone widths, where the shell shows the screen alone.
    if (!matchMedia(WIDE_QUERY).matches) return;
    const c = within(canvasElement);
    const nav = c.getByRole('navigation', { name: '앱 메뉴' });
    const list = c.getByRole('complementary', { name: '목록' });
    const main = c.getByRole('main');
    // Rail, list and screen sit left to right, the screen's tabs under its top.
    await expect(nav.getBoundingClientRect().right).toBeLessThanOrEqual(
      list.getBoundingClientRect().left + 1,
    );
    await expect(list.getBoundingClientRect().right).toBeLessThanOrEqual(
      main.getBoundingClientRect().left + 1,
    );
    await expect(c.getByText('화면 탭').getBoundingClientRect().top).toBeLessThan(
      c.getByText('본문').getBoundingClientRect().top,
    );
  },
};
export const ScreenOnly: Story = { args: { aside: undefined } };
export const FoldRail: Story = {
  play: async ({ canvasElement }) => {
    if (!matchMedia(WIDE_QUERY).matches) return;
    const c = within(canvasElement);
    const nav = c.getByRole('navigation', { name: '앱 메뉴' });
    // Below 1440px the rail starts folded; open it first.
    const unfold = c.queryByRole('button', { name: '메뉴 펼치기' });
    if (unfold) await userEvent.click(unfold);
    const open = nav.getBoundingClientRect().width;
    await userEvent.click(c.getByRole('button', { name: '메뉴 접기' }));
    await expect(nav.getBoundingClientRect().width).toBeLessThan(open);
    await expect(c.getByRole('button', { name: '메뉴 펼치기' })).toBeVisible();
    await expect(c.queryByText('로고')).toBeNull();
    await userEvent.click(c.getByRole('button', { name: '메뉴 펼치기' }));
    await expect(c.getByText('로고')).toBeVisible();
  },
};
