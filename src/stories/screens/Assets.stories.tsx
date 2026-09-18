import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import AssetsView from '../../client/AssetsView';
import type { Asset, Bootstrap } from '../../shared/types';
import { makeStoryBootstrap, STORY_MONTH } from '../fixtures';

function assetData(): Bootstrap {
  const asset = (overrides: Partial<Asset> & Pick<Asset, 'id' | 'name'>): Asset => ({
    kind: 'asset',
    openingBalance: 1000000,
    balance: 900000,
    color: '#64866f',
    tagIds: ['sb-reserve'],
    trackSavings: false,
    version: 1,
    openingDate: '2026-01-01',
    details: { ownerId: 'shared', institution: '예시 은행', openingKind: 'observation' },
    ...overrides,
  });
  return makeStoryBootstrap({
    assets: [
      asset({ id: 'sb-reserve-asset', name: '생활 예비금' }),
      asset({
        id: 'sb-saving-asset',
        name: '정기 저축',
        openingBalance: 400000,
        balance: 500000,
        tagIds: ['sb-investment'],
        trackSavings: true,
      }),
      asset({
        id: 'sb-loan-asset',
        name: '예시 대출',
        kind: 'liability',
        openingBalance: 500000,
        balance: 500000,
        tagIds: [],
        details: {
          ownerId: 'u1',
          institution: '예시 은행',
          openingKind: 'initial',
          principal: 500000,
          rate: 3.2,
          paymentDay: 20,
          monthlyPayment: 25000,
          notes: '합성 대출 설명',
        },
      }),
      asset({
        id: 'sb-archived-asset',
        name: '보관한 예금',
        openingBalance: 100000,
        balance: 100000,
        archived: true,
      }),
    ],
    assetOperations: [
      {
        id: 'sb-transfer',
        type: 'transfer',
        date: '2026-06-15',
        description: '6월 저축 이동',
        fromAssetId: 'sb-reserve-asset',
        toAssetId: 'sb-saving-asset',
        assetId: null,
        amount: 100000,
        targetBalance: null,
        version: 1,
        createdBy: 'u1',
        createdAt: '2026-06-15T12:00:00.000Z',
        deletedAt: null,
      },
    ],
    assetMovements: [
      {
        id: 'sb-out',
        assetId: 'sb-reserve-asset',
        operationId: 'sb-transfer',
        transactionId: null,
        date: '2026-06-15',
        description: '6월 저축 이동',
        amount: -100000,
        savingsAmount: 0,
        actorId: 'u1',
      },
      {
        id: 'sb-in',
        assetId: 'sb-saving-asset',
        operationId: 'sb-transfer',
        transactionId: null,
        date: '2026-06-15',
        description: '6월 저축 이동',
        amount: 100000,
        savingsAmount: 100000,
        actorId: 'u1',
      },
    ],
  });
}
const meta = {
  title: '06 Screens/AssetsView',
  component: AssetsView,
  tags: ['autodocs', 'assets-screen'],
  parameters: {
    layout: 'padded',
    docs: {
      story: { inline: false },
      description: {
        component:
          '실제 자산 화면과 편집기를 합성 자료로 검증합니다. 최신/월말 잔액, 보관 포함 합계, 저축·이동·조정의 의미를 유지합니다. 저장 예시는 브라우저 내부 API 시나리오를 사용하며 실제 서버·DB에 접속하지 않습니다.',
      },
    },
  },
  args: { data: assetData(), month: STORY_MONTH, onChanged: fn(async () => {}), onNotice: fn() },
  argTypes: { data: { control: false }, month: { control: 'text' } },
} satisfies Meta<typeof AssetsView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  name: '자산·부채·저축·변동 내역',
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByTestId('asset-summary-net')).toHaveTextContent('1,000,000');
    await expect(c.getByText('6월 저축 이동', { exact: true })).toBeVisible();
  },
};
export const Empty: Story = {
  name: '첫 자산 등록',
  args: { data: makeStoryBootstrap({ assets: [], assetOperations: [], assetMovements: [] }) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(
      c.getByText('아직 등록된 자산이 없어요. 통장 잔액부터 추가해 보세요.'),
    ).toBeVisible();
    await expect(c.getByRole('button', { name: '자산 이동' })).toBeDisabled();
    await expect(c.getByText('등록한 자산이 없어 소계를 표시할 수 없어요.')).toBeVisible();
  },
};
export const MonthEnd: Story = {
  name: '월말 조회로 전환',
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '선택 월말' }));
    await expect(c.getByRole('button', { name: '선택 월말' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(c.getAllByText('2026-06-30 기준', { exact: true })[0]).toBeVisible();
  },
};
export const HistoricalUnknown: Story = {
  name: '최초 관측 이전 월말',
  args: { month: '2025-12' },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '선택 월말' }));
    await expect(c.getByRole('heading', { name: '확인된 순자산' })).toBeVisible();
    await expect(c.getByText(/이 시점의 잔액 자료가 없어/)).toBeVisible();
  },
};
export const Archived: Story = {
  name: '보관한 자산 조회',
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.queryByRole('button', { name: '보관한 예금 설정' })).toBeNull();
    await userEvent.click(c.getByRole('checkbox', { name: '보관 항목 보기' }));
    await expect(c.getByRole('button', { name: '보관한 예금 설정' })).toBeVisible();
    await expect(c.getByTestId('asset-summary-net')).toHaveTextContent('1,000,000');
  },
};
export const FilterHistory: Story = {
  name: '자산별 변동 필터',
  play: async ({ canvasElement }) => {
    const c = within(canvasElement),
      page = within(canvasElement.ownerDocument.body);
    await userEvent.click(c.getByRole('combobox', { name: '변동 내역 자산' }));
    await userEvent.click(page.getByRole('option', { name: '예시 대출' }));
    await expect(c.getByText('이 달의 자산 변동이 없어요.')).toBeVisible();
  },
};
export const AddValidation: Story = {
  name: '추가 필수 입력 검증과 닫기',
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement),
      page = within(canvasElement.ownerDocument.body);
    await userEvent.click(c.getByRole('button', { name: '자산 추가' }));
    const modal = within(page.getByRole('dialog', { name: '자산 추가' }));
    await userEvent.click(modal.getByRole('button', { name: '저장' }));
    await expect(modal.getByRole('textbox', { name: '자산 이름' })).toBeInvalid();
    await expect(modal.getByRole('alert')).toBeVisible();
    await userEvent.click(modal.getAllByRole('button', { name: '닫기' }).at(-1)!);
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
    await expect(args.onChanged).not.toHaveBeenCalled();
  },
};
export const TransferEditor: Story = {
  name: '자산 이동의 동일 출발·도착 방지',
  play: async ({ canvasElement }) => {
    const c = within(canvasElement),
      page = within(canvasElement.ownerDocument.body);
    await userEvent.click(c.getByRole('button', { name: '자산 이동' }));
    const modal = within(page.getByRole('dialog', { name: '자산 이동' }));
    await userEvent.click(modal.getByRole('combobox', { name: '보내는 자산' }));
    await userEvent.click(page.getByRole('option', { name: '생활 예비금' }));
    await userEvent.click(modal.getByRole('combobox', { name: '받는 자산' }));
    await expect(page.getByRole('option', { name: '생활 예비금' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
  },
};
export const SaveSuccess: Story = {
  name: '자산 추가 저장 성공',
  parameters: { apiRoutes: [{ path: '/api/assets', method: 'POST', response: { revision: 2 } }] },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement),
      page = within(canvasElement.ownerDocument.body);
    await userEvent.click(c.getByRole('button', { name: '자산 추가' }));
    const modal = within(page.getByRole('dialog', { name: '자산 추가' }));
    await userEvent.type(modal.getByRole('textbox', { name: '자산 이름' }), '새 예금');
    await userEvent.click(modal.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
    await expect(args.onNotice).toHaveBeenCalledWith('자산에 반영했어요.');
    await expect(args.onChanged).toHaveBeenCalledOnce();
  },
};
export const SaveError: Story = {
  name: '저장 실패 시 입력 유지',
  parameters: {
    apiRoutes: [
      {
        path: '/api/assets',
        method: 'POST',
        status: 400,
        response: { error: '예시 입력을 다시 확인해 주세요.', code: 'VALIDATION' },
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement),
      page = within(canvasElement.ownerDocument.body);
    await userEvent.click(c.getByRole('button', { name: '자산 추가' }));
    const modal = within(page.getByRole('dialog', { name: '자산 추가' }));
    await userEvent.type(modal.getByRole('textbox', { name: '자산 이름' }), '입력 유지 예금');
    await userEvent.click(modal.getByRole('button', { name: '저장' }));
    await expect(await modal.findByRole('alert')).toHaveTextContent(
      '예시 입력을 다시 확인해 주세요.',
    );
    await expect(modal.getByRole('textbox', { name: '자산 이름' })).toHaveValue('입력 유지 예금');
    await expect(args.onNotice).not.toHaveBeenCalled();
  },
};
export const LongNamesMobile: Story = {
  name: '긴 자산명·메모 · 모바일',
  globals: { viewport: { value: 'mobile390', isRotated: false } },
  args: {
    data: (() => {
      const data = assetData();
      data.assets[0].name = '가족과 함께 관리하는 아주 긴 이름의 생활 예비금 계좌';
      data.assets[0].details!.notes =
        '긴 메모와 금융기관명을 입력해도 카드와 설정 버튼이 서로 겹치지 않아야 합니다. '.repeat(4);
      return data;
    })(),
  },
};

export const DebtEditor: Story = {
  name: '부채 상세 편집',
  play: async ({ canvasElement }) => {
    const c = within(canvasElement),
      page = within(canvasElement.ownerDocument.body);
    await userEvent.click(c.getByRole('button', { name: '예시 대출 설정' }));
    const modal = within(page.getByRole('dialog', { name: '자산 설정' }));
    await expect(modal.getByRole('spinbutton', { name: '최초 원금' })).toHaveValue(500000);
    await expect(modal.getByRole('spinbutton', { name: '금리 (%)' })).toHaveValue(3.2);
    await expect(modal.getByRole('textbox', { name: '관리 메모' })).toHaveValue('합성 대출 설명');
  },
};
export const AdjustmentEditor: Story = {
  name: '현재 잔액 맞추기 미리보기',
  play: async ({ canvasElement }) => {
    const c = within(canvasElement),
      page = within(canvasElement.ownerDocument.body);
    const card = within(c.getByRole('button', { name: '생활 예비금 설정' }).closest('section')!);
    await userEvent.click(card.getByRole('button', { name: '현재 잔액 맞추기' }));
    const modal = within(page.getByRole('dialog', { name: '현재 잔액 맞추기' }));
    await expect(modal.getByRole('spinbutton', { name: '맞출 잔액' })).toHaveValue(900000);
    await expect(modal.getByText('조정액 0원')).toBeVisible();
  },
};
export const DirtyCancel: Story = {
  name: '자산 작성 중 닫기 확인',
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement),
      page = within(canvasElement.ownerDocument.body);
    await userEvent.click(c.getByRole('button', { name: '자산 추가' }));
    const modal = within(page.getByRole('dialog', { name: '자산 추가' }));
    await userEvent.type(
      modal.getByRole('textbox', { name: '자산 이름' }),
      '아직 저장하지 않은 예금',
    );
    await userEvent.click(modal.getAllByRole('button', { name: '닫기' }).at(-1)!);
    await userEvent.click(page.getByRole('button', { name: '계속 작성' }));
    await expect(modal.getByRole('textbox', { name: '자산 이름' })).toHaveValue(
      '아직 저장하지 않은 예금',
    );
    await expect(args.onChanged).not.toHaveBeenCalled();
  },
};

export const ConflictReload: Story = {
  name: '동시 변경 후 최신 자산은 수정 없음으로 닫기',
  parameters: {
    apiRoutes: [
      {
        path: '/api/assets/sb-reserve-asset',
        method: 'PATCH',
        status: 409,
        response: { error: '다른 사람이 자산 설정을 바꿨어요.', code: 'CONFLICT' },
      },
      {
        path: '/api/bootstrap',
        response: (() => {
          const data = assetData();
          data.assets[0].name = '함께 바꾼 예비금';
          data.assets[0].version = 2;
          return data;
        })(),
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement),
      page = within(canvasElement.ownerDocument.body);
    await userEvent.click(c.getByRole('button', { name: '생활 예비금 설정' }));
    const modal = within(page.getByRole('dialog', { name: '자산 설정' }));
    await userEvent.click(modal.getByRole('button', { name: '저장' }));
    await expect(await modal.findByText('다른 변경이 먼저 반영되었어요.')).toBeVisible();
    await userEvent.click(modal.getByRole('button', { name: '최신 자산 불러오기' }));
    await waitFor(() =>
      expect(modal.getByRole('textbox', { name: '자산 이름' })).toHaveValue('함께 바꾼 예비금'),
    );
    await userEvent.click(modal.getAllByRole('button', { name: '닫기' }).at(-1)!);
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
    await expect(args.onChanged).toHaveBeenCalledTimes(2);
    await expect(args.onNotice).not.toHaveBeenCalled();
  },
};
