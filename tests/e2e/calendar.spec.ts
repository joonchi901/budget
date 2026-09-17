import { expect, test, type Page } from '@playwright/test';
import type { Bootstrap, Ledger, Transaction } from '../../src/shared/types';
import { chooseDate, chooseMonth, selectChoice } from './helpers/controls';

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

// Set up isolated ledgers through the authenticated API; calendar entry creation stays in the UI.
async function fixtureLedger(
  page: Page,
  name: string,
  parentId: string | null = null,
  periodStartDay = 1,
): Promise<Ledger> {
  const state = await snapshot(page);
  const response = await page.request.post('/api/ledgers', {
    data: {
      mutationId: crypto.randomUUID(),
      expectedHierarchyVersion: state.hierarchyVersion,
      name,
      parentId,
      periodStartDay,
      budget: 0,
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as { ledger: Ledger }).ledger;
}

async function fixtureEntry(
  page: Page,
  ledgerId: string,
  description: string,
  date: string,
  amount: number,
): Promise<Transaction> {
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
  return ((await response.json()) as { transaction: Transaction }).transaction;
}

async function openLedger(page: Page, name: string) {
  await page
    .getByRole('complementary')
    .getByRole('tree')
    .getByRole('button', { name, exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
}

async function calendar(page: Page) {
  const view = page.getByRole('group', { name: '가계부 보기', exact: true });
  await view.getByRole('button', { name: '캘린더', exact: true }).click();
  await expect(view.getByRole('button', { name: '캘린더', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  return view;
}

function newForm(page: Page) {
  return page.getByRole('dialog', { name: '새 내역', exact: true });
}

test('a user creates on a calendar date and day totals/list agree while date drafts preserve the generic draft', async ({
  page,
}) => {
  await login(page);
  const ledger = await fixtureLedger(page, '달력 공동 기록 검증');
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await login(page, '와이프');
  expect((await snapshot(page)).user.role).toBe('user');
  await openLedger(page, ledger.name);
  const view = await calendar(page);
  const add = page.getByRole('button', { name: '2026-09-17 내역 추가', exact: true });
  await add.focus();
  await add.press('Enter');
  const form = newForm(page);
  await expect(form.getByLabel('날짜', { exact: true })).toHaveAttribute(
    'data-value',
    '2026-09-17',
  );
  await form.getByLabel('내용', { exact: true }).fill('달력에서 등록한 공동 지출');
  await form.getByLabel('금액', { exact: true }).fill('1731');
  await selectChoice(form.getByRole('combobox', { name: '결제수단', exact: true }), 'cash');
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(form).not.toBeVisible();
  const day = page.getByRole('group', { name: '2026-09-17 내역', exact: true });
  await expect(day.getByLabel('지출 1,731원', { exact: true })).toBeVisible();
  await expect(
    day.getByRole('button', { name: '달력에서 등록한 공동 지출 내역 열기', exact: true }),
  ).toBeVisible();
  await view.getByRole('button', { name: '목록', exact: true }).click();
  await expect(view.getByRole('button', { name: '목록', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const row = page.getByRole('row').filter({ hasText: '달력에서 등록한 공동 지출' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('1,731');
  await calendar(page);

  await page.getByRole('button', { name: '내역 추가', exact: true }).click();
  await form.getByLabel('내용', { exact: true }).fill('기존 일반 입력 초안');
  await chooseDate(form.getByLabel('날짜', { exact: true }), '2026-09-13');
  await form.getByRole('button', { name: '닫기', exact: true }).last().click();
  await page.getByRole('button', { name: '2026-09-18 내역 추가', exact: true }).click();
  await expect(form.getByLabel('날짜', { exact: true })).toHaveAttribute(
    'data-value',
    '2026-09-18',
  );
  await expect(form.getByLabel('내용', { exact: true })).toHaveValue('');
  await form.getByLabel('내용', { exact: true }).fill('18일 달력 전용 초안');
  await form.getByRole('button', { name: '닫기', exact: true }).last().click();
  await page.getByRole('button', { name: '내역 추가', exact: true }).click();
  await expect(form.getByText('이 기기의 초안을 복원했어요.', { exact: true })).toBeVisible();
  await expect(form.getByLabel('내용', { exact: true })).toHaveValue('기존 일반 입력 초안');
  await expect(form.getByLabel('날짜', { exact: true })).toHaveAttribute(
    'data-value',
    '2026-09-13',
  );
  await form.getByRole('button', { name: '닫기', exact: true }).last().click();
  await page.getByRole('button', { name: '2026-09-18 내역 추가', exact: true }).click();
  await expect(form.getByLabel('내용', { exact: true })).toHaveValue('18일 달력 전용 초안');
  await expect(form.getByLabel('날짜', { exact: true })).toHaveAttribute(
    'data-value',
    '2026-09-18',
  );
  await form.getByRole('button', { name: '닫기', exact: true }).last().click();
  expect(
    (await snapshot(page)).transactions.filter((entry) => entry.ledgerId === ledger.id),
  ).toEqual([expect.objectContaining({ date: '2026-09-17', amount: 1731, createdBy: 'u2' })]);
});

test('calendar uses civil dates, opens child originals, and overall date entry requires a source ledger', async ({
  page,
}) => {
  const selections: Array<{ ledgerId: string; transactionId?: string }> = [];
  page.on('websocket', (socket) => {
    socket.on('framesent', ({ payload }) => {
      if (typeof payload !== 'string') return;
      try {
        const message = JSON.parse(payload);
        if (message.type === 'presence' && message.transactionId) selections.push(message);
      } catch {
        /* Ignore non-JSON keepalive frames. */
      }
    });
  });
  await login(page);
  const parent = await fixtureLedger(page, '달력 상위 검증', null, 25);
  const child = await fixtureLedger(page, '달력 원본 검증', parent.id);
  const original = await fixtureEntry(page, child.id, '달력 하위 원본 기록', '2026-09-10', 2765);
  await page.reload();
  await chooseMonth(page.getByLabel('조회 월', { exact: true }), '2026-09');
  await openLedger(page, parent.name);
  await calendar(page);
  await page
    .getByRole('group', { name: '2026-09-10 내역', exact: true })
    .getByRole('button', { name: '달력 하위 원본 기록 내역 열기', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: child.name, exact: true }),
  ).toBeVisible();
  const editing = page.getByRole('dialog', { name: '내역 수정', exact: true });
  await expect.poll(() => selections.some((item) => item.transactionId === original.id)).toBe(true);
  expect(
    selections
      .filter((item) => item.transactionId === original.id)
      .every((item) => item.ledgerId === child.id),
  ).toBe(true);
  await expect(editing).toContainText(`${child.name}에 기록해요`);
  await expect(editing.getByLabel('날짜', { exact: true })).toHaveAttribute(
    'data-value',
    '2026-09-10',
  );
  await editing.getByLabel('수정 내용 자동 저장', { exact: true }).uncheck();
  await editing.getByLabel('금액', { exact: true }).fill('3111');
  await editing.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editing).not.toBeVisible();
  expect(
    (await snapshot(page)).transactions.find((entry) => entry.id === original.id),
  ).toMatchObject({ ledgerId: child.id, amount: 3111 });

  await page
    .getByRole('complementary')
    .getByRole('button', { name: '전체 가계부', exact: true })
    .click();
  await calendar(page);
  await page.getByRole('button', { name: '2026-09-22 내역 추가', exact: true }).click();
  const chooser = page.getByRole('dialog', { name: '기록할 가계부 선택', exact: true });
  await expect(chooser).toBeVisible();
  await expect(newForm(page)).not.toBeVisible();
  await selectChoice(chooser.getByRole('combobox', { name: '원본 가계부', exact: true }), child.id);
  await chooser.getByRole('button', { name: '이 가계부에 기록', exact: true }).click();
  const form = newForm(page);
  await expect(form).toContainText(`${child.name}에 기록해요`);
  await expect(form.getByLabel('날짜', { exact: true })).toHaveAttribute(
    'data-value',
    '2026-09-22',
  );
  await form.getByLabel('내용', { exact: true }).fill('전체 달력에서 하위에 기록');
  await form.getByLabel('금액', { exact: true }).fill('987');
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(form).not.toBeVisible();
  const result = await snapshot(page);
  expect(
    result.transactions.filter((entry) => entry.description === '전체 달력에서 하위에 기록'),
  ).toEqual([expect.objectContaining({ ledgerId: child.id, date: '2026-09-22', amount: 987 })]);
  expect(result.transactions.some((entry) => entry.ledgerId === '__all__')).toBe(false);
});

test('a leap-year calendar fits 390px and 320px with keyboard date entry and mobile day details', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  const ledger = await fixtureLedger(page, '윤년 모바일 달력 검증');
  const description = '모바일 달력 윤년 검증을 위한 아주 긴 공동 지출 내역';
  await fixtureEntry(page, ledger.id, description, '2028-02-29', 4567);
  await page.reload();
  await openLedger(page, ledger.name);
  await chooseMonth(page.getByLabel('조회 월', { exact: true }), '2028-02');
  await calendar(page);
  await expect(page.getByRole('button', { name: /^2028-02-\d{2} 내역 추가$/ })).toHaveCount(29);
  await expect(page.getByRole('button', { name: '2028-02-30 내역 추가', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: '2028-02-31 내역 추가', exact: true })).toHaveCount(
    0,
  );
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Calendar at ${width}px`,
    ).toBe(true);
    const date = page.getByRole('button', { name: '2028-02-28 내역 추가', exact: true });
    await date.focus();
    await date.press('Enter');
    await expect(newForm(page).getByLabel('날짜', { exact: true })).toHaveAttribute(
      'data-value',
      '2028-02-28',
    );
    await newForm(page).getByRole('button', { name: '닫기', exact: true }).last().click();
    await page.getByRole('button', { name: '2028-02-29 내역 1건 보기', exact: true }).click();
    const details = page.getByRole('dialog', { name: '2월 29일 내역', exact: true });
    await expect(details).toBeVisible();
    await expect(details.getByLabel('지출 4,567원', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Day details at ${width}px`,
    ).toBe(true);
    await details.getByRole('button', { name: `${description} 내역 열기`, exact: true }).click();
    await expect(details).not.toBeVisible();
    const editor = page.getByRole('dialog', { name: '내역 수정', exact: true });
    await expect(editor.getByLabel('날짜', { exact: true })).toHaveAttribute(
      'data-value',
      '2028-02-29',
    );
    await expect(editor.getByLabel('내용', { exact: true })).toHaveValue(description);
    await editor.getByRole('button', { name: '닫기', exact: true }).last().click();
  }
  const state = await snapshot(page);
  const archived = await page.request.patch(`/api/ledgers/${ledger.id}`, {
    data: {
      mutationId: crypto.randomUUID(),
      expectedVersion: state.ledgers.find((item) => item.id === ledger.id)!.version,
      expectedHierarchyVersion: state.hierarchyVersion,
      archived: true,
    },
  });
  expect(archived.status(), await archived.text()).toBe(200);
  await expect(
    page.getByRole('button', { name: '2028-02-28 내역 추가', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: '내역 추가', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});
