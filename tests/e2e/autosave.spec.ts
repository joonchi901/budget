import { chooseDate, chooseMonth, selectChoice } from './helpers/controls';
import { expect, test, type Page } from '@playwright/test';
import type { Bootstrap, Transaction } from '../../src/shared/types';
async function login(page: Page, name = '나') {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(`${name}로 시작하기`) }).click();
  await expect(page.getByRole('heading', { name: /우리의 일상/ })).toBeVisible();
  await chooseMonth(page.getByLabel('조회 월'), '2026-09');
  await expect(page.getByTestId('connection')).toHaveText('실시간 연결됨');
}
async function snapshot(page: Page): Promise<Bootstrap> {
  const response = await page.request.get('/api/bootstrap');
  expect(response.ok()).toBe(true);
  return response.json();
}
async function fillNew(page: Page, description: string, amount = '1234') {
  await page.getByRole('button', { name: '내역 추가', exact: true }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('내용', { exact: true }).fill(description);
  await form.getByLabel('금액', { exact: true }).fill(amount);
  await chooseDate(form.getByLabel('날짜', { exact: true }), '2026-09-13');
  await selectChoice(form.getByRole('combobox', { name: '결제수단', exact: true }), 'cash');
  return form;
}
async function create(page: Page, name: string): Promise<Transaction> {
  const form = await fillNew(page, name);
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(form).not.toBeVisible();
  return (await snapshot(page)).transactions.find((t) => t.description === name)!;
}

test('new entries remain device drafts until saved and drafts are isolated between accounts and ledgers', async ({
  page,
}) => {
  await login(page);
  await page.clock.install();
  const form = await fillNew(page, '기기 초안 복원 검증', '4567');
  await form.getByLabel('날짜', { exact: true }).focus();
  await page.clock.runFor(1200);
  expect(
    (await snapshot(page)).transactions.some((t) => t.description === '기기 초안 복원 검증'),
  ).toBe(false);
  page.on('dialog', (dialog) => void dialog.accept());
  await page.reload();
  await page.getByRole('button', { name: '내역 추가', exact: true }).click();
  await expect(page.getByText('이 기기의 초안을 복원했어요.', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByLabel('내용', { exact: true })).toHaveValue(
    '기기 초안 복원 검증',
  );
  await expect(page.getByRole('dialog').getByLabel('금액', { exact: true })).toHaveValue('4567');
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).last().click();
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await page.getByRole('button', { name: /와이프로 시작하기/ }).click();
  await page.getByRole('button', { name: '내역 추가', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('내용', { exact: true })).toHaveValue('');
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).last().click();
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await page.getByRole('button', { name: /나로 시작하기/ }).click();
  await page
    .getByRole('complementary')
    .getByRole('button', { name: /제주에서 보내는 가을/ })
    .click();
  await page.getByRole('button', { name: '내역 추가', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('내용', { exact: true })).toHaveValue('');
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).last().click();
  await page
    .getByRole('complementary')
    .getByRole('button', { name: /우리의 일상/ })
    .click();
  await page.getByRole('button', { name: '내역 추가', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('내용', { exact: true })).toHaveValue(
    '기기 초안 복원 검증',
  );
  await page.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(
    (await snapshot(page)).transactions.filter((t) => t.description === '기기 초안 복원 검증'),
  ).toHaveLength(1);
});

test('new entry auto-save requires explicit opt-in and valid field exit, then safely confirms a lost response once', async ({
  page,
}) => {
  await login(page);
  await page.clock.install();
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
  await page.getByRole('button', { name: '내역 추가', exact: true }).click();
  const form = page.getByRole('dialog');
  const enabled = form.getByLabel('입력 완료 후 자동 저장', { exact: true });
  await expect(enabled).not.toBeChecked();
  await enabled.check();
  await form.getByLabel('내용', { exact: true }).fill('신규 선택 자동 저장 검증');
  await form.getByLabel('날짜', { exact: true }).focus();
  await page.clock.runFor(1200);
  expect(mutations).toHaveLength(0);
  await expect(form).toBeVisible();
  await form.getByLabel('금액', { exact: true }).fill('5678');
  await page.clock.runFor(1200);
  expect(mutations).toHaveLength(0);
  await form.getByLabel('날짜', { exact: true }).focus();
  await page.clock.runFor(799);
  expect(mutations).toHaveLength(0);
  await page.clock.runFor(2);
  await expect(form.getByRole('button', { name: '저장 결과 다시 확인' })).toBeVisible();
  expect(
    (await snapshot(page)).transactions.filter((t) => t.description === '신규 선택 자동 저장 검증'),
  ).toHaveLength(1);
  await form.getByRole('button', { name: '저장 결과 다시 확인' }).click();
  await expect(form).not.toBeVisible();
  expect(mutations).toHaveLength(2);
  expect(new Set(mutations).size).toBe(1);
  const saved = (await snapshot(page)).transactions.filter(
    (t) => t.description === '신규 선택 자동 저장 검증',
  );
  expect(saved).toEqual([
    expect.objectContaining({
      amount: 5678,
      version: 1,
      createdBy: 'u1',
      createdAt: expect.any(String),
    }),
  ]);
  await page.getByRole('button', { name: '내역 추가', exact: true }).click();
  const fresh = page.getByRole('dialog');
  await expect(fresh.getByLabel('입력 완료 후 자동 저장', { exact: true })).not.toBeChecked();
  await expect(fresh.getByLabel('내용', { exact: true })).toHaveValue('');
  await expect(fresh.getByLabel('금액', { exact: true })).toHaveValue('');
  await fresh.getByRole('button', { name: '닫기', exact: true }).last().click();
});

test('valid edits auto-save after field exit, retain the editor and advance versions without duplicate manual saves', async ({
  page,
}) => {
  await login(page);
  const row = await create(page, '자동 저장 원본');
  await page.getByRole('button', { name: '자동 저장 원본 수정', exact: true }).click();
  const form = page.getByRole('dialog');
  await expect(form.getByLabel('수정 내용 자동 저장', { exact: true })).toBeChecked();
  await form.getByLabel('내용', { exact: true }).fill('자동 저장 수정');
  await form.getByLabel('날짜', { exact: true }).focus();
  await expect(form.getByTestId('transaction-save-status')).toHaveText('자동 저장됨');
  await expect(form).toBeVisible();
  expect((await snapshot(page)).transactions.find((t) => t.id === row.id)).toMatchObject({
    description: '자동 저장 수정',
    version: row.version + 1,
  });
  await form.getByLabel('금액', { exact: true }).fill('2468');
  await form.getByLabel('날짜', { exact: true }).focus();
  await expect(form.getByTestId('transaction-save-status')).toHaveText('자동 저장됨');
  expect((await snapshot(page)).transactions.find((t) => t.id === row.id)).toMatchObject({
    amount: 2468,
    version: row.version + 2,
  });
  await page.clock.install();
  await form.getByLabel('금액', { exact: true }).fill('');
  await form.getByLabel('날짜', { exact: true }).focus();
  await page.clock.runFor(1200);
  expect((await snapshot(page)).transactions.find((t) => t.id === row.id)).toMatchObject({
    amount: 2468,
    version: row.version + 2,
  });
  await form.getByLabel('금액', { exact: true }).fill('2468');
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(form).not.toBeVisible();
  expect((await snapshot(page)).transactions.filter((t) => t.id === row.id)).toEqual([
    expect.objectContaining({ amount: 2468, version: row.version + 2 }),
  ]);
});

test('a lost creation response survives reload and reuses the exact pending mutation once', async ({
  page,
}) => {
  await login(page);
  let dropped = false;
  const mutations: string[] = [];
  await page.route('**/api/transactions', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    mutations.push(route.request().postDataJSON().mutationId);
    if (!dropped) {
      dropped = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  const form = await fillNew(page, '응답 유실 기기 복구', '7890');
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(form.getByRole('button', { name: '저장 결과 다시 확인' })).toBeVisible();
  expect(
    (await snapshot(page)).transactions.filter((t) => t.description === '응답 유실 기기 복구'),
  ).toHaveLength(1);
  page.on('dialog', (dialog) => void dialog.accept());
  await page.reload();
  await page.getByRole('button', { name: '내역 추가', exact: true }).click();
  const restored = page.getByRole('dialog');
  await expect(restored.getByRole('button', { name: '저장 결과 다시 확인' })).toBeVisible();
  await expect(restored.getByLabel('내용', { exact: true })).toBeDisabled();
  await restored.getByRole('button', { name: '저장 결과 다시 확인' }).click();
  await expect(restored).not.toBeVisible();
  expect(mutations).toHaveLength(2);
  expect(new Set(mutations).size).toBe(1);
  expect(
    (await snapshot(page)).transactions.filter((t) => t.description === '응답 유실 기기 복구'),
  ).toHaveLength(1);
});

test('automatic writes stop on a conflicting edit and on deletion while retaining local input', async ({
  browser,
}) => {
  const contextA = await browser.newContext(),
    contextB = await browser.newContext();
  const first = await contextA.newPage(),
    second = await contextB.newPage();
  try {
    await login(first);
    await login(second, '와이프');
    const original = await create(first, '자동 저장 충돌 원본');
    await expect(
      second.getByRole('button', { name: '자동 저장 충돌 원본 수정', exact: true }),
    ).toBeVisible();
    await first.getByRole('button', { name: '자동 저장 충돌 원본 수정', exact: true }).click();
    await second.getByRole('button', { name: '자동 저장 충돌 원본 수정', exact: true }).click();
    const a = first.getByRole('dialog'),
      b = second.getByRole('dialog');
    await a.getByLabel('금액', { exact: true }).fill('2222');
    await a.getByLabel('날짜', { exact: true }).focus();
    await expect(a.getByTestId('transaction-save-status')).toHaveText('자동 저장됨');
    await b.getByLabel('금액', { exact: true }).fill('3333');
    await b.getByLabel('날짜', { exact: true }).focus();
    await expect(b.getByText('상대방이 먼저 수정했어요', { exact: true })).toBeVisible();
    await expect(b.getByLabel('금액', { exact: true })).toHaveValue('3333');
    expect((await snapshot(first)).transactions.find((t) => t.id === original.id)).toMatchObject({
      amount: 2222,
      version: original.version + 1,
    });
    await b.getByRole('button', { name: '최신 내용 불러오기', exact: true }).click();
    await expect(b.getByLabel('금액', { exact: true })).toHaveValue('2222');
    await a.getByRole('button', { name: '삭제', exact: true }).click();
    await a.getByRole('button', { name: '삭제 확인', exact: true }).click();
    await expect(a).not.toBeVisible();
    await expect(b.getByText(/이 내역이 삭제되었거나/)).toBeVisible();
    await expect(b.getByLabel('금액', { exact: true })).toBeDisabled();
    expect((await snapshot(second)).transactions.some((t) => t.id === original.id)).toBe(false);
  } finally {
    await Promise.all([contextA.close(), contextB.close()]).catch(() => {});
  }
});
