import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function login(page: Page, user: '나' | '와이프') {
  await page.goto('/');
  await page.getByRole('button', { name: `${user}로 시작하기` }).click();
  await expect(page.getByRole('heading', { name: '우리의 일상' })).toBeVisible();
  await page.getByLabel('조회 월').fill('2026-09');
  await expect(page.getByTestId('connection')).toHaveText('실시간 연결됨');
}

test('two users share source-ledger transactions, asset effects and link changes', async ({
  browser,
}) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const first = await a.newPage();
  const second = await b.newPage();
  try {
    await login(first, '나');
    await login(second, '와이프');
    await first.getByRole('button', { name: '목적 가계부 추가' }).click();
    await first.getByLabel('가계부 이름').fill('우리의 테스트 여행');
    await first.getByLabel('전체 예산 (원)').fill('300000');
    await first.getByRole('button', { name: '가계부 만들기', exact: true }).click();
    await expect(first.getByRole('heading', { name: '우리의 테스트 여행' })).toBeVisible();
    await first.getByRole('button', { name: '내역 추가', exact: true }).click();
    const form = first.getByRole('dialog', { name: '새 내역' });
    await form.getByLabel('금액', { exact: true }).fill('27000');
    await form.getByLabel('내용', { exact: true }).fill('여행 중 저녁 식사');
    await form.getByLabel('날짜', { exact: true }).fill('2026-09-16');
    await form.getByRole('button', { name: '# 여행', exact: true }).click();
    await form.getByLabel('선택한 자산에서 지출 차감').check();
    await form.getByRole('combobox', { name: '출금 자산', exact: true }).selectOption('checking');
    await form.getByRole('button', { name: '저장', exact: true }).click();
    await expect(form).not.toBeVisible();
    const row = second.getByRole('row').filter({ hasText: '여행 중 저녁 식사' });
    await expect(row).toBeVisible();
    await expect(
      row.getByRole('button', { name: '여행 중 저녁 식사 원본 가계부 열기' }),
    ).toBeVisible();
    await expect(row.getByRole('button', { name: '여행 중 저녁 식사 수정' })).toHaveCount(0);
    await second.getByRole('button', { name: '자산', exact: true }).click();
    await expect(second.getByTestId('asset-checking')).toHaveText('2,773,000원');
    await expect(second.getByTestId('asset-reserve')).toHaveText('500,000원');
    await first.getByRole('button', { name: '메인 연결 해제', exact: true }).click();
    await second.getByRole('button', { name: '가계부', exact: true }).click();
    await expect(second.getByRole('row').filter({ hasText: '여행 중 저녁 식사' })).toHaveCount(0);
    await first.getByRole('button', { name: '메인에 연결', exact: true }).click();
    await expect(second.getByRole('row').filter({ hasText: '여행 중 저녁 식사' })).toHaveCount(1);
    await second.getByRole('button', { name: '자산', exact: true }).click();
    await expect(second.getByTestId('asset-checking')).toHaveText('2,773,000원');
    await second.getByRole('button', { name: '가계부', exact: true }).click();
    await second.getByRole('button', { name: '여행 중 저녁 식사 원본 가계부 열기' }).click();
    await expect(second.getByRole('heading', { name: '우리의 테스트 여행' })).toBeVisible();
    await first.getByRole('button', { name: '여행 중 저녁 식사 수정' }).click();
    await first.getByRole('dialog').getByLabel('금액', { exact: true }).fill('28000');
    await expect(second.getByText('나 · 금액 편집 중')).toBeVisible();
    await second.getByRole('button', { name: '여행 중 저녁 식사 수정' }).click();
    await second.getByRole('dialog').getByLabel('금액', { exact: true }).fill('29000');
    await first.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
    await second.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
    await expect(second.getByText('상대방이 먼저 수정했어요')).toBeVisible();
    await expect(second.getByRole('dialog').getByLabel('금액', { exact: true })).toHaveValue(
      '29000',
    );
    await second.getByRole('button', { name: '최신 내용 불러오기' }).click();
    await expect(second.getByRole('dialog').getByLabel('금액', { exact: true })).toHaveValue(
      '28000',
    );
    await second.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
    await b.setOffline(true);
    await first.getByRole('button', { name: '여행 중 저녁 식사 수정' }).click();
    await first.getByRole('dialog').getByLabel('금액', { exact: true }).fill('30000');
    await first.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
    await b.setOffline(false);
    await expect(second.getByRole('row').filter({ hasText: '여행 중 저녁 식사' })).toContainText(
      '30,000',
    );
    await second.reload();
    await second.getByLabel('조회 월').fill('2026-09');
    await second.getByRole('button', { name: '자산', exact: true }).click();
    await expect(second.getByTestId('asset-checking')).toHaveText('2,770,000원');
  } finally {
    await Promise.all([a.close(), b.close()]).catch(() => {});
  }
});

test('lost save response retries the same operation exactly once', async ({ page }) => {
  await login(page, '나');
  let dropped = false;
  await page.route('**/api/transactions', async (route) => {
    if (route.request().method() === 'POST' && !dropped) {
      dropped = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: '내역 추가', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('내용', { exact: true }).fill('응답 누락 확인');
  await dialog.getByLabel('금액', { exact: true }).fill('1234');
  await dialog.getByLabel('날짜', { exact: true }).fill('2026-09-16');
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '저장 결과 다시 확인' })).toBeVisible();
  await expect(dialog.getByLabel('내용', { exact: true })).toBeDisabled();
  const leaving = page.waitForEvent('dialog');
  await page.close({ runBeforeUnload: true });
  const warning = await leaving;
  expect(warning.type()).toBe('beforeunload');
  await warning.dismiss();
  await expect(dialog.getByLabel('내용', { exact: true })).toHaveValue('응답 누락 확인');
  await dialog.getByRole('button', { name: '저장 결과 다시 확인' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: '응답 누락 확인' })).toHaveCount(1);
  const response = await page.request.get('/api/bootstrap');
  const data = await response.json();
  expect(
    data.transactions.filter((t: { description: string }) => t.description === '응답 누락 확인'),
  ).toHaveLength(1);
});

test('desktop and mobile screens render without page overflow or runtime errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mkdir('output/playwright', { recursive: true });
  await page.goto('/');
  await page.screenshot({ path: 'output/playwright/login-desktop.png', fullPage: true });
  await login(page, '나');
  await page.screenshot({ path: 'output/playwright/ledger-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '자산', exact: true }).click();
  await page.screenshot({ path: 'output/playwright/assets-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '카드 · 통장', exact: true }).click();
  await page.getByLabel('조회 월').fill('2026-10');
  await expect(page.getByText('2026년 10월 납부 예정 기준')).toBeVisible();
  await page.screenshot({ path: 'output/playwright/cards-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '통계', exact: true }).click();
  await page.getByRole('button', { name: '# 함께', exact: true }).click();
  await expect(page.getByText('선택한 기록의 지출')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '가계부', exact: true }).click();
  await expect(page.getByRole('heading', { name: '우리의 일상' })).toBeVisible();
  await page.getByLabel('조회 월').fill('2026-09');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'output/playwright/ledger-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '내역 추가', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: 'output/playwright/form-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).first().click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [menu, heading] of [
      ['자산', '우리의 자산'],
      ['카드 · 통장', '카드와 통장'],
      ['통계', '기록으로 보는 우리'],
      ['가계부', '우리의 일상'],
    ]) {
      await page.getByRole('button', { name: menu, exact: true }).click();
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${menu} at ${width}px`,
      ).toBe(true);
      if (width === 390 && menu === '자산')
        await page.screenshot({ path: 'output/playwright/assets-mobile.png', fullPage: true });
    }
  }
  expect(errors).toEqual([]);
});
