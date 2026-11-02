import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import {
  Button,
  Grid,
  Inline,
  Panel,
  Stack,
  SummaryGrid,
  Surface,
  TableScroll,
  Toolbar,
} from '../../client/ui';
import { Stat } from '../../client/components';
import { TagBadge } from '../../client/TagBadge';

const meta = {
  title: '03 Layout/Composition',
  component: Grid,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Stack은 세로 흐름, Inline은 줄바꿈 가능한 가로 흐름, Grid는 동일 너비 열, Surface는 내용의 시각적 경계를 담당합니다. gap/padding은 brand-space 토큰 번호(1=4px, 2=8px)입니다. Grid는 1000px 이하 tabletColumns, 760px 이하 mobileColumns를 사용하며 기본 모바일 열 수는 1입니다. HTML 의미를 as로 유지하고, 달력의 7일 열과 데이터 표는 전용 레이아웃으로 남깁니다.',
      },
    },
  },
  argTypes: {
    columns: { control: 'select', options: [1, 2, 3, 4] },
    tabletColumns: { control: 'select', options: [1, 2, 3, 4] },
    mobileColumns: { control: 'select', options: [1, 2, 3, 4] },
    gap: { control: 'select', options: [0, 1, 2, 3, 4, 5, 6, 8, 10, 12] },
    as: {
      control: 'select',
      options: ['div', 'section', 'article', 'aside', 'header', 'nav', 'ul', 'ol'],
    },
  },
  args: { columns: 3, tabletColumns: 2, mobileColumns: 1, gap: 4 },
  render: (args) => (
    <Grid {...args} aria-label="조립식 가계부 카드 예시">
      {[
        '우리의 일상',
        '제주도 가족 여행',
        '이름이 아주 긴 2026년 우리 가족의 특별한 기념일 가계부',
      ].map((name, index) => (
        <Surface key={name} padding={4} raised>
          <Stack gap={4}>
            <Stack gap={2}>
              <h2>{name}</h2>
              <p className="muted">긴 이름과 설명도 카드의 너비 안에서 읽을 수 있어요.</p>
            </Stack>
            <Inline gap={2}>
              <TagBadge name="분류 태그" color="#38735b" />
              <TagBadge name={index ? '가족과 함께하는 특별한 일정' : '생활비'} color="#ad4f2c" />
            </Inline>
            <Inline gap={2} justify="between">
              <span className="small muted">합성 예시</span>
              <Button variant="secondary">가계부 열기</Button>
            </Inline>
          </Stack>
        </Surface>
      ))}
    </Grid>
  ),
} satisfies Meta<typeof Grid>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ResponsiveGrid: Story = {
  play: async ({ canvasElement }) => {
    const grid = within(canvasElement).getByLabelText('조립식 가계부 카드 예시');
    await expect(grid.children).toHaveLength(3);
    await expect(grid.scrollWidth).toBeLessThanOrEqual(grid.clientWidth + 1);
  },
};

export const Mobile320: Story = {
  globals: { viewport: { value: 'mobile320', isRotated: false } },
  play: ResponsiveGrid.play,
};

export const Mobile390: Story = {
  globals: { viewport: { value: 'mobile390', isRotated: false } },
  play: ResponsiveGrid.play,
};

export const CompactTwoColumns: Story = {
  args: { columns: 4, tabletColumns: 2, mobileColumns: 2, gap: 2 },
  render: (args) => (
    <Grid {...args} aria-label="짧은 요약 격자">
      {['기록 12개', '수입 3개', '지출 9개', '하위 가계부 2개'].map((label) => (
        <Surface key={label} padding={3} tone="subtle">
          {label}
        </Surface>
      ))}
    </Grid>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'mobileColumns=2는 짧은 요약이나 하위 가계부 버튼에 사용합니다. 긴 폼과 설명 카드는 기본 1열을 유지하세요.',
      },
    },
  },
};

export const SemanticComposition: Story = {
  render: () => (
    <Surface as="section" aria-labelledby="composition-title" raised>
      <Stack gap={6}>
        <Inline as="header" gap={3} justify="between" align="start">
          <Stack gap={2}>
            <h2 id="composition-title">함께 쓰는 가계부</h2>
            <p className="muted">의미 있는 제목과 행동을 같은 내용 경계 안에 조립해요.</p>
          </Stack>
          <Button variant="primary">새 가계부</Button>
        </Inline>
        <Surface padding={4} tone="subtle">
          <p>Surface는 저장이나 계산을 하지 않아요. 화면이 전달하는 내용을 담는 표면이에요.</p>
        </Surface>
      </Stack>
    </Surface>
  ),
};

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
