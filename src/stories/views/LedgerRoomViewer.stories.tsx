import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { LedgerRoomView } from '../../client/views';
import { FIXTURE_TODAY, ledgers, november, records } from '../fixtures';

const meta = {
  title: '06 Views · 화면/가계부 방 (보기 멤버)',
  component: LedgerRoomView,
  globals: { viewport: { value: 'mobile390', isRotated: false } },
  parameters: {
    ownsMain: true,
    docs: {
      description: {
        component:
          '보기 권한으로 공유받은 가계부 방. 내역을 읽고 열어 볼 수만 있어서, 내역 추가(탭 막대 위·제목 줄)와 날짜 시트의 "이 날짜로 추가"가 없습니다. 앱은 이때 onAddRecord를 넘기지 않습니다.',
      },
    },
  },
  args: {
    ledger: november,
    ledgers,
    records,
    today: FIXTURE_TODAY,
    onBack: () => {},
    onOpenRecord: () => {},
    settings: null,
    onCopy: () => {},
    onOpenLedger: () => {},
  },
} satisfies Meta<typeof LedgerRoomView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Viewer: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await expect(c.getAllByRole('button', { name: /쿠팡이츠/ }).length).toBeGreaterThan(0);
    await expect(c.queryByRole('button', { name: '내역 추가' })).toBeNull();
    await userEvent.click(c.getByRole('button', { name: '캘린더' }));
    await userEvent.click(c.getByRole('button', { name: /^10월 31일/ }));
    await expect(page.getByRole('dialog', { name: '10월 31일 (토)' })).toBeVisible();
    await expect(page.queryByRole('button', { name: '이 날짜로 추가' })).toBeNull();
  },
};
