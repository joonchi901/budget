import { expect, test, type Page } from '@playwright/test';
import type { Bootstrap, Ledger, Transaction } from '../../src/shared/types';
import { chooseMonth, selectChoice } from './helpers/controls';

async function login(page: Page, user: '나' | '와이프' = '나') {
  await page.goto('/');
  await page.getByRole('button', { name: `${user}로 시작하기` }).click();
  await expect(page.getByTestId('connection')).toHaveText('실시간 연결됨');
  await chooseMonth(page.getByLabel('조회 월', { exact: true }), '2026-09');
}

async function createLedger(page: Page, name: string, parentId: string | null = null) {
  const response = await page.request.get('/api/bootstrap');
  expect(response.ok()).toBe(true);
  const data: Bootstrap = await response.json();
  const created = await page.request.post('/api/ledgers', {
    data: {
      mutationId: crypto.randomUUID(),
      expectedHierarchyVersion: data.hierarchyVersion,
      name,
      parentId,
      budget: 0,
    },
  });
  expect(created.status(), await created.text()).toBe(200);
  return ((await created.json()) as { ledger: Ledger }).ledger;
}

async function createEntry(
  page: Page,
  ledgerId: string,
  description: string,
  date: string,
  amount: number,
  type: Transaction['type'],
) {
  const response = await page.request.post('/api/transactions', {
    data: {
      mutationId: crypto.randomUUID(),
      transaction: {
        ledgerId,
        description,
        date,
        amount,
        type,
        ownerId: 'shared',
        paymentMethodId: 'cash',
        tagIds: [],
        allocations: [],
      },
    },
  });
  expect(response.status(), await response.text()).toBe(200);
}

test('ledger list filters explain their scope, sort actual rows, and reset without changing period totals', async ({
  page,
}) => {
  await login(page);
  const suffix = crypto.randomUUID().slice(0, 8);
  const parent = await createLedger(page, `목록 조회 검증 ${suffix}`);
  const child = await createLedger(page, `목록 원본 검증 ${suffix}`, parent.id);
  const food = '월말 검토 식료품';
  const transport = '월말 검토 교통';
  const salary = '월말 검토 급여';
  await createEntry(page, parent.id, food, '2026-09-11', 12000, 'expense');
  await createEntry(page, child.id, transport, '2026-09-03', 48000, 'expense');
  await createEntry(page, parent.id, salary, '2026-09-07', 360000, 'income');
  await page.reload();
  await expect(page.getByTestId('connection')).toHaveText('실시간 연결됨');
  await chooseMonth(page.getByLabel('조회 월', { exact: true }), '2026-09');
  await page
    .getByRole('complementary')
    .getByRole('tree')
    .getByRole('button', { name: parent.name, exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: parent.name })).toBeVisible();

  const names = page.locator('.transactions tbody .transaction-name');
  const sort = page.getByRole('combobox', { name: '내역 정렬', exact: true });
  const search = page.getByRole('textbox', { name: '내역 검색', exact: true });
  const kind = page.getByRole('group', { name: '내역 종류 필터', exact: true });
  const scope = page.getByRole('combobox', { name: '거래 목록의 가계부 범위', exact: true });
  const result = page.getByRole('status', { name: '목록 조회 결과', exact: true });
  const reset = page.getByRole('button', { name: '조회 조건 초기화', exact: true });
  const summary = page.getByRole('region', { name: '조회 기간 요약', exact: true });

  await expect(names).toHaveText([food, salary, transport]);
  await expect(sort).toHaveAttribute('data-value', 'date-desc');
  await expect(result).toHaveCount(0);
  await expect(reset).toHaveCount(0);
  const fullPeriodSummary = await summary.innerText();

  for (const [value, order] of [
    ['date-asc', [transport, salary, food]],
    ['amount-asc', [food, transport, salary]],
    ['amount-desc', [salary, transport, food]],
    ['date-desc', [food, salary, transport]],
  ] as const) {
    await selectChoice(sort, value);
    await expect(names).toHaveText([...order]);
    await expect(reset).toHaveCount(0);
  }
  await selectChoice(sort, 'amount-desc');

  await search.fill('식료품');
  await expect(names).toHaveText([food]);
  await expect(result).toContainText('전체 3건 중 1건');
  await expect(result).toContainText('식료품');
  await reset.click();
  await expect(search).toHaveValue('');
  await expect(names).toHaveText([salary, transport, food]);

  await kind.getByRole('button', { name: '수입', exact: true }).click();
  await expect(names).toHaveText([salary]);
  await expect(result).toContainText('수입');
  await kind.getByRole('button', { name: '지출', exact: true }).click();
  await expect(names).toHaveText([transport, food]);
  await search.fill('월말 검토');
  await selectChoice(scope, child.id);
  await expect(names).toHaveText([transport]);
  await expect(result).toContainText('전체 3건 중 1건');
  await expect(result).toContainText('월말 검토');
  await expect(result).toContainText('지출');
  await expect(result).toContainText(child.name);
  await expect(summary).toHaveText(fullPeriodSummary, { useInnerText: true });

  await reset.click();
  await expect(search).toHaveValue('');
  await expect(kind.getByRole('button', { name: '전체', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(scope).toHaveAttribute('data-value', 'all');
  await expect(sort).toHaveAttribute('data-value', 'amount-desc');
  await expect(names).toHaveText([salary, transport, food]);
  await expect(result).toHaveCount(0);
  await expect(reset).toHaveCount(0);
  await expect(summary).toHaveText(fullPeriodSummary, { useInnerText: true });

  await search.fill('일치하는 기록이 없는 검색어');
  await expect(names).toHaveCount(0);
  await expect(result).toContainText('전체 3건 중 0건');
  await expect(reset).toBeVisible();
  await reset.click();
  await expect(names).toHaveText([salary, transport, food]);
});

test('ledger view survives reload and stays separate when two accounts share one browser', async ({
  page,
}) => {
  await login(page);
  const view = page.getByRole('group', { name: '가계부 보기', exact: true });
  const list = view.getByRole('button', { name: '목록', exact: true });
  const calendar = view.getByRole('button', { name: '캘린더', exact: true });
  await expect(list).toHaveAttribute('aria-pressed', 'true');
  await calendar.click();
  await expect(calendar).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('budget:ledger-view:u1')))
    .toBe('calendar');

  await page.reload();
  await expect(page.getByTestId('connection')).toHaveText('실시간 연결됨');
  await expect(calendar).toHaveAttribute('aria-pressed', 'true');
  await expect(list).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await login(page, '와이프');
  await expect(list).toHaveAttribute('aria-pressed', 'true');
  await expect(calendar).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('budget:ledger-view:u1'))).toBe('calendar');

  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await login(page);
  await expect(calendar).toHaveAttribute('aria-pressed', 'true');
  await list.click();
  await page.reload();
  await expect(page.getByTestId('connection')).toHaveText('실시간 연결됨');
  await expect(list).toHaveAttribute('aria-pressed', 'true');
});
