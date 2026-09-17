import { chooseMonth, selectChoice } from './helpers/controls';
import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Bootstrap, MutationResult } from '../../src/shared/types';

test('annual category matrix and payment drilldown agree on accounting periods', async ({
  page,
}) => {
  const analysisViews = page.getByRole('group', { name: '분석 보기', exact: true });
  async function showView(name: '소비 흐름' | '분류별' | '가계부·결제수단' | '거래 내역') {
    const button = analysisViews.getByRole('button', { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }
  async function showAnnualCategoryDetail() {
    await showView('분류별');
    const detail = page.locator('details.analysis-expander');
    if ((await detail.getAttribute('open')) === null) {
      await detail.locator('summary').filter({ hasText: '2026년 월별 상세표' }).click();
    }
  }
  await page.goto('/');
  await page.getByRole('button', { name: '나로 시작하기' }).click();
  await expect(page.getByRole('heading', { name: '우리의 일상' })).toBeVisible();
  const bootstrap = await page.request.get('/api/bootstrap');
  const data = (await bootstrap.json()) as Bootstrap;
  const category = data.tagGroups.find((group) => group.name === '분류')!;
  const food = data.tags.find((tag) => tag.groupId === category.id && tag.name === '식비')!;
  const created = await page.request.post('/api/ledgers', {
    data: {
      mutationId: crypto.randomUUID(),
      name: '분석 검증 가계부',
      expectedHierarchyVersion: data.hierarchyVersion,
      budget: 0,
      periodStartDay: 25,
      parentId: null,
    },
  });
  expect(created.status()).toBe(200);
  const ledgerId = ((await created.json()) as MutationResult).ledger!.id;
  for (const [description, date, amount, type] of [
    ['분석 범위 이전', '2026-01-24', 9000, 'expense'],
    ['분석 1월 시작', '2026-01-25', 100, 'expense'],
    ['분석 1월 끝', '2026-02-24', 200, 'expense'],
    ['분석 2월 시작', '2026-02-25', 300, 'expense'],
    ['분석 급여', '2026-02-01', 1000, 'income'],
  ] as const) {
    const response = await page.request.post('/api/transactions', {
      data: {
        mutationId: crypto.randomUUID(),
        transaction: {
          ledgerId,
          date,
          description,
          amount,
          type,
          ownerId: 'shared',
          paymentMethodId: 'cash',
          tagIds: [food.id],
          allocations: [],
        },
      },
    });
    expect(response.status(), await response.text()).toBe(200);
  }
  const chartAssets = [];
  for (const trackSavings of [true, false]) {
    const response = await page.request.post('/api/assets', {
      data: {
        mutationId: crypto.randomUUID(),
        name: trackSavings ? '차트 저축 자산' : '차트 생활 자산',
        kind: 'asset',
        openingBalance: trackSavings ? 1000 : 0,
        openingDate: '2026-01-01',
        color: '#31725f',
        tagIds: [],
        trackSavings,
      },
    });
    expect(response.status()).toBe(200);
    chartAssets.push(((await response.json()) as MutationResult).asset!);
  }
  for (const [date, amount, fromIndex, toIndex] of [
    ['2026-01-30', 200, 0, 1],
    ['2026-02-28', 300, 1, 0],
  ] as const) {
    const current = (await (await page.request.get('/api/bootstrap')).json()) as Bootstrap;
    const response = await page.request.post('/api/asset-operations', {
      data: {
        mutationId: crypto.randomUUID(),
        type: 'transfer',
        date,
        amount,
        description: '차트 저축 유입·인출 검증',
        fromAssetId: chartAssets[fromIndex].id,
        toAssetId: chartAssets[toIndex].id,
        expectedAssetVersions: Object.fromEntries(
          chartAssets.map((asset) => [
            asset.id,
            current.assets.find((value) => value.id === asset.id)!.version,
          ]),
        ),
      },
    });
    expect(response.status()).toBe(200);
  }
  await page.reload();
  await chooseMonth(page.getByLabel('조회 월', { exact: true }), '2026-01');
  await page.getByRole('button', { name: '통계', exact: true }).click();
  await selectChoice(page.getByRole('combobox', { name: '분석할 가계부', exact: true }), ledgerId);
  await showView('소비 흐름');
  const flow = page.getByRole('group', { name: '2026년 수입 지출 가구 순저축 추이', exact: true });
  const januaryFlow = flow.getByRole('button', {
    name: '2026-01 수입 1,000원, 지출 300원, 가구 순저축 -200원. 이 기간 거래 보기',
    exact: true,
  });
  await expect(januaryFlow).toBeVisible();
  await expect(flow.locator('.analysis-flow-bar')).toHaveCount(36);
  const negativeBar = await januaryFlow.locator('[data-metric="savings"]').boundingBox();
  const januaryAxis = await januaryFlow.locator('.analysis-flow-axis').boundingBox();
  expect(negativeBar!.height).toBeGreaterThan(0);
  expect(negativeBar!.y).toBeGreaterThanOrEqual(januaryAxis!.y);
  const februaryFlow = flow.getByRole('button', {
    name: '2026-02 수입 0원, 지출 300원, 가구 순저축 300원. 이 기간 거래 보기',
    exact: true,
  });
  const positiveBar = await februaryFlow.locator('[data-metric="savings"]').boundingBox();
  const februaryAxis = await februaryFlow.locator('.analysis-flow-axis').boundingBox();
  expect(positiveBar!.height).toBeGreaterThan(0);
  expect(positiveBar!.y + positiveBar!.height).toBeLessThanOrEqual(februaryAxis!.y + 0.1);
  await page.locator('summary').filter({ hasText: '추가 필터' }).click();
  await selectChoice(page.getByRole('combobox', { name: '거래 종류', exact: true }), 'income');
  await expect(
    flow.getByRole('button', {
      name: '2026-01 수입 1,000원, 지출 0원, 가구 순저축 -200원. 이 기간 거래 보기',
      exact: true,
    }),
  ).toBeVisible();
  await selectChoice(page.getByRole('combobox', { name: '거래 종류', exact: true }), '');
  await showAnnualCategoryDetail();
  await selectChoice(
    page.getByRole('combobox', { name: '집계할 태그 유형', exact: true }),
    category.id,
  );
  const matrix = page.getByRole('region', { name: '2026년 분류별 지출 월간 상세표' });
  await expect(matrix.getByRole('columnheader')).toHaveCount(15);
  await expect(
    matrix.getByRole('button', { name: '2026-01 식비 지출 300원 거래 보기', exact: true }),
  ).toBeVisible();
  await expect(
    matrix.getByRole('button', { name: '2026년 식비 지출 합계 600원 거래 보기', exact: true }),
  ).toBeVisible();
  await matrix
    .getByRole('button', { name: '2026-01 식비 지출 300원 거래 보기', exact: true })
    .click();
  let dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('분석 1월 시작');
  await expect(dialog).toContainText('분석 1월 끝');
  await expect(dialog).not.toContainText('분석 범위 이전');
  await expect(dialog).not.toContainText('분석 2월 시작');
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await showView('가계부·결제수단');
  const paymentTable = page.locator('.analysis-payments');
  await paymentTable.getByRole('button', { name: '현금 3건 거래 보기', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('분석 급여');
  await expect(dialog.locator('tbody tr')).toHaveCount(3);
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await showAnnualCategoryDetail();
  await selectChoice(page.getByRole('combobox', { name: '연간 상세 금액', exact: true }), 'income');
  await expect(
    page
      .getByRole('region', { name: '2026년 분류별 수입 월간 상세표' })
      .getByRole('button', { name: '2026년 식비 수입 합계 1,000원 거래 보기', exact: true }),
  ).toBeVisible();
  await mkdir('output/playwright', { recursive: true });
  await showView('소비 흐름');
  await page
    .locator('.analysis-flow')
    .screenshot({ path: 'output/playwright/analytics-flow-desktop.png' });
  await showAnnualCategoryDetail();
  await page
    .getByRole('region', { name: '2026년 분류별 수입 월간 상세표' })
    .screenshot({ path: 'output/playwright/analytics-matrix-desktop.png' });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await showAnnualCategoryDetail();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await showView('소비 흐름');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await showAnnualCategoryDetail();
  await page
    .getByRole('region', { name: '2026년 분류별 수입 월간 상세표' })
    .screenshot({ path: 'output/playwright/analytics-matrix-mobile.png' });
  await showView('소비 흐름');
  await page
    .locator('.analysis-flow')
    .screenshot({ path: 'output/playwright/analytics-flow-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const beforeMove = (await (await page.request.get('/api/bootstrap')).json()) as Bootstrap;
  const connected = await page.request.patch(`/api/ledgers/${ledgerId}`, {
    data: {
      mutationId: crypto.randomUUID(),
      expectedVersion: beforeMove.ledgers.find((ledger) => ledger.id === ledgerId)!.version,
      expectedHierarchyVersion: beforeMove.hierarchyVersion,
      parentId: 'main',
    },
  });
  expect(connected.status()).toBe(200);
  await page.reload();
  await chooseMonth(page.getByLabel('조회 월', { exact: true }), '2026-01');
  await page.getByRole('button', { name: '통계', exact: true }).click();
  await selectChoice(page.getByRole('combobox', { name: '분석할 가계부', exact: true }), 'main');
  await page.locator('summary').filter({ hasText: '추가 필터' }).click();
  await selectChoice(page.getByRole('combobox', { name: '거래 출처', exact: true }), ledgerId);
  await showView('가계부·결제수단');
  const contributions = page.locator('.analysis-ledgers');
  const linkedRow = contributions
    .getByRole('row')
    .filter({
      has: page.getByRole('rowheader', {
        name: '분석 검증 가계부',
        exact: true,
      }),
    });
  await expect(linkedRow).toContainText('100.0%');
  await linkedRow
    .getByRole('button', { name: '분석 검증 가계부 지출 9,100원 거래 보기', exact: true })
    .click();
  dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('분석 범위 이전');
  await expect(dialog).toContainText('분석 1월 시작');
  await expect(dialog).not.toContainText('분석 1월 끝');
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await selectChoice(page.getByRole('combobox', { name: '거래 출처', exact: true }), 'main');
  await showView('거래 내역');
  await expect(page.getByRole('heading', { name: '선택한 거래 0건', exact: true })).toBeVisible();
});
