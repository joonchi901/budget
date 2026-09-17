import { openGlobalView, openRoom } from './helpers/navigation';
import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Asset, Bootstrap } from '../../src/shared/types';
import { chooseMonth } from './helpers/controls';

function asset(overrides: Partial<Asset> & Pick<Asset, 'id' | 'name'>): Asset {
  return {
    kind: 'asset',
    openingBalance: 0,
    balance: 0,
    color: '#448877',
    tagIds: [],
    trackSavings: false,
    version: 1,
    openingDate: null,
    details: { openingKind: 'observation' },
    ...overrides,
  };
}

/** Synthetic browser-only overlay: no mutation or imported personal data is needed. */
async function openAssetSummary(page: Page) {
  await page.route('**/api/bootstrap', async (route) => {
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({ response });
    const data: Bootstrap = await response.json();
    data.assets = [
      asset({
        id: 'summary-cash',
        name: '확인된 생활 자산',
        openingDate: '2026-02-01',
        openingBalance: 1200000,
        balance: 1500000,
      }),
      asset({
        id: 'summary-investment',
        name: '확인된 투자 자산',
        openingDate: '2026-03-01',
        openingBalance: 2000000,
        balance: 2000000,
      }),
      asset({
        id: 'summary-loan',
        name: '확인된 대출',
        kind: 'liability',
        openingDate: '2026-02-01',
        openingBalance: 700000,
        balance: 600000,
      }),
      asset({
        id: 'summary-contract',
        name: '관리 정보만 있는 계약',
        details: { principal: 90000000 },
      }),
      asset({
        id: 'summary-debt-contract',
        name: '관리 정보만 있는 대출',
        kind: 'liability',
        details: { principal: 50000000 },
      }),
    ];
    data.assetMovements = [
      {
        id: 'summary-cash-adjustment',
        assetId: 'summary-cash',
        transactionId: null,
        operationId: 'summary-adjustment-1',
        date: '2026-08-01',
        description: '합성 잔액 확인',
        amount: 300000,
        savingsAmount: 0,
        actorId: 'u1',
      },
      {
        id: 'summary-loan-adjustment',
        assetId: 'summary-loan',
        transactionId: null,
        operationId: 'summary-adjustment-2',
        date: '2026-08-01',
        description: '합성 대출 잔액 확인',
        amount: -100000,
        savingsAmount: 0,
        actorId: 'u1',
      },
    ];
    data.assetOperations = [];
    data.transactions = [];
    await route.fulfill({ response, json: data });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '나로 시작하기' }).click();
  await openRoom(page);
  await expect(page.getByRole('heading', { name: '우리의 일상' })).toBeVisible();
  await chooseMonth(page.getByLabel('조회 월'), '2026-01');
  await openGlobalView(page, '자산');
  await expect(page.getByRole('heading', { name: '우리의 자산', exact: true })).toBeVisible();
}

test('latest registered asset totals stay visible while unobserved month-end balances remain unknown', async ({
  page,
}) => {
  await openAssetSummary(page);
  const basis = page.getByRole('group', { name: '자산 조회 기준', exact: true });
  await expect(basis.getByRole('button', { name: '최신 기록', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('heading', { name: '확인된 순자산', exact: true })).toBeVisible();
  await expect(page.getByTestId('asset-summary-assets')).toHaveText('3,500,000원');
  await expect(page.getByTestId('asset-summary-debt')).toHaveText('600,000원');
  await expect(page.getByTestId('asset-summary-net')).toHaveText('2,900,000원');
  await expect(page.getByTestId('asset-summary-cash')).toHaveText('1,500,000원');
  await expect(page.getByTestId('asset-summary-contract')).toHaveText('잔액 등록 필요');
  await expect(page.getByTestId('asset-summary-debt-contract')).toHaveText('잔액 등록 필요');
  await expect(page.locator('.asset-summary-note')).toContainText(
    '관리 정보만 있는 2개 항목은 합계에서 제외',
  );

  await basis.getByRole('button', { name: '선택 월말', exact: true }).click();
  await expect(basis.getByRole('button', { name: '선택 월말', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('asset-summary-net')).toHaveText('—');
  await expect(page.getByTestId('asset-summary-assets')).toHaveText('잔액 자료 없음');
  await expect(page.getByTestId('asset-summary-cash')).toHaveText('—');

  await chooseMonth(page.getByLabel('조회 월'), '2026-05');
  await expect(page.getByTestId('asset-summary-assets')).toHaveText('3,200,000원');
  await expect(page.getByTestId('asset-summary-debt')).toHaveText('700,000원');
  await expect(page.getByTestId('asset-summary-net')).toHaveText('2,500,000원');
  await expect(page.getByTestId('asset-summary-cash')).toHaveText('1,200,000원');

  await basis.getByRole('button', { name: '최신 기록', exact: true }).click();
  await expect(page.getByTestId('asset-summary-net')).toHaveText('2,900,000원');
  await expect(page.getByTestId('asset-summary-cash')).toHaveText('1,500,000원');
  await chooseMonth(page.getByLabel('조회 월'), '2026-12');
  await expect(page.getByTestId('asset-summary-net')).toHaveText('2,900,000원');
});

test('latest asset summary and basis toggle fit narrow mobile screens', async ({ page }) => {
  await openAssetSummary(page);
  await mkdir('.wrangler/asset-summary-qa', { recursive: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const basis = page.getByRole('group', { name: '자산 조회 기준', exact: true });
    await expect(basis.getByRole('button', { name: '최신 기록', exact: true })).toBeVisible();
    await expect(basis.getByRole('button', { name: '선택 월말', exact: true })).toBeVisible();
    for (const button of await basis.getByRole('button').all()) {
      const lines = await button.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
      });
      expect(lines, `view toggle label must fit on one line at ${width}px`).toBe(1);
    }
    await expect(page.getByTestId('asset-summary-net')).toHaveText('2,900,000원');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${width}px page overflow`,
    ).toBe(true);
    for (const selector of ['.asset-view-controls', '.asset-hero', '.asset-summary-note']) {
      const bounds = await page.locator(selector).boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x, `${selector} left at ${width}px`).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width, `${selector} right at ${width}px`).toBeLessThanOrEqual(
        width,
      );
    }
    await page.screenshot({
      path: `.wrangler/asset-summary-qa/latest-${width}.png`,
      fullPage: true,
    });
  }
});
