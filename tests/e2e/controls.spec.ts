import { openGlobalView, openRoom } from './helpers/navigation';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Bootstrap } from '../../src/shared/types';
import { chooseDate, chooseMonth, controlPopup, selectChoice } from './helpers/controls';

async function login(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '나로 시작하기' }).click();
  await openRoom(page);
  await expect(page.getByRole('heading', { level: 1, name: /우리의 일상/ })).toBeVisible();
  await chooseMonth(page.getByLabel('조회 월', { exact: true }), '2026-09');
}

async function capture(page: Page, name: string) {
  await mkdir('output/playwright', { recursive: true });
  await page.screenshot({ path: `output/playwright/controls-${name}.png`, animations: 'disabled' });
}

async function withinViewport(element: Locator) {
  await expect(element).toBeVisible();
  expect(
    await element.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return (
        rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
      );
    }),
    'Opened controls must remain reachable inside the viewport',
  ).toBe(true);
}

async function noNativePickers(page: Page) {
  await expect(
    page.locator(
      'select:visible, input[type="month"]:visible, input[type="date"]:visible, input[type="color"]:visible, [title]:visible',
    ),
  ).toHaveCount(0);
}

test('custom asset and month menus support keyboard selection, dismissal and consistent popup rendering', async ({
  page,
}) => {
  await login(page);
  await openGlobalView(page, '자산');
  const asset = page.getByRole('combobox', { name: '변동 내역 자산', exact: true });
  await asset.click();
  const menu = await controlPopup(asset);
  await withinViewport(menu);
  await capture(page, 'desktop-assets');
  await menu.getByRole('option', { name: '전체 자산', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('option', { name: '생활 통장', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).not.toBeVisible();
  await expect(asset).toHaveAttribute('data-value', 'checking');
  await expect(asset).toBeFocused();
  await asset.press('Enter');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).not.toBeVisible();
  await expect(asset).toBeFocused();
  await asset.click();
  await page.getByRole('heading', { name: '자산 변동 내역', exact: true }).click();
  await expect(menu).not.toBeVisible();
  await expect(asset).toHaveAttribute('data-value', 'checking');
  await selectChoice(asset, 'all');

  const month = page.getByLabel('조회 월', { exact: true });
  await month.click();
  const months = await controlPopup(month);
  await withinViewport(months);
  await capture(page, 'desktop-months');
  await months.getByRole('gridcell', { name: '2026-09', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(months.getByRole('gridcell', { name: '2026-12', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(month).toHaveAttribute('data-value', '2026-12');
  await month.click();
  await page.keyboard.press('Escape');
  await expect(months).not.toBeVisible();
  await expect(month).toBeFocused();
  await chooseMonth(month, '2025-12');
  await expect(month).toHaveAttribute('data-value', '2025-12');
  await chooseMonth(month, '2026-09');
  await noNativePickers(page);
});

test('custom controls remain interactive in an editor and save single and multiple tags as matching badges', async ({
  page,
}) => {
  await login(page);
  const before: Bootstrap = await (await page.request.get('/api/bootstrap')).json();
  await page.getByRole('button', { name: '내역 추가', exact: true }).click();
  const form = page.getByRole('dialog', { name: '새 내역', exact: true });
  await form.getByLabel('내용', { exact: true }).fill('자체 컴포넌트 배지 검증');
  await form.getByLabel('금액', { exact: true }).fill('12340');
  const date = form.getByLabel('날짜', { exact: true });
  await chooseDate(date, '2026-09-16');
  await date.click();
  const days = await controlPopup(date);
  await withinViewport(days);
  await capture(page, 'desktop-days');
  await days.getByRole('gridcell', { name: '2026-09-16', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(days.getByRole('gridcell', { name: '2026-09-17', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(date).toHaveAttribute('data-value', '2026-09-17');
  await expect(date).toBeFocused();
  await chooseDate(date, '2026-09-16');
  const payment = form.getByRole('combobox', { name: '결제수단', exact: true });
  await payment.click();
  const payments = await controlPopup(payment);
  await withinViewport(payments);
  await page.keyboard.press('Escape');
  await expect(payments).not.toBeVisible();
  await expect(form).toBeVisible();
  await expect(payment).toBeFocused();
  await selectChoice(payment, 'cash');

  const category = form.getByRole('button', { name: '분류 선택', exact: true });
  await category.click();
  await form.getByRole('option', { name: '식비', exact: true }).click();
  await expect(category.locator('.tag-badge')).toHaveText('식비');
  await category.click();
  await form.getByRole('option', { name: '교통', exact: true }).click();
  await expect(category.locator('.tag-badge')).toHaveCount(1);
  await expect(category.locator('.tag-badge')).toHaveText('교통');

  const detail = form.getByRole('button', { name: '상세 태그 선택', exact: true });
  await detail.click();
  const travel = form.getByRole('option', { name: '여행', exact: true });
  const daily = form.getByRole('option', { name: '일상', exact: true });
  await expect(travel.locator('.tag-badge')).toHaveText('여행');
  await travel.click();
  await daily.click();
  await expect(travel).toHaveAttribute('aria-selected', 'true');
  await expect(daily).toHaveAttribute('aria-selected', 'true');
  const travelColor = await travel
    .locator('.tag-badge')
    .evaluate((badge) => getComputedStyle(badge).backgroundColor);
  await capture(page, 'desktop-tags');
  await page.keyboard.press('Escape');
  await expect(form).toBeVisible();
  await expect(detail).toBeFocused();
  await expect(detail.locator('.tag-badge')).toHaveCount(2);
  await expect(detail.locator('.tag-badge').filter({ hasText: '여행' })).toHaveCSS(
    'background-color',
    travelColor,
  );
  await noNativePickers(page);
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(form).not.toBeVisible();
  const row = page.getByRole('row').filter({ hasText: '자체 컴포넌트 배지 검증' });
  await expect(row.locator('.tag-badge').filter({ hasText: '교통' })).toHaveCount(1);
  await expect(row.locator('.tag-badge').filter({ hasText: '여행' })).toHaveCSS(
    'background-color',
    travelColor,
  );
  await expect(row.locator('.tag-badge').filter({ hasText: '일상' })).toHaveCount(1);
  const after: Bootstrap = await (await page.request.get('/api/bootstrap')).json();
  const created = after.transactions.find(
    (record) => record.description === '자체 컴포넌트 배지 검증',
  )!;
  expect(created).toMatchObject({ date: '2026-09-16', amount: 12340, paymentMethodId: 'cash' });
  expect(created.tagIds).toEqual(
    expect.arrayContaining(['daily', 'travel', 'category-home-eab590ed86b5']),
  );
  expect(created.tagIds).not.toContain('category-home-ec8b9debb984');
  expect(after.transactions.length - before.transactions.length).toBe(1);
});

for (const width of [320, 390]) {
  test(`custom menus and calendars stay within ${width}px mobile screens including inside a dialog`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await login(page);
    await openGlobalView(page, '자산');
    const asset = page.getByRole('combobox', { name: '변동 내역 자산', exact: true });
    await asset.click();
    await withinViewport(await controlPopup(asset));
    if (width === 390) await capture(page, 'mobile-assets');
    await page.keyboard.press('Escape');
    const month = page.getByLabel('조회 월', { exact: true });
    await month.click();
    await withinViewport(await controlPopup(month));
    if (width === 390) await capture(page, 'mobile-months');
    await page.keyboard.press('Escape');
    await openRoom(page);
    await page.getByRole('button', { name: '내역 추가', exact: true }).click();
    const form = page.getByRole('dialog', { name: '새 내역', exact: true });
    const date = form.getByLabel('날짜', { exact: true });
    await date.click();
    await withinViewport(await controlPopup(date));
    if (width === 390) await capture(page, 'mobile-days');
    await page.keyboard.press('Escape');
    await expect(form).toBeVisible();
    await form.getByRole('button', { name: '상세 태그 선택', exact: true }).click();
    await withinViewport(form.locator('.tag-popover'));
    if (width === 390) await capture(page, 'mobile-tags');
    await page.keyboard.press('Escape');
    await expect(form).toBeVisible();
    await form.getByRole('button', { name: '닫기', exact: true }).last().click();
    await expect(form).not.toBeVisible();
    await noNativePickers(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('custom tooltips support hover and keyboard focus without reopening after Escape or changing financial records', async ({
  page,
}) => {
  await login(page);
  const before: Bootstrap = await (await page.request.get('/api/bootstrap')).json();
  await openGlobalView(page, '태그 설정');
  await page.setViewportSize({ width: 320, height: 844 });
  const moveBack = page.getByRole('button', { name: '급여 맨 뒤로 이동', exact: true });
  const tooltip = page.getByRole('tooltip');
  await expect(moveBack).toBeEnabled();
  await expect(moveBack).not.toHaveAttribute('title');
  await moveBack.hover();
  await expect(tooltip).toHaveText('맨 뒤로 이동');
  await withinViewport(tooltip);
  await capture(page, 'mobile-tooltip');
  await page.mouse.move(0, 0);
  await expect(tooltip).not.toBeVisible();

  await page.keyboard.press('Tab');
  await moveBack.focus();
  expect(await moveBack.evaluate((button) => button.matches(':focus-visible'))).toBe(true);
  await expect(tooltip).toHaveText('맨 뒤로 이동');
  await page.keyboard.press('Escape');
  await expect(tooltip).not.toBeVisible();
  await expect(moveBack).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(moveBack).toBeFocused();
  await expect(tooltip).not.toBeVisible();

  await moveBack.press('Shift+Tab');
  await expect(moveBack).not.toBeFocused();
  await moveBack.focus();
  await expect(tooltip).toHaveText('맨 뒤로 이동');
  await withinViewport(tooltip);
  await moveBack.click();
  await expect(tooltip).not.toBeVisible();
  await expect(moveBack).toBeDisabled();
  const moveFront = page.getByRole('button', { name: '급여 맨 앞으로 이동', exact: true });
  await moveFront.click();
  await expect(moveFront).toBeDisabled();
  await expect(tooltip).not.toBeVisible();
  const after: Bootstrap = await (await page.request.get('/api/bootstrap')).json();
  expect(after.transactions).toEqual(before.transactions);
  expect(after.assetMovements).toEqual(before.assetMovements);
});
