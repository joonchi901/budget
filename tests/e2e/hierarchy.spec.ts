import { expect, test, type Page } from '@playwright/test';
import type { Bootstrap, Ledger } from '../../src/shared/types';
import { chooseMonth, selectChoice } from './helpers/controls';

async function login(page: Page, user = '나') {
  await page.goto('/');
  await page.getByRole('button', { name: `${user}로 시작하기` }).click();
  await expect(page.getByTestId('connection')).toHaveText('실시간 연결됨');
  await chooseMonth(page.getByLabel('조회 월', { exact: true }), '2026-09');
}
async function snapshot(page: Page): Promise<Bootstrap> {
  const response = await page.request.get('/api/bootstrap');
  expect(response.ok()).toBe(true);
  return response.json();
}
async function create(page: Page, name: string, parentId: string | null = null): Promise<Ledger> {
  await page
    .getByRole('complementary')
    .getByRole('button', { name: '가계부 추가', exact: true })
    .click();
  const form = page.getByRole('dialog', { name: '가계부 만들기', exact: true });
  await form.getByLabel('가계부 이름', { exact: true }).fill(name);
  await form.getByLabel('전체 예산 (원)', { exact: true }).fill('100000');
  await selectChoice(
    form.getByRole('combobox', { name: '상위 가계부', exact: true }),
    parentId ?? '',
  );
  await form.getByRole('button', { name: '가계부 만들기', exact: true }).click();
  await expect(form).not.toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
  return (await snapshot(page)).ledgers.find((ledger) => ledger.name === name)!;
}
async function entry(
  page: Page,
  ledgerId: string,
  description: string,
  date: string,
  amount: number,
) {
  const response = await page.request.post('/api/transactions', {
    data: {
      mutationId: crypto.randomUUID(),
      transaction: {
        ledgerId,
        description,
        date,
        amount,
        type: 'expense',
        ownerId: 'shared',
        paymentMethodId: 'cash',
        tagIds: [],
        allocations: [],
      },
    },
  });
  expect(response.status(), await response.text()).toBe(200);
}
async function openLedger(page: Page, name: string) {
  await page
    .getByRole('complementary')
    .getByRole('tree')
    .getByRole('button', { name, exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
}
async function moveDialog(page: Page, name: string) {
  const tree = page.getByRole('complementary').getByRole('tree');
  const control = tree.getByRole('button', { name: `${name} 관리 메뉴`, exact: true });
  await control.focus();
  await control.press('Enter');
  await page.getByRole('button', { name: `${name} 위치 변경`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '가계부 위치 변경', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('three-level ledgers keep original records while self, descendants, year and overall views agree', async ({
  page,
}) => {
  await login(page);
  const parent = await create(page, '계층 검증 연간');
  const child = await create(page, '계층 검증 여행', parent.id);
  const leaf = await create(page, '계층 검증 현지', child.id);
  await entry(page, leaf.id, '계층 9월 원본', '2026-09-10', 3210);
  await entry(page, leaf.id, '계층 10월 원본', '2026-10-10', 4321);
  await page.reload();
  await chooseMonth(page.getByLabel('조회 월', { exact: true }), '2026-09');
  await openLedger(page, parent.name);
  const september = page.getByRole('row').filter({ hasText: '계층 9월 원본' });
  await expect(september).toHaveCount(1);
  await expect(
    september.getByRole('button', { name: '계층 9월 원본 원본 가계부 열기' }),
  ).toBeVisible();
  await expect(september.getByRole('button', { name: '계층 9월 원본 수정' })).toHaveCount(0);
  await selectChoice(page.getByRole('combobox', { name: '조회 대상', exact: true }), 'self');
  await expect(september).toHaveCount(0);
  await selectChoice(page.getByRole('combobox', { name: '조회 대상', exact: true }), 'descendants');
  await selectChoice(page.getByRole('combobox', { name: '조회 기간', exact: true }), 'year');
  await expect(page.getByRole('row').filter({ hasText: '계층 10월 원본' })).toHaveCount(1);
  await expect(page.getByRole('region', { name: '조회 기간 요약' })).toContainText('7,531');
  await expect(page.getByRole('region', { name: '조회 기간 요약' })).toContainText('미설정');
  await september.getByRole('button', { name: '계층 9월 원본 원본 가계부 열기' }).click();
  await expect(page.getByRole('navigation', { name: '가계부 경로' })).toContainText(parent.name);
  await expect(page.getByRole('navigation', { name: '가계부 경로' })).toContainText(child.name);
  await expect(page.getByRole('button', { name: '계층 9월 원본 수정', exact: true })).toBeVisible();
  await page
    .getByRole('complementary')
    .getByRole('button', { name: '전체 가계부', exact: true })
    .click();
  await expect(september).toHaveCount(1);
  await expect(page.getByRole('button', { name: '내역 추가', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: '기록할 가계부', exact: true })).toBeVisible();
  const records = (await snapshot(page)).transactions.filter(
    (record) => record.ledgerId === leaf.id,
  );
  expect(records).toHaveLength(2);
  expect(records.map((record) => record.amount).sort()).toEqual([3210, 4321]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '더보기', exact: true }).click();
  const mobile = page.getByRole('dialog', { name: '전체 메뉴', exact: true });
  await expect(mobile.getByRole('button', { name: leaf.name, exact: true })).toBeVisible();
  await mobile.getByRole('button', { name: `${parent.name} 접기`, exact: true }).click();
  await expect(mobile.getByRole('button', { name: leaf.name, exact: true })).toHaveCount(0);
  await mobile.getByRole('button', { name: `${parent.name} 펼치기`, exact: true }).click();
  await expect(mobile.getByRole('button', { name: leaf.name, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
});

test('moving and reordering preserve financial records and hierarchy conflicts retain the intended destination', async ({
  page,
}) => {
  await login(page);
  const source = await create(page, '이동 검증 원본');
  const target = await create(page, '이동 검증 목적지');
  const child = await create(page, '이동 검증 하위', source.id);
  const before = await snapshot(page);
  const form = await moveDialog(page, child.name);
  const parent = form.getByRole('combobox', { name: '상위 가계부', exact: true });
  await selectChoice(parent, target.id);
  const latest = await snapshot(page);
  const concurrent = await page.request.post('/api/ledgers', {
    data: {
      mutationId: crypto.randomUUID(),
      expectedHierarchyVersion: latest.hierarchyVersion,
      name: '동시 구조 변경',
      parentId: source.id,
      budget: 0,
    },
  });
  expect(concurrent.status()).toBe(200);
  const sent: unknown[] = [];
  await page.route(`**/api/ledgers/${child.id}`, async (route) => {
    if (route.request().method() === 'PATCH') sent.push(route.request().postDataJSON());
    await route.continue();
  });
  await form.getByRole('button', { name: '이 위치로 이동', exact: true }).click();
  await expect(
    form.getByText('다른 관리자가 구조를 먼저 변경했어요.', { exact: true }),
  ).toBeVisible();
  await expect(parent).toHaveAttribute('data-value', target.id);
  expect(sent).toHaveLength(1);
  await expect(form.getByRole('button', { name: '이 위치로 이동', exact: true })).toBeDisabled();
  await form.getByRole('button', { name: '최신 구조를 확인했어요', exact: true }).click();
  await form.getByRole('button', { name: '이 위치로 이동', exact: true }).click();
  await expect(form).not.toBeVisible();
  expect(sent).toHaveLength(2);
  expect((await snapshot(page)).ledgers.find((ledger) => ledger.id === child.id)?.parentId).toBe(
    target.id,
  );
  const sibling = await create(page, '이동 검증 형제', target.id);
  const tree = page.getByRole('complementary').getByRole('tree');
  await tree.getByRole('button', { name: `${sibling.name} 관리 메뉴`, exact: true }).click();
  await page.getByRole('button', { name: `${sibling.name} 위로 이동`, exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: '가계부 위치 변경', exact: true }),
  ).not.toBeVisible();
  expect(
    (await snapshot(page)).ledgers
      .filter((ledger) => ledger.parentId === target.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((ledger) => ledger.id),
  ).toEqual([sibling.id, child.id]);
  const sourceRow = tree
    .getByRole('treeitem', { name: source.name, exact: true })
    .locator(':scope > .ledger-tree-row');
  const targetRow = tree
    .getByRole('treeitem', { name: target.name, exact: true })
    .locator(':scope > .ledger-tree-row');
  await sourceRow.dragTo(targetRow);
  await expect
    .poll(
      async () =>
        (await snapshot(page)).ledgers.find((ledger) => ledger.id === source.id)?.parentId,
    )
    .toBe(target.id);
  const after = await snapshot(page);
  expect(after.transactions).toEqual(before.transactions);
  expect(after.assetMovements).toEqual(before.assetMovements);
});

test('ordinary users share the tree and financial editing while only admins change roles and hierarchy', async ({
  browser,
}) => {
  const adminContext = await browser.newContext();
  const userContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const user = await userContext.newPage();
  try {
    await login(admin);
    await login(user, '와이프');
    await expect(
      user.getByRole('complementary').getByRole('button', { name: '가계부 추가', exact: true }),
    ).toHaveCount(0);
    await expect(user.getByRole('button', { name: '구성원 권한', exact: true })).toHaveCount(0);
    await expect(user.getByRole('button', { name: '내역 추가', exact: true })).toBeVisible();
    const before = await snapshot(admin);
    const denied = await user.request.post('/api/ledgers', {
      data: {
        mutationId: crypto.randomUUID(),
        expectedHierarchyVersion: before.hierarchyVersion,
        name: '권한 없는 생성',
        parentId: null,
        budget: 0,
      },
    });
    expect(denied.status()).toBe(403);
    await admin.getByRole('button', { name: '구성원 권한', exact: true }).click();
    let roles = admin.getByRole('dialog', { name: '구성원 권한', exact: true });
    await selectChoice(roles.getByRole('combobox', { name: '와이프 권한', exact: true }), 'admin');
    await roles.getByRole('button', { name: '와이프 권한 저장', exact: true }).click();
    await expect(roles).not.toBeVisible();
    await expect(
      user.getByRole('complementary').getByRole('button', { name: '가계부 추가', exact: true }),
    ).toBeVisible();
    await user.getByRole('button', { name: '구성원 권한', exact: true }).click();
    roles = user.getByRole('dialog', { name: '구성원 권한', exact: true });
    await selectChoice(roles.getByRole('combobox', { name: '와이프 권한', exact: true }), 'user');
    await roles.getByRole('button', { name: '와이프 권한 저장', exact: true }).click();
    await expect(roles).not.toBeVisible();
    await expect(
      user.getByRole('complementary').getByRole('button', { name: '가계부 추가', exact: true }),
    ).toHaveCount(0);
    const after = await snapshot(admin);
    expect(after.users.find((person) => person.id === 'u1')?.role).toBe('admin');
    expect(after.users.find((person) => person.id === 'u2')?.role).toBe('user');
    expect(after.transactions).toEqual(before.transactions);
    expect(after.assetMovements).toEqual(before.assetMovements);
  } finally {
    await adminContext.close();
    await userContext.close();
  }
});
