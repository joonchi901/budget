import { openRoom } from './helpers/navigation';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Bootstrap } from '../../src/shared/types';
import { chooseDate, chooseMonth, selectChoice } from './helpers/controls';

async function login(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /나로 시작하기/ }).click();
  await openRoom(page);
  await expect(page.getByRole('heading', { name: '우리의 일상', exact: true })).toBeVisible();
  await chooseMonth(page.getByLabel('조회 월'), '2026-09');
  await expect(page.getByTestId('connection')).toHaveText('실시간 연결됨');
}

async function openNew(page: Page) {
  await page.getByRole('button', { name: '내역 추가', exact: true }).click();
  return page.getByRole('dialog', { name: '새 내역', exact: true });
}

async function fill(form: Locator, description: string, amount: string) {
  await form.getByLabel('금액', { exact: true }).fill(amount);
  await form.getByLabel('내용', { exact: true }).fill(description);
}

async function snapshot(page: Page): Promise<Bootstrap> {
  const response = await page.request.get('/api/bootstrap');
  expect(response.ok()).toBe(true);
  return response.json();
}

test('save and continue keeps classification and date but starts a distinct unallocated entry', async ({
  page,
}) => {
  await login(page);
  const form = await openNew(page);
  await expect(form.getByRole('button', { name: /자산 잔액 반영/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await fill(form, '연속 입력 첫 기록', '12000');
  await chooseDate(form.getByLabel('날짜', { exact: true }), '2026-09-21');
  await selectChoice(form.getByRole('combobox', { name: '결제수단', exact: true }), 'cash');
  await selectChoice(form.getByRole('combobox', { name: '누구의 내역인가요?', exact: true }), 'u1');
  await form.getByRole('button', { name: '상세 태그 선택', exact: true }).click();
  await form.getByRole('option', { name: '여행', exact: true }).click();
  await form.getByRole('button', { name: '옵션 선택 닫기', exact: true }).click();
  await form.getByRole('button', { name: '자산 배분 추가', exact: true }).click();
  await selectChoice(form.getByRole('combobox', { name: '출금 자산 1', exact: true }), 'checking');
  await form.getByRole('button', { name: '저장하고 계속 입력', exact: true }).click();
  await expect(form.getByTestId('transaction-save-status')).toHaveText(
    '저장했어요. 다음 내역의 금액과 내용을 입력해 주세요.',
  );
  await expect(form.getByLabel('금액', { exact: true })).toHaveValue('');
  await expect(form.getByLabel('금액', { exact: true })).toBeFocused();
  await expect(form.getByLabel('내용', { exact: true })).toHaveValue('');
  await expect(
    form.getByLabel('날짜', { exact: true }).and(page.locator('button')),
  ).toHaveAttribute('data-value', '2026-09-21');
  await expect(form.getByRole('combobox', { name: '결제수단', exact: true })).toHaveAttribute(
    'data-value',
    'cash',
  );
  await expect(
    form.getByRole('combobox', { name: '누구의 내역인가요?', exact: true }),
  ).toHaveAttribute('data-value', 'u1');
  await expect(form.getByRole('button', { name: '상세 태그 선택', exact: true })).toContainText(
    '여행',
  );
  await expect(form.getByRole('button', { name: /자산 잔액 반영/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(form.getByLabel('배분 금액 1', { exact: true })).toHaveCount(0);
  await fill(form, '연속 입력 다음 기록', '3000');
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(form).not.toBeVisible();
  const rows = (await snapshot(page)).transactions.filter((row) =>
    row.description.startsWith('연속 입력 '),
  );
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((row) => row.id)).size).toBe(2);
  const first = rows.find((row) => row.description === '연속 입력 첫 기록')!;
  const next = rows.find((row) => row.description === '연속 입력 다음 기록')!;
  expect(first.allocations).toEqual([{ assetId: 'checking', amount: 12000 }]);
  expect(next).toMatchObject({
    date: first.date,
    ownerId: first.ownerId,
    paymentMethodId: first.paymentMethodId,
    tagIds: first.tagIds,
    allocations: [],
    version: 1,
  });
});

test('save and continue restores an uncertain operation and confirms it once after reload', async ({
  page,
}) => {
  await login(page);
  const mutations: string[] = [];
  let dropped = false;
  await page.route('**/api/transactions', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    mutations.push(route.request().postDataJSON().mutationId);
    if (!dropped) {
      dropped = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  let form = await openNew(page);
  await fill(form, '연속 입력 응답 유실', '5400');
  await form.getByRole('button', { name: '저장하고 계속 입력', exact: true }).click();
  await expect(form.getByRole('button', { name: '저장 결과 다시 확인' })).toBeVisible();
  page.on('dialog', (dialog) => void dialog.accept());
  await page.reload();
  form = await openNew(page);
  await expect(form.getByText('이 기기의 초안을 복원했어요.', { exact: true })).toBeVisible();
  await form.getByRole('button', { name: '저장 결과 다시 확인' }).click();
  await expect(form.getByLabel('내용', { exact: true })).toHaveValue('');
  await expect(form.getByRole('button', { name: '저장하고 계속 입력', exact: true })).toBeVisible();
  expect(mutations).toHaveLength(2);
  expect(new Set(mutations).size).toBe(1);
  expect(
    (await snapshot(page)).transactions.filter((row) => row.description === '연속 입력 응답 유실'),
  ).toHaveLength(1);
});

test('mobile entry exposes invalid asset allocation and keeps actions within the dialog', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await login(page);
  const form = await openNew(page);
  await fill(form, '자산 배분 유효성 확인', '9000');
  await form.getByRole('button', { name: '자산 배분 추가', exact: true }).click();
  const disclosure = form.getByRole('button', { name: /자산 잔액 반영/ });
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await form.getByRole('button', { name: '저장하고 계속 입력', exact: true }).click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  await expect(form.getByRole('combobox', { name: '출금 자산 1', exact: true })).toBeVisible();
  await expect(form.getByText('날짜·내용·금액과 자산 배분 합계를 확인해 주세요.')).toBeVisible();
  expect(await form.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  );
  for (const name of ['저장하고 계속 입력', '저장']) {
    const button = form.getByRole('button', { name, exact: true });
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  }
});

test('unassigned payment entries restore drafts, save, edit and remain visible in calendar and analytics', async ({
  page,
}) => {
  await login(page);
  let form = await openNew(page);
  await expect(form.getByRole('combobox', { name: '결제수단', exact: true })).toHaveAttribute(
    'data-value',
    '',
  );
  await expect(form.getByRole('combobox', { name: '결제수단', exact: true })).toContainText(
    '미지정',
  );
  await fill(form, '결제수단 미지정 기록 검증', '7345');
  await chooseDate(form.getByLabel('날짜', { exact: true }), '2026-09-19');
  await form.getByRole('button', { name: '닫기', exact: true }).last().click();
  form = await openNew(page);
  await expect(form.getByText('이 기기의 초안을 복원했어요.', { exact: true })).toBeVisible();
  await expect(form.getByLabel('내용', { exact: true })).toHaveValue('결제수단 미지정 기록 검증');
  await expect(form.getByRole('combobox', { name: '결제수단', exact: true })).toHaveAttribute(
    'data-value',
    '',
  );
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(form).not.toBeVisible();
  let stored = (await snapshot(page)).transactions.find(
    (row) => row.description === '결제수단 미지정 기록 검증',
  )!;
  expect(stored.paymentMethodId).toBeNull();
  await expect(page.getByRole('row').filter({ hasText: stored.description })).toContainText(
    '미지정',
  );

  for (const payment of ['cash', '']) {
    await page.getByRole('button', { name: '결제수단 미지정 기록 검증 수정', exact: true }).click();
    const edit = page.getByRole('dialog', { name: '내역 수정', exact: true });
    await edit.getByLabel('수정 내용 자동 저장', { exact: true }).uncheck();
    await selectChoice(edit.getByRole('combobox', { name: '결제수단', exact: true }), payment);
    await edit.getByRole('button', { name: '저장', exact: true }).click();
    await expect(edit).not.toBeVisible();
    stored = (await snapshot(page)).transactions.find((row) => row.id === stored.id)!;
    expect(stored.paymentMethodId).toBe(payment || null);
  }

  await page
    .getByRole('group', { name: '가계부 보기', exact: true })
    .getByRole('button', { name: '캘린더', exact: true })
    .click();
  await page.getByRole('button', { name: /2026-09-19 내역 \d+건 보기/ }).click();
  const day = page.getByRole('dialog', { name: '9월 19일 내역', exact: true });
  await expect(
    day.getByRole('button', { name: '결제수단 미지정 기록 검증 내역 열기', exact: true }),
  ).toContainText('미지정');
  await day.getByRole('button', { name: '닫기', exact: true }).last().click();
  await page.getByRole('button', { name: '통계', exact: true }).click();
  await page.locator('details.analysis-extra-filters > summary').click();
  await selectChoice(page.getByRole('combobox', { name: '결제수단', exact: true }), {
    label: '미지정',
  });
  await expect(
    page.getByRole('button', { name: '결제수단 미지정 필터 해제', exact: true }),
  ).toBeVisible();
  const views = page.getByRole('group', { name: '분석 보기', exact: true });
  await views.getByRole('button', { name: '거래 내역', exact: true }).click();
  await expect(
    page.getByRole('row').filter({ hasText: '결제수단 미지정 기록 검증' }),
  ).toContainText('미지정');
  await views.getByRole('button', { name: '가계부·결제수단', exact: true }).click();
  const paymentTable = page.getByRole('region', { name: '결제수단별 사용액 표', exact: true });
  await expect(paymentTable.getByRole('row').filter({ hasText: '미지정' })).toBeVisible();
});
