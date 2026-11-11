import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { UgaIcon } from '../../client/brand/Uga';
import { Amount, CountBadge, List, ListRow, Tag } from '../../client/ui';

const meta = {
  title: '03 Molecules · 분자/List',
  component: ListRow,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'List는 목록 표면, ListRow는 한 줄입니다. 앞쪽 그림, 제목과 보조 줄, 오른쪽 값(금액·시간·배지)을 배치합니다. onClick을 주면 줄 전체가 하나의 버튼이 됩니다. 긴 제목은 줄바꿈합니다.',
      },
    },
  },
  args: { title: '장보기_쿠팡' },
  render: (args) => (
    <List aria-label="예시 목록" style={{ maxWidth: 390 }}>
      <ListRow {...args} />
    </List>
  ),
} satisfies Meta<typeof ListRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Records: Story = {
  render: () => (
    <List aria-label="10월 29일 내역" style={{ maxWidth: 390 }}>
      <ListRow
        title="코노미스시_평촌롯백"
        description={<Tag name="외식/배달/간식" color="#D28C70" />}
        trailing={<Amount value={63700} tone="expense" signed />}
      />
      <ListRow
        title="우리마트"
        description="우유, 브로콜리"
        trailing={<Amount value={13460} tone="expense" signed />}
      />
      <ListRow
        title="정기급여"
        description="월급 · 준상"
        trailing={<Amount value={2736060} tone="income" signed />}
      />
    </List>
  ),
};
export const Rooms: Story = {
  render: function RoomList() {
    const [opened, setOpened] = useState('');
    return (
      <>
        <List aria-label="가계부 목록" style={{ maxWidth: 390 }}>
          <ListRow
            leading={<UgaIcon name="ledger" size={36} />}
            title="11월"
            description="프레드피자_쿠팡이츠 · 29,300원"
            trailing={
              <>
                <span>오후 8:12</span>
                <CountBadge count={3} label="새 내역 3건" />
              </>
            }
            current={opened === '11월'}
            onClick={() => setOpened('11월')}
          />
          <ListRow
            leading={<UgaIcon name="sprout" size={36} />}
            title="이름이 아주 긴 2026년 가족 일본여행 오사카·교토 가계부"
            description="10/18–10/22"
            trailing={<span>10월 22일</span>}
            current={opened === '일본여행'}
            onClick={() => setOpened('일본여행')}
          />
        </List>
        <p role="status">{opened && `${opened} 열림`}</p>
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: /11월/ }));
    await expect(c.getByRole('status')).toHaveTextContent('11월 열림');
    await expect(c.getByRole('button', { name: /11월/ })).toHaveAttribute('aria-current', 'true');
  },
};
