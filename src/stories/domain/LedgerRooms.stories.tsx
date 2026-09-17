import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import LedgerRooms from '../../client/LedgerRooms';
import { makeStoryBootstrap, storyLedgers, storyUsers } from '../fixtures';

const meta = {
  title: '05 Domain/가계부 방/LedgerRooms',
  component: LedgerRooms,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '가계부에 진입하기 전의 방 목록입니다. 평소에는 최상위 방을, 검색할 때는 하위 방과 경로까지 보여줍니다. 최근 수정 순서는 내역의 updatedAt을 사용하며 읽지 않은 메시지 같은 가짜 상태를 표시하지 않습니다. data는 손으로 만든 합성 자료이며 onOpen/onCreate는 Actions에만 기록됩니다. 실제 라우팅·생성·권한 검증은 앱과 서버의 책임입니다.',
      },
    },
  },
  args: { data: makeStoryBootstrap(), onOpen: fn(), onCreate: fn() },
  argTypes: {
    data: {
      control: false,
      description: '합성 Bootstrap. 하위 가계부의 내역도 방 요약에 포함합니다.',
    },
    onOpen: { description: '선택한 가계부 ID. 전체 모아보기는 전체 가계부 ID를 전달합니다.' },
    onCreate: {
      description: '관리자의 빈 상태 만들기 버튼 클릭. 이 컴포넌트는 저장하지 않습니다.',
    },
  },
} satisfies Meta<typeof LedgerRooms>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  name: '기록이 있는 방 목록',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '우리의 일상 가계부 열기' }));
    await expect(args.onOpen).toHaveBeenCalledWith('sb-home');
    await expect(canvas.getByText('기록 4건 · 하위 가계부 3개 포함')).toBeVisible();
  },
};

export const SearchNestedRoom: Story = {
  name: '하위 방 검색과 진입',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('searchbox', { name: '가계부 검색' }), '6월');
    await expect(canvas.getByText('우리의 일상 / 2026 기록 / 6월 생활비')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: '여름 바다 여행 가계부 열기' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: '6월 생활비 가계부 열기' }));
    await expect(args.onOpen).toHaveBeenCalledWith('sb-june');
  },
};

export const NoSearchResults: Story = {
  name: '검색 결과 없음',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('searchbox', { name: '가계부 검색' }), '없는 가계부');
    await expect(canvas.getByText('찾는 가계부가 없어요')).toBeVisible();
    await expect(canvas.getByRole('button', { name: '검색 지우기' })).toBeVisible();
  },
};

export const EmptyAdmin: Story = {
  name: '관리자의 첫 가계부',
  args: { data: makeStoryBootstrap({ ledgers: [], transactions: [] }) },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: '가계부 만들기' }));
    await expect(args.onCreate).toHaveBeenCalledOnce();
  },
};

export const EmptyUser: Story = {
  name: '일반 사용자의 빈 목록',
  args: { data: makeStoryBootstrap({ user: storyUsers[1], ledgers: [], transactions: [] }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('아직 가계부가 없어요')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: '가계부 만들기' })).toBeNull();
  },
};

export const ArchivedRoom: Story = {
  name: '보관한 방 표시',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('button', { name: '지난 봄 소풍 가계부 열기' })).toBeNull();
    await userEvent.click(canvas.getByRole('checkbox', { name: '보관한 가계부 포함' }));
    await userEvent.click(canvas.getByRole('button', { name: '지난 봄 소풍 가계부 열기' }));
    await expect(args.onOpen).toHaveBeenCalledWith('sb-archived');
  },
};

export const LongNames: Story = {
  name: '긴 방 이름과 여러 단계 경로',
  args: {
    data: makeStoryBootstrap({
      ledgers: storyLedgers.map((ledger) =>
        ledger.id === 'sb-home'
          ? { ...ledger, name: '함께 기록하는 아주 긴 이름의 우리 가족 일상 가계부' }
          : ledger,
      ),
    }),
  },
  parameters: {
    docs: {
      description: {
        story:
          '좁은 화면에서는 방 이름과 내역 요약이 말줄임됩니다. 버튼의 접근성 이름에는 전체 이름이 남습니다. 툴바에서 모바일 뷰포트를 선택해 확인합니다.',
      },
    },
  },
};
