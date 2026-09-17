import { expect, type Page } from '@playwright/test';

export async function openGlobalView(page: Page, name: string) {
  const desktop = page
    .getByRole('navigation', { name: '주 메뉴', exact: true })
    .getByRole('button', { name, exact: true });
  if (await desktop.isVisible()) {
    await desktop.click();
    return;
  }
  const mobile = page.getByRole('navigation', { name: '모바일 주 메뉴', exact: true });
  const direct = mobile.getByRole('button', { name, exact: true });
  if (await direct.isVisible()) {
    await direct.click();
    return;
  }
  const back = mobile.getByRole('button', { name: '가계부 목록', exact: true });
  if (name === '가계부' && (await back.isVisible())) {
    await back.click();
    return;
  }
  await mobile.getByRole('button', { name: '더보기', exact: true }).click();
  const menu = page.getByRole('dialog', { name: '전체 메뉴', exact: true });
  await menu.getByRole('button', { name, exact: true }).click();
  await expect(menu).not.toBeVisible();
}

/** Enter through the same room list used on desktop and mobile. */
export async function openRoom(page: Page, name = '우리의 일상') {
  await expect(page.getByTestId('connection')).toBeVisible();
  const button = page.getByRole('button', { name: `${name} 가계부 열기`, exact: true });
  if (!(await button.isVisible())) await openGlobalView(page, '가계부');
  const search = page.getByRole('searchbox', { name: '가계부 검색', exact: true });
  await expect(search).toBeVisible();
  await search.fill(name);
  await button.click();
  await expect(page.getByRole('heading', { name, exact: true, level: 1 })).toBeVisible();
}

export async function openRoomTab(page: Page, name: '목록' | '캘린더' | '통계' | '계획 · 일정') {
  const button = page
    .getByRole('group', { name: '가계부 보기', exact: true })
    .getByRole('button', { name, exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}
