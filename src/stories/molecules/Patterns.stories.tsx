import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Button, Panel, Stat, SummaryGrid, TableScroll, Toolbar } from '../../client/ui';

const meta = {
  title: '03 Molecules · 분자/Patterns',
  component: Panel,
  tags: ['autodocs'],
} satisfies Meta<typeof Panel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ScreenPatterns: Story = {
  render: () => (
    <Panel aria-labelledby="patterns-title">
      <Toolbar>
        <h2 id="patterns-title">이번 달 요약</h2>
        <Button variant="secondary">조건 바꾸기</Button>
      </Toolbar>
      <SummaryGrid columns={3}>
        <Stat label="수입" amount={3200000} hint="합성 예시" />
        <Stat label="지출" amount={1875000} hint="합성 예시" />
        <Stat label="남은 금액" amount={1325000} hint="수입 - 지출" accent />
      </SummaryGrid>
      <TableScroll aria-label="합성 기록 표">
        <table>
          <thead>
            <tr>
              <th>날짜</th>
              <th>내용</th>
              <th>금액</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>11월 2일</td>
              <td>장보기</td>
              <td>48,000원</td>
            </tr>
          </tbody>
        </table>
      </TableScroll>
    </Panel>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Panel은 화면의 내용 경계, Toolbar는 제목과 행동, SummaryGrid는 요약 카드, TableScroll은 이름 있는 키보드 스크롤 영역입니다.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const region = within(canvasElement).getByRole('region', { name: '합성 기록 표' });
    await expect(region).toHaveAttribute('tabindex', '0');
  },
};
