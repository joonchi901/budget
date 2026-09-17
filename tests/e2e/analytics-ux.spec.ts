import { expect, test } from '@playwright/test';
import { chooseDate, chooseMonth, selectChoice } from './helpers/controls';
import type { Bootstrap, MutationResult } from '../../src/shared/types';

test('analysis keeps collapsed filters visible and resets scope without changing the ledger', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '나로 시작하기' }).click();
  await expect(page.getByRole('heading', { name: '우리의 일상', exact: true })).toBeVisible();
  const bootstrap = (await (await page.request.get('/api/bootstrap')).json()) as Bootstrap;
  const ledgerName = `통계 조회 조건과 긴 이름 검증 ${crypto.randomUUID()}`;
  const created = await page.request.post('/api/ledgers', {
    data: {
      mutationId: crypto.randomUUID(),
      expectedHierarchyVersion: bootstrap.hierarchyVersion,
      name: ledgerName,
      budget: 0,
      parentId: null,
    },
  });
  expect(created.status(), await created.text()).toBe(200);
  const ledgerId = ((await created.json()) as MutationResult).ledger!.id;
  const saved = await page.request.post('/api/transactions', {
    data: {
      mutationId: crypto.randomUUID(),
      transaction: {
        ledgerId,
        date: '2026-09-17',
        description: '긴 내역과 큰 금액도 표 안에서 확인하고 원본으로 열 수 있는 거래',
        amount: 999999999999,
        type: 'expense',
        ownerId: 'shared',
        paymentMethodId: 'cash',
        tagIds: [],
        allocations: [],
      },
    },
  });
  expect(saved.status(), await saved.text()).toBe(200);
  await page.reload();
  await chooseMonth(page.getByLabel('조회 월', { exact: true }), '2026-09');
  await page.getByRole('button', { name: '통계', exact: true }).click();
  await selectChoice(page.getByRole('combobox', { name: '분석할 가계부', exact: true }), ledgerId);
  const controls = page.getByRole('region', { name: '분석 조회 조건', exact: true });
  await expect(controls.getByRole('status')).toHaveText('조회 결과 1건');
  const advanced = controls.locator('details.analysis-extra-filters');
  await advanced.locator('summary').click();
  await selectChoice(advanced.getByRole('combobox', { name: '귀속', exact: true }), 'u1');
  await advanced.locator('summary').click();
  await expect(
    controls.getByRole('button', { name: '귀속 나 필터 해제', exact: true }),
  ).toBeVisible();
  await expect(controls.getByRole('status')).toHaveText('조회 결과 0건');
  await expect(page.getByRole('region', { name: '빈 조회 결과', exact: true })).toBeVisible();
  await controls.getByRole('button', { name: '모두 초기화', exact: true }).click();
  await expect(controls.getByRole('status')).toHaveText('조회 결과 1건');
  await expect(
    controls.getByRole('combobox', { name: '분석할 가계부', exact: true }),
  ).toHaveAttribute('data-value', ledgerId);
  await selectChoice(controls.getByRole('combobox', { name: '조회 범위', exact: true }), 'range');
  await chooseDate(controls.getByLabel('통계 시작일', { exact: true }), '2027-01-01');
  await expect(controls.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'CSV 내보내기', exact: true })).toBeDisabled();
  await controls.getByRole('button', { name: '모두 초기화', exact: true }).click();
  await expect(controls.getByRole('combobox', { name: '조회 범위', exact: true })).toHaveAttribute(
    'data-value',
    'month',
  );
  await expect(controls.getByLabel('적용한 조회 범위')).toContainText('2026-09-01 ~ 2026-09-30');
  await page
    .getByRole('group', { name: '분석 보기', exact: true })
    .getByRole('button', { name: '거래 내역', exact: true })
    .click();
  const records = page.getByRole('region', {
    name: '조회한 거래 내역 표 · 가로로 이동하여 원본 열기',
    exact: true,
  });
  await expect(records).toContainText('999,999,999,999');
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(records.getByRole('button', { name: '열기', exact: true })).toBeAttached();
  }
  await records.getByRole('button', { name: '열기', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByLabel('내용', { exact: true })).toHaveValue(
    '긴 내역과 큰 금액도 표 안에서 확인하고 원본으로 열 수 있는 거래',
  );
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).last().click();
});
