import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import PaymentsView from '../../client/PaymentsView';
import { makeStoryBootstrap, STORY_MONTH } from '../fixtures';

function paymentData() {
  const data = makeStoryBootstrap({
    assets: [
      {
        id: 'sb-bank-asset',
        name: '공동 생활 잔액',
        kind: 'asset',
        openingBalance: 900000,
        balance: 900000,
        color: '#64866f',
        tagIds: [],
        trackSavings: false,
        version: 1,
        openingDate: '2026-01-01',
      },
    ],
    paymentMethods: [
      {
        id: 'sb-card',
        name: '가족 신용카드',
        type: 'card',
        cardKind: 'credit',
        ownerId: 'shared',
        closingDay: 20,
        paymentDay: 10,
        institution: '예시 카드사',
        monthlyBudget: 500000,
        performanceTarget: 300000,
        creditLimit: 1000000,
        annualFee: 10000,
        linkedAccountId: 'sb-account',
        benefits: '합성 혜택 메모',
        version: 1,
      },
      {
        id: 'sb-debit',
        name: '교통 체크카드',
        type: 'card',
        cardKind: 'debit',
        ownerId: 'u2',
        closingDay: null,
        paymentDay: null,
        institution: '예시 은행',
        version: 1,
      },
      {
        id: 'sb-account',
        name: '생활 통장',
        type: 'account',
        ownerId: 'shared',
        closingDay: null,
        paymentDay: null,
        institution: '예시 은행',
        accountKind: '입출금',
        assetId: 'sb-bank-asset',
        accountNumber: '000-123456-7890',
        purpose: '공동 생활비',
        version: 1,
      },
      {
        id: 'sb-cash',
        name: '지갑 현금',
        type: 'cash',
        ownerId: 'u1',
        closingDay: null,
        paymentDay: null,
        version: 1,
      },
      {
        id: 'sb-archived-card',
        name: '보관한 이전 카드',
        type: 'card',
        ownerId: 'u1',
        closingDay: 15,
        paymentDay: 5,
        archived: true,
        version: 1,
      },
    ],
  });
  data.transactions = data.transactions.map((tx) =>
    tx.id === 'sb-bus'
      ? { ...tx, paymentMethodId: 'sb-debit' }
      : tx.id === 'sb-income'
        ? { ...tx, paymentMethodId: 'sb-account' }
        : tx,
  );
  return data;
}
const meta = {
  title: '06 Screens/PaymentsView',
  component: PaymentsView,
  tags: ['autodocs', 'payments-screen'],
  parameters: {
    layout: 'padded',
    docs: {
      story: { inline: false },
      description: {
        component:
          '실제 카드·통장·현금 화면과 편집기입니다. 카드 사용과 예상 납부 정보를 구분하며 연결 자산의 잔액은 조회만 합니다. 모든 자료는 합성이며 저장 성공/실패는 Storybook 내부 응답으로 검증합니다.',
      },
    },
  },
  args: { data: paymentData(), month: STORY_MONTH, onChanged: fn(async () => {}), onNotice: fn() },
  argTypes: { data: { control: false }, month: { control: 'text' } },
} satisfies Meta<typeof PaymentsView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  name: '카드·통장·현금 전체',
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('heading', { name: '가족 신용카드' })).toBeVisible();
    await expect(c.getByRole('heading', { name: '생활 통장' })).toBeVisible();
    await expect(c.getByText('연결 자산의 현재 잔액')).toBeVisible();
  },
};
export const Empty: Story = {
  name: '결제수단 첫 등록',
  args: { data: makeStoryBootstrap({ paymentMethods: [] }) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(
      c.getByText('등록된 카드가 없어요. 카드 추가에서 결제일과 혜택을 설정해 보세요.'),
    ).toBeVisible();
    await expect(c.getByRole('button', { name: '통장 추가' })).toBeEnabled();
  },
};
export const Search: Story = {
  name: '기관·이름 검색과 공백 처리',
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByRole('searchbox', { name: '결제수단 검색' }), '  교통  ');
    await expect(c.getByRole('heading', { name: '교통 체크카드' })).toBeVisible();
    await expect(c.queryByRole('heading', { name: '가족 신용카드' })).toBeNull();
  },
};
export const NoSearchResults: Story = {
  name: '검색 결과 없음',
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByRole('searchbox', { name: '결제수단 검색' }), '없는 금융기관');
    await expect(
      c.getByText('검색 조건에 맞는 카드가 없어요. 다른 이름이나 기관으로 검색해 보세요.'),
    ).toBeVisible();
  },
};
export const Archived: Story = {
  name: '보관 항목 포함',
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.queryByRole('button', { name: '보관한 이전 카드 설정' })).toBeNull();
    await userEvent.click(c.getByRole('checkbox', { name: '보관 항목 포함' }));
    await expect(c.getByRole('button', { name: '보관한 이전 카드 설정' })).toBeVisible();
  },
};
export const IncompleteBilling: Story = {
  name: '납부일 미설정 안내',
  args: {
    data: (() => {
      const data = paymentData();
      data.paymentMethods[0].closingDay = null;
      return data;
    })(),
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByText('마감일과 납부일을 설정하면 예상 대금이 보여요.')).toBeVisible();
    await expect(c.getByRole('heading', { name: '설정된 카드의 예상 대금' })).toBeVisible();
  },
};
export const AccountPrivacy: Story = {
  name: '통장 상세의 계좌번호 마스킹',
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const heading = c.getByRole('heading', { name: '생활 통장' });
    const panel = within(heading.closest('section')!);
    await userEvent.click(panel.getByText('통장 · 현금 상세', { exact: true }));
    await expect(panel.getByText('•••••••• 7890')).toBeVisible();
    await expect(panel.queryByText('000-123456-7890')).toBeNull();
  },
};
export const AddValidation: Story = {
  name: '필수 이름 검증과 취소',
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement),
      page = within(canvasElement.ownerDocument.body);
    await userEvent.click(c.getByRole('button', { name: '카드 추가' }));
    const modal = within(page.getByRole('dialog', { name: '카드 추가' }));
    await userEvent.click(modal.getByRole('button', { name: '저장' }));
    await expect(modal.getByRole('textbox', { name: '카드 이름' })).toBeInvalid();
    await expect(modal.getByRole('alert')).toBeVisible();
    await userEvent.click(modal.getAllByRole('button', { name: '닫기' }).at(-1)!);
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
    await expect(args.onChanged).not.toHaveBeenCalled();
  },
};
export const DebitEditor: Story = {
  name: '체크카드 편집의 결제 항목',
  play: async ({ canvasElement }) => {
    const c = within(canvasElement),
      page = within(canvasElement.ownerDocument.body);
    await userEvent.click(c.getByRole('button', { name: '교통 체크카드 설정' }));
    const modal = within(page.getByRole('dialog', { name: '카드 설정' }));
    await expect(modal.queryByRole('spinbutton', { name: '사용 마감일' })).toBeNull();
    await expect(modal.getByRole('combobox', { name: '결제 통장' })).toBeVisible();
  },
};
export const DirtyCancel: Story = {
  name: '작성 중 닫기와 입력 보존',
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement),
      page = within(canvasElement.ownerDocument.body);
    await userEvent.click(c.getByRole('button', { name: '현금 추가' }));
    const modal = within(page.getByRole('dialog', { name: '현금 추가' }));
    await userEvent.type(modal.getByRole('textbox', { name: '현금 이름' }), '새 지갑');
    await userEvent.click(modal.getAllByRole('button', { name: '닫기' }).at(-1)!);
    await userEvent.click(page.getByRole('button', { name: '계속 작성' }));
    await expect(modal.getByRole('textbox', { name: '현금 이름' })).toHaveValue('새 지갑');
    await userEvent.click(modal.getAllByRole('button', { name: '닫기' }).at(-1)!);
    await userEvent.click(page.getByRole('button', { name: '변경 내용 버리기' }));
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
    await expect(c.getByRole('button', { name: '현금 추가' })).toHaveFocus();
    await expect(args.onChanged).not.toHaveBeenCalled();
  },
};
export const SaveSuccess: Story = {
  name: '현금 추가 저장 성공',
  parameters: {
    apiRoutes: [{ path: '/api/payment-methods', method: 'POST', response: { revision: 2 } }],
  },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement),
      page = within(canvasElement.ownerDocument.body);
    await userEvent.click(c.getByRole('button', { name: '현금 추가' }));
    const modal = within(page.getByRole('dialog', { name: '현금 추가' }));
    await userEvent.type(modal.getByRole('textbox', { name: '현금 이름' }), '새 지갑');
    await userEvent.click(modal.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
    await expect(args.onNotice).toHaveBeenCalledWith('결제수단을 저장했어요.');
    await expect(args.onChanged).toHaveBeenCalledOnce();
  },
};
export const SaveError: Story = {
  name: '저장 오류와 입력 보존',
  parameters: {
    apiRoutes: [
      {
        path: '/api/payment-methods',
        method: 'POST',
        status: 400,
        response: { error: '예시 이름을 확인해 주세요.', code: 'VALIDATION' },
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement),
      page = within(canvasElement.ownerDocument.body);
    await userEvent.click(c.getByRole('button', { name: '현금 추가' }));
    const modal = within(page.getByRole('dialog', { name: '현금 추가' }));
    await userEvent.type(modal.getByRole('textbox', { name: '현금 이름' }), '새 지갑');
    await userEvent.click(modal.getByRole('button', { name: '저장' }));
    await expect(await modal.findByRole('alert')).toHaveTextContent('예시 이름을 확인해 주세요.');
    await expect(modal.getByRole('textbox', { name: '현금 이름' })).toHaveValue('새 지갑');
    await expect(args.onChanged).not.toHaveBeenCalled();
  },
};
export const ConflictReload: Story = {
  name: '동시 변경 충돌 후 최신 설정',
  parameters: {
    apiRoutes: [
      {
        path: '/api/payment-methods/sb-card',
        method: 'PATCH',
        status: 409,
        response: { error: '다른 사람이 변경했어요.', code: 'CONFLICT' },
      },
      { path: '/api/bootstrap', response: paymentData() },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement),
      page = within(canvasElement.ownerDocument.body);
    await userEvent.click(c.getByRole('button', { name: '가족 신용카드 설정' }));
    const modal = within(page.getByRole('dialog', { name: '카드 설정' }));
    await userEvent.click(modal.getByRole('button', { name: '저장' }));
    await expect(await modal.findByText('다른 변경이 먼저 반영되었어요.')).toBeVisible();
    await expect(modal.getByRole('button', { name: '저장' })).toBeDisabled();
    await userEvent.click(modal.getByRole('button', { name: '최신 설정 불러오기' }));
    await waitFor(() => expect(modal.queryByText('다른 변경이 먼저 반영되었어요.')).toBeNull());
    await expect(modal.getByRole('button', { name: '저장' })).toBeEnabled();
    await expect(args.onChanged).toHaveBeenCalledTimes(2);
  },
};
export const LongNamesMobile: Story = {
  name: '긴 금융기관명·혜택 · 모바일',
  globals: { viewport: { value: 'mobile390', isRotated: false } },
  args: {
    data: (() => {
      const data = paymentData();
      data.paymentMethods[0].name = '온가족 생활비를 함께 기록하는 아주 긴 이름의 신용카드';
      data.paymentMethods[0].institution = '이름이 길어도 화면을 밀어내지 않는 합성 금융기관';
      data.paymentMethods[2].name = '여러 용도로 사용하는 이름이 긴 우리 공동 통장';
      return data;
    })(),
  },
};
