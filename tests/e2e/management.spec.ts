import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Bootstrap } from '../../src/shared/types';

async function login(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '나로 시작하기' }).click();
  await expect(page.getByRole('heading', { name: '우리의 일상' })).toBeVisible();
  await page.getByLabel('조회 월').fill('2026-09');
}
async function snapshot(page: Page): Promise<Bootstrap> {
  const response = await page.request.get('/api/bootstrap');
  expect(response.status()).toBe(200);
  return response.json();
}
async function save(page: Page, button = '저장') {
  const form = page.getByRole('dialog');
  await form.getByRole('button', { name: button, exact: true }).click();
  await expect(form).not.toBeVisible();
}
async function transaction(
  page: Page,
  name: string,
  amount: string,
  income = false,
  paymentId?: string,
  food = false,
  date = '2026-09-04',
) {
  await page.getByRole('button', { name: '내역 추가', exact: true }).click();
  const form = page.getByRole('dialog');
  if (income) await form.getByRole('button', { name: '수입', exact: true }).click();
  await form.getByLabel('내용', { exact: true }).fill(name);
  await form.getByLabel('금액', { exact: true }).fill(amount);
  await form.getByLabel('날짜', { exact: true }).fill(date);
  if (paymentId)
    await form.getByRole('combobox', { name: '결제수단', exact: true }).selectOption(paymentId);
  if (food) {
    await form.getByRole('button', { name: '분류 선택', exact: true }).click();
    await form.getByRole('option', { name: '식비', exact: true }).click();
  }
  await save(page);
}
function planCard(page: Page, name: string) {
  return page
    .locator('.planning-card')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
}
async function newPlan(page: Page, tab: string, name: string, amount: string): Promise<Locator> {
  await page.locator('.planning-tabs').getByRole('button', { name: tab, exact: true }).click();
  await page.getByRole('button', { name: `${tab} 추가`, exact: true }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('계획 이름', { exact: true }).fill(name);
  await form
    .getByLabel(
      tab === '월급 배분'
        ? '급여 원금액'
        : tab === '결제 일정'
          ? '회당 결제 예정액'
          : tab === '목표'
            ? '목표 금액'
            : '예산 금액',
      { exact: true },
    )
    .fill(amount);
  return form;
}

test('users create, edit, archive and restore their own accounts and cards with accurate billing', async ({
  page,
}) => {
  await login(page);
  const before = await snapshot(page);
  await page.getByRole('button', { name: '카드 · 통장', exact: true }).click();
  await page.getByRole('button', { name: '통장 추가', exact: true }).click();
  let form = page.getByRole('dialog');
  await form.getByLabel('통장 이름', { exact: true }).fill('관리 검증 통장');
  await form.getByLabel('은행', { exact: true }).fill('검증은행');
  await form.getByLabel('통장 종류', { exact: true }).fill('입출금');
  await form.getByLabel('계좌번호', { exact: true }).fill('000-000-0000');
  await form.getByRole('combobox', { name: '연결 자산', exact: true }).selectOption('checking');
  await save(page);
  const account = (await snapshot(page)).paymentMethods.find((p) => p.name === '관리 검증 통장')!;
  expect(account).toMatchObject({
    institution: '검증은행',
    accountKind: '입출금',
    assetId: 'checking',
  });
  await page.getByRole('button', { name: '관리 검증 통장 설정', exact: true }).click();
  form = page.getByRole('dialog');
  await form.getByLabel('용도', { exact: true }).fill('공동 생활비');
  await save(page);
  const accountView = page
    .locator('.payment-account')
    .filter({ has: page.getByRole('heading', { name: '관리 검증 통장', exact: true }) });
  const accountDetails = accountView
    .locator('details')
    .filter({ has: page.locator('summary').filter({ hasText: '통장 · 현금 상세' }) });
  await accountDetails.locator('summary').click();
  await expect(accountDetails.getByText('검증은행', { exact: true })).toBeVisible();
  await expect(accountDetails.getByText('공동 생활비', { exact: true })).toBeVisible();
  await expect(accountDetails.getByText('생활 통장', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '카드 추가', exact: true }).click();
  form = page.getByRole('dialog');
  await form.getByLabel('카드 이름', { exact: true }).fill('관리 검증 카드');
  await form.getByLabel('카드사', { exact: true }).fill('검증카드');
  await form.getByLabel('사용 마감일', { exact: true }).fill('31');
  await form.getByLabel('대금 납부일', { exact: true }).fill('15');
  await form.getByRole('combobox', { name: '결제 통장', exact: true }).selectOption(account.id);
  await form.getByLabel('월 사용 예산 (원)', { exact: true }).fill('300000');
  await form.getByLabel('연회비 (원)', { exact: true }).fill('12000');
  await form.getByLabel('혜택 · 실적 제외 조건', { exact: true }).fill('대중교통 혜택 기록');
  await mkdir('output/playwright', { recursive: true });
  await form.screenshot({ path: 'output/playwright/payment-editor.png' });
  await save(page);
  const card = (await snapshot(page)).paymentMethods.find((p) => p.name === '관리 검증 카드')!;
  expect(card).toMatchObject({ linkedAccountId: account.id, annualFee: 12000 });
  const configured = await snapshot(page);
  expect(configured.transactions).toEqual(before.transactions);
  expect(configured.assetMovements).toEqual(before.assetMovements);
  await page.getByRole('button', { name: '가계부', exact: true }).click();
  await transaction(page, '관리 검증 카드 사용', '26400', false, card.id);
  await page.getByRole('button', { name: '카드 · 통장', exact: true }).click();
  await page.getByLabel('조회 월').fill('2026-10');
  const cardView = page.locator('.payment-card').filter({ hasText: '관리 검증 카드' });
  await expect(cardView.locator('.bill-amount')).toHaveText('26,400원');
  await expect(cardView).toContainText('2026-10-15');
  await expect(cardView).toContainText('관리 검증 통장');
  const cardDetails = cardView
    .locator('details')
    .filter({ has: page.locator('summary').filter({ hasText: '카드 상세 · 혜택' }) });
  await cardDetails.locator('summary').click();
  await expect(cardDetails.getByText('대중교통 혜택 기록', { exact: true })).toBeVisible();
  await expect(cardDetails.getByText('12,000원', { exact: true })).toBeVisible();
  await expect(cardDetails.getByText('2026-09-01 ~ 2026-09-30', { exact: true })).toBeVisible();
  const cardUsage = cardView
    .locator('details')
    .filter({ has: page.locator('summary').filter({ hasText: '청구 기간 사용 내역' }) });
  await cardUsage.locator('summary').click();
  await expect(cardUsage.getByText('관리 검증 카드 사용', { exact: false })).toBeVisible();
  for (const name of ['관리 검증 카드', '관리 검증 통장']) {
    await page.getByRole('button', { name: `${name} 설정`, exact: true }).click();
    await page.getByRole('dialog').getByLabel('보관하기 (기존 거래와 연결은 유지)').check();
    await save(page);
    await expect(page.getByRole('button', { name: `${name} 설정`, exact: true })).toHaveCount(0);
  }
  await page.getByLabel('보관 항목 포함').check();
  for (const name of ['관리 검증 통장', '관리 검증 카드']) {
    await page.getByRole('button', { name: `${name} 설정`, exact: true }).click();
    await page.getByRole('dialog').getByLabel('보관하기 (기존 거래와 연결은 유지)').uncheck();
    await save(page);
  }
  await page.reload();
  const final = await snapshot(page);
  expect(final.paymentMethods.find((p) => p.id === card.id)).toMatchObject({
    archived: false,
    linkedAccountId: account.id,
  });
  expect(final.paymentMethods.find((p) => p.id === account.id)).toMatchObject({
    archived: false,
    purpose: '공동 생활비',
  });
  expect(final.transactions.filter((t) => t.description === '관리 검증 카드 사용')).toHaveLength(1);
});

test('a purpose ledger supports monthly/category/weekly budgets, goals, payroll, events and manual schedules', async ({
  page,
}) => {
  test.setTimeout(90000);
  await login(page);
  await page.getByRole('button', { name: '목적 가계부 추가' }).click();
  await page.getByLabel('가계부 이름', { exact: true }).fill('계획 검증 가계부');
  await page.getByLabel('전체 예산 (원)', { exact: true }).fill('900000');
  await page.getByRole('button', { name: '가계부 만들기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '계획 검증 가계부' })).toBeVisible();
  await transaction(page, '계획 검증 식비', '20000', false, 'cash', true);
  await transaction(page, '계획 검증 급여', '120000', true, 'cash');
  await transaction(page, '계획 검증 이전 월 지출', '7000', false, 'cash', false, '2026-08-04');
  const before = await snapshot(page);
  await page.getByRole('button', { name: '계획 · 일정', exact: true }).click();
  let form = await newPlan(page, '예산', '검증 월 예산', '100000');
  await save(page, '계획 저장');
  await expect(planCard(page, '검증 월 예산')).toContainText('남은 예산 80,000원');
  const budgetDetails = planCard(page, '검증 월 예산')
    .locator('details')
    .filter({ has: page.locator('summary').filter({ hasText: '주차별 사용액과 거래' }) });
  await budgetDetails.locator('summary').click();
  await expect(budgetDetails.getByText('20,000원', { exact: true })).toBeVisible();
  const budgetTransactions = planCard(page, '검증 월 예산')
    .locator('details')
    .filter({ has: page.locator('summary').filter({ hasText: '집계한 원본 거래 보기' }) });
  await budgetTransactions.locator('summary').click();
  await expect(budgetTransactions.getByText('계획 검증 식비', { exact: false })).toBeVisible();
  form = await newPlan(page, '예산', '검증 주 예산', '30000');
  await form.getByRole('combobox', { name: '예산 기간', exact: true }).selectOption('week');
  await form.getByLabel('종료일', { exact: true }).fill('2026-09-07');
  await save(page, '계획 저장');
  await expect(planCard(page, '검증 주 예산')).toContainText('남은 예산 10,000원');
  form = await newPlan(page, '예산', '검증 식비 예산', '25000');
  await form.getByRole('combobox', { name: '예산 범위', exact: true }).selectOption('category');
  await form.getByLabel('식비', { exact: true }).check();
  await save(page, '계획 저장');
  await expect(planCard(page, '검증 식비 예산')).toContainText('남은 예산 5,000원');
  await planCard(page, '검증 월 예산').getByRole('button', { name: '검증 월 예산 수정' }).click();
  await page.getByRole('dialog').getByLabel('예산 금액', { exact: true }).fill('110000');
  await save(page, '계획 저장');
  await expect(planCard(page, '검증 월 예산')).toContainText('남은 예산 90,000원');
  form = await newPlan(page, '목표', '검증 수입 목표', '100000');
  await save(page, '계획 저장');
  await expect(planCard(page, '검증 수입 목표')).toContainText('기준 충족 · 120.0%');
  await planCard(page, '검증 수입 목표')
    .getByRole('button', { name: '검증 수입 목표 수정' })
    .click();
  await page
    .getByRole('dialog')
    .getByLabel(/이 계획 보관하기/)
    .check();
  await save(page, '계획 저장');
  await expect(planCard(page, '검증 수입 목표')).toHaveCount(0);
  await page.getByLabel('보관한 계획 포함').check();
  await planCard(page, '검증 수입 목표')
    .getByRole('button', { name: '검증 수입 목표 수정' })
    .click();
  await page
    .getByRole('dialog')
    .getByLabel(/이 계획 보관하기/)
    .uncheck();
  await save(page, '계획 저장');
  await expect(planCard(page, '검증 수입 목표')).toContainText('기준 충족 · 120.0%');
  form = await newPlan(page, '월급 배분', '검증 급여 배분', '123456');
  await form.getByRole('button', { name: '배분 항목 추가', exact: true }).click();
  await form.getByLabel('1. 배분 항목', { exact: true }).fill('생활비');
  await form.getByLabel('배분 금액', { exact: true }).fill('23456');
  await form
    .getByRole('combobox', { name: '배분 금액 계산', exact: true })
    .selectOption('ceil10000');
  await expect(form).toContainText('잔여금 90,000원');
  await save(page, '계획 저장');
  await expect(planCard(page, '검증 급여 배분')).toContainText('90,000원');
  await expect(planCard(page, '검증 급여 배분')).toContainText('조건에 맞는 실제 수입120,000원');
  form = await newPlan(page, '행사', '검증 가족 행사', '50000');
  await form.getByRole('combobox', { name: '실적 기록 방식', exact: true }).selectOption('manual');
  await form.getByLabel('행사 실제 금액', { exact: true }).fill('35000');
  await form.getByLabel('결산·평가', { exact: true }).fill('예산보다 1만 5천 원 절약');
  await save(page, '계획 저장');
  await expect(planCard(page, '검증 가족 행사')).toContainText('남은 예산 15,000원');
  form = await newPlan(page, '결제 일정', '검증 보험 일정', '45000');
  await form.getByRole('combobox', { name: '결제 반복', exact: true }).selectOption('monthly');
  await form.getByLabel('시작일', { exact: true }).fill('2026-09-15');
  await form.getByLabel('마지막 결제일', { exact: true }).fill('2026-12-15');
  await form.getByRole('button', { name: '납부 확인 추가', exact: true }).click();
  await form.getByLabel('실제 납부일', { exact: true }).fill('2026-09-15');
  await form.getByLabel('실제 납부액', { exact: true }).fill('44000');
  await save(page, '계획 저장');
  await expect(planCard(page, '검증 보험 일정')).toContainText('44,000원 납부 확인');
  await page.getByRole('button', { name: '알림 닫기', exact: true }).click();
  await mkdir('output/playwright', { recursive: true });
  await page.screenshot({ path: 'output/playwright/planning-desktop.png', fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.screenshot({ path: 'output/playwright/planning-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const after = await snapshot(page);
  const ledger = after.ledgers.find((l) => l.name === '계획 검증 가계부')!;
  expect(after.plans?.filter((p) => p.ledgerId === ledger.id)).toHaveLength(7);
  expect(after.transactions).toEqual(before.transactions);
  expect(after.assetMovements).toEqual(before.assetMovements);
  await page.getByRole('button', { name: '가계부', exact: true }).click();
  await expect(page.locator('.budget-panel')).toContainText('110,000원');
  await expect(page.locator('.stats-grid').first().locator('.stat').last()).toContainText(
    '90,000원',
  );
});

test('loan terms and date-based asset adjustments preserve historical month-end balances', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('button', { name: '자산', exact: true }).click();
  await page.getByRole('button', { name: '자산 추가', exact: true }).click();
  let form = page.getByRole('dialog');
  await form.getByLabel('자산 이름', { exact: true }).fill('검증 대출');
  await form.getByRole('combobox', { name: '종류', exact: true }).selectOption('liability');
  await form.getByLabel('금융기관', { exact: true }).fill('검증은행');
  await form.getByLabel(/^최초 잔액 기준일/).fill('2026-08-01');
  await form.getByRole('spinbutton', { name: /^최초 잔액/ }).fill('500000');
  await form.getByLabel('최초 원금', { exact: true }).fill('500000');
  await form.getByLabel('금리 (%)', { exact: true }).fill('3.75');
  await form.getByLabel('금리 종류', { exact: true }).fill('고정');
  await form.getByLabel('매월 납입일', { exact: true }).fill('15');
  await form.getByLabel('월 납입액', { exact: true }).fill('50000');
  await form.getByLabel('상환 방식', { exact: true }).fill('원금 균등');
  await mkdir('output/playwright', { recursive: true });
  await form.screenshot({ path: 'output/playwright/asset-editor.png' });
  await save(page);
  const created = (await snapshot(page)).assets.find((a) => a.name === '검증 대출')!;
  expect(created.details).toMatchObject({
    institution: '검증은행',
    principal: 500000,
    rate: 3.75,
    repaymentMethod: '원금 균등',
  });
  await expect(page.getByTestId(`asset-${created.id}`)).toHaveText('500,000원');
  const card = page
    .locator('.asset-card')
    .filter({ has: page.getByRole('heading', { name: '검증 대출 부채' }) });
  await card.locator('summary').filter({ hasText: '관리 정보 보기' }).click();
  await expect(card.getByText('3.75% 고정', { exact: true })).toBeVisible();
  await expect(card.getByText('원금 균등', { exact: true })).toBeVisible();
  const monthDetails = page.locator('.asset-table-details');
  await monthDetails.locator('summary').filter({ hasText: '월별 금액 자세히 보기' }).click();
  await expect(monthDetails.getByRole('table')).toBeVisible();
  await expect(monthDetails.getByRole('row').filter({ hasText: '2026-08' })).toHaveCount(1);
  await card.getByRole('button', { name: /잔액/ }).click();
  form = page.getByRole('dialog');
  await form.getByLabel('맞출 잔액', { exact: true }).fill('450000');
  await form.getByLabel('날짜', { exact: true }).fill('2026-09-15');
  await form.getByLabel('조정 사유', { exact: true }).fill('9월 대출 잔액 확인');
  const before = await snapshot(page);
  await save(page);
  await expect(page.getByTestId(`asset-${created.id}`)).toHaveText('450,000원');
  await page.getByLabel('조회 월').fill('2026-08');
  await expect(page.getByTestId(`asset-${created.id}`)).toHaveText('500,000원');
  await page.getByLabel('조회 월').fill('2026-09');
  await page.getByRole('button', { name: '검증 대출 설정', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('대출 조건', { exact: true })
    .fill('우대 조건 확인 필요');
  await save(page);
  const after = await snapshot(page);
  expect(after.transactions).toEqual(before.transactions);
  expect(after.assets.find((a) => a.id === created.id)?.details?.conditions).toBe(
    '우대 조건 확인 필요',
  );
  expect(after.assetMovements.find((m) => m.assetId === created.id)?.amount).toBe(-50000);
});
