import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import PlanningView from '../../client/PlanningView';
import type { Plan } from '../../shared/planning';
import { makeStoryBootstrap, STORY_MONTH } from '../fixtures';

const common = {
  ledgerId: 'sb-june',
  startDate: '2026-06-01',
  endDate: '2026-06-30',
  amount: 300000,
  tagIds: [],
  paymentMethodId: null,
  ownerId: null,
  includeLinked: true,
  notes: '',
  archived: false,
  version: 1,
};
const plans: Plan[] = [
  {
    ...common,
    id: 'sb-budget',
    title: '6월 생활비 계획',
    kind: 'budget',
    cadence: 'month',
    budgetScope: 'total',
  },
  {
    ...common,
    id: 'sb-goal',
    title: '이번 달 수입 목표',
    kind: 'goal',
    metric: 'income',
    direction: 'atLeast',
    assetId: null,
    amount: 2000000,
  },
  {
    ...common,
    id: 'sb-payroll',
    title: '6월 월급 나누기',
    kind: 'payroll',
    amount: 2000000,
    rounding: 'none',
    lines: [
      {
        id: 'sb-line',
        title: '생활비',
        amount: 300000,
        rounding: 'none',
        purpose: 'expense',
        assetId: null,
      },
    ],
  },
  {
    ...common,
    id: 'sb-event',
    title: '가족 모임',
    kind: 'event',
    actualMode: 'manual',
    actualAmount: 120000,
    evaluation: '예산 안에서 마쳤어요.',
  },
  {
    ...common,
    id: 'sb-schedule',
    title: '월 정기 결제',
    kind: 'schedule',
    repeat: 'once',
    endDate: '2026-06-01',
    amount: 12000,
    payments: [],
  },
  {
    ...common,
    id: 'sb-archived-budget',
    title: '보관한 초안',
    kind: 'budget',
    cadence: 'month',
    budgetScope: 'total',
    archived: true,
  },
];
const meta = {
  title: '06 Screens/Planning',
  tags: ['planning-screen'],
  component: PlanningView,
  args: {
    data: makeStoryBootstrap({ plans }),
    month: STORY_MONTH,
    ledgerId: 'sb-june',
    lockedLedger: true,
    onChanged: fn(async () => {}),
    onNotice: fn(),
  },
  parameters: {
    docs: {
      story: { inline: false },
      description: {
        component:
          '예산·목표·월급 배분·행사·결제 일정의 실제 화면입니다. 합성된 계획과 기록을 사용하며, 저장 예시는 Storybook 안의 고정 API 응답만 사용합니다. 계획은 수입·지출이나 잔액을 직접 변경하지 않습니다.',
      },
    },
  },
} satisfies Meta<typeof PlanningView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Budget: Story = { name: '월 예산과 실적' };
export const Empty: Story = { name: '계획 없는 가계부', args: { data: makeStoryBootstrap() } };
export const SelectLedger: Story = {
  name: '가계부 선택 전',
  args: { ledgerId: '__all__', lockedLedger: false },
};
export const KindsAndArchive: Story = {
  name: '다섯 종류 전환과 보관 필터',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const [kind, heading] of [
      ['목표', '이번 달 수입 목표'],
      ['월급 배분', '6월 월급 나누기'],
      ['행사', '가족 모임'],
      ['결제 일정', '월 정기 결제'],
      ['예산', '6월 생활비 계획'],
    ]) {
      await userEvent.click(canvas.getByRole('button', { name: kind }));
      await expect(canvas.getByRole('heading', { name: heading })).toBeVisible();
    }
    await userEvent.click(canvas.getByRole('checkbox', { name: '보관한 계획 포함' }));
    await expect(canvas.getByRole('heading', { name: '보관한 초안' })).toBeVisible();
  },
};
export const RequiredAndCancel: Story = {
  name: '필수값 검증과 작성 취소 확인',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '예산 추가' }));
    const dialog = within(canvas.getByRole('dialog', { name: '예산 추가' }));
    await userEvent.click(dialog.getByRole('button', { name: '계획 저장' }));
    await expect(dialog.getByRole('textbox', { name: '계획 이름' })).toHaveFocus();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await userEvent.type(dialog.getByRole('textbox', { name: '계획 이름' }), '작성 중 예산');
    await userEvent.click(dialog.getAllByRole('button', { name: '닫기' })[0]);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: '계속 작성' }));
    await expect(dialog.getByRole('textbox', { name: '계획 이름' })).toHaveValue('작성 중 예산');
    await userEvent.click(dialog.getAllByRole('button', { name: '닫기' })[0]);
    await userEvent.click(page.getByRole('button', { name: '변경 내용 버리기' }));
    await expect(canvas.queryByRole('dialog')).toBeNull();
  },
};
export const SaveSuccess: Story = {
  name: '저장 성공 후 목록 복귀',
  parameters: { apiRoutes: [{ path: '/api/plans', method: 'POST', response: { revision: 2 } }] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '예산 추가' }));
    const dialog = within(canvas.getByRole('dialog', { name: '예산 추가' }));
    await userEvent.type(dialog.getByRole('textbox', { name: '계획 이름' }), '새 월간 예산');
    await userEvent.click(dialog.getByRole('button', { name: '계획 저장' }));
    await expect(args.onChanged).toHaveBeenCalled();
    await expect(args.onNotice).toHaveBeenCalledWith('계획을 저장했어요.');
    await expect(canvas.queryByRole('dialog')).toBeNull();
  },
};
export const ServerValidation: Story = {
  name: '서버 검증 오류와 입력 보존',
  parameters: {
    apiRoutes: [
      {
        path: '/api/plans',
        method: 'POST',
        status: 400,
        response: { error: '예산 조건을 확인해 주세요.', code: 'VALIDATION' },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '예산 추가' }));
    const dialog = within(canvas.getByRole('dialog', { name: '예산 추가' }));
    await userEvent.type(dialog.getByRole('textbox', { name: '계획 이름' }), '유지할 예산');
    await userEvent.click(dialog.getByRole('button', { name: '계획 저장' }));
    await expect(dialog.getByRole('alert')).toHaveTextContent('예산 조건을 확인해 주세요.');
    await expect(dialog.getByRole('textbox', { name: '계획 이름' })).toHaveValue('유지할 예산');
    await expect(dialog.getByRole('button', { name: '계획 저장' })).toBeEnabled();
  },
};
export const ConflictReload: Story = {
  name: '동시 수정 충돌과 최신 계획 불러오기',
  parameters: {
    apiRoutes: [
      {
        path: '/api/plans/sb-budget',
        method: 'PATCH',
        status: 409,
        response: { error: '다른 곳에서 계획을 수정했어요.', code: 'VERSION_CONFLICT' },
      },
      {
        path: '/api/bootstrap',
        response: makeStoryBootstrap({
          plans: plans.map((plan) =>
            plan.id === 'sb-budget' ? { ...plan, title: '최신 생활비 계획', version: 2 } : plan,
          ),
        }),
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '6월 생활비 계획 수정' }));
    const dialog = within(canvas.getByRole('dialog', { name: '예산 설정' }));
    await userEvent.click(dialog.getByRole('button', { name: '계획 저장' }));
    await expect(dialog.getByRole('button', { name: '계획 저장' })).toBeDisabled();
    await userEvent.click(dialog.getByRole('button', { name: '최신 계획 불러오기' }));
    await expect(dialog.getByRole('textbox', { name: '계획 이름' })).toHaveValue(
      '최신 생활비 계획',
    );
    await userEvent.click(dialog.getAllByRole('button', { name: '닫기' })[0]);
    await expect(canvas.queryByRole('dialog')).toBeNull();
  },
};

export const GoalEditor: Story = {
  name: '저축 목표와 집계 범위 안내',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '목표' }));
    await userEvent.click(canvas.getByRole('button', { name: '이번 달 수입 목표 수정' }));
    const dialog = within(canvas.getByRole('dialog', { name: '목표 설정' }));
    await userEvent.click(dialog.getByRole('combobox', { name: '목표 대상' }));
    await userEvent.click(dialog.getByRole('option', { name: '가구 순저축' }));
    await expect(dialog.getByRole('combobox', { name: /^저축 자산/ })).toBeVisible();
    await expect(dialog.getByText(/실적은 가구 전체 자산 이동으로 계산해요/)).toBeVisible();
  },
};
export const PayrollEditor: Story = {
  name: '월급 배분 항목 추가와 삭제',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '월급 배분' }));
    await userEvent.click(canvas.getByRole('button', { name: '6월 월급 나누기 수정' }));
    const dialog = within(canvas.getByRole('dialog', { name: '월급 배분 설정' }));
    await userEvent.click(dialog.getByRole('button', { name: '배분 항목 추가' }));
    await userEvent.type(dialog.getByRole('textbox', { name: '2. 배분 항목' }), '저축 계획');
    await expect(dialog.getByRole('textbox', { name: '2. 배분 항목' })).toHaveValue('저축 계획');
    await userEvent.click(dialog.getAllByRole('button', { name: '배분 항목 삭제' })[1]);
    await expect(dialog.queryByRole('textbox', { name: '2. 배분 항목' })).toBeNull();
  },
};
export const EventEditor: Story = {
  name: '행사 실적과 메모 편집',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '행사' }));
    await userEvent.click(canvas.getByRole('button', { name: '가족 모임 수정' }));
    const dialog = within(canvas.getByRole('dialog', { name: '행사 설정' }));
    await expect(dialog.getByRole('spinbutton', { name: '행사 실제 금액' })).toHaveValue(120000);
    await userEvent.clear(dialog.getByRole('textbox', { name: '결산·평가' }));
    await userEvent.type(
      dialog.getByRole('textbox', { name: '결산·평가' }),
      '다음 모임에도 참고해요.',
    );
    await expect(dialog.getByRole('textbox', { name: '결산·평가' })).toHaveValue(
      '다음 모임에도 참고해요.',
    );
  },
};
export const ScheduleEditor: Story = {
  name: '납부 확인 추가와 취소',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '결제 일정' }));
    await userEvent.click(canvas.getByRole('button', { name: '월 정기 결제 수정' }));
    const dialog = within(canvas.getByRole('dialog', { name: '결제 일정 설정' }));
    await userEvent.click(dialog.getByRole('button', { name: '납부 확인 추가' }));
    await expect(dialog.getByRole('spinbutton', { name: '실제 납부액' })).toHaveValue(12000);
    await expect(dialog.getByRole('button', { name: '납부 확인 추가' })).toBeDisabled();
    await userEvent.click(dialog.getByRole('button', { name: '납부 확인 취소' }));
    await expect(dialog.queryByRole('spinbutton', { name: '실제 납부액' })).toBeNull();
    await expect(dialog.getByRole('button', { name: '납부 확인 추가' })).toBeEnabled();
  },
};
export const UncertainSave: Story = {
  name: '저장 결과 미확인과 재확인 안내',
  parameters: {
    apiRoutes: [
      {
        path: '/api/plans',
        method: 'POST',
        status: 503,
        response: { error: '저장 결과를 확인하지 못했어요.', code: 'UNAVAILABLE' },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '예산 추가' }));
    const dialog = within(canvas.getByRole('dialog', { name: '예산 추가' }));
    await userEvent.type(dialog.getByRole('textbox', { name: '계획 이름' }), '확인 중 예산');
    await userEvent.click(dialog.getByRole('button', { name: '계획 저장' }));
    await expect(dialog.getByRole('button', { name: '저장 결과 다시 확인' })).toBeEnabled();
    await expect(dialog.getByRole('textbox', { name: '계획 이름' })).toHaveValue('확인 중 예산');
    await expect(dialog.getByRole('textbox', { name: '계획 이름' })).toBeDisabled();
    for (const close of dialog.getAllByRole('button', { name: '닫기' }))
      await expect(close).toBeDisabled();
  },
};
