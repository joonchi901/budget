import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Bootstrap, Ledger } from '../../src/shared/types';
import { chooseDate, chooseMonth } from './helpers/controls';
import { openGlobalView, openRoom, openRoomTab } from './helpers/navigation';

async function capture(page: Page, name: string) {
  await mkdir('output/playwright', { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `output/playwright/rooms-${name}.png`, animations: 'disabled' });
}

async function loginHub(page: Page, user: '나' | '와이프' = '나') {
  await page.goto('/');
  await page.getByRole('button', { name: `${user}로 시작하기` }).click();
  await expect(page.getByRole('region', { name: '가계부 방 목록', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: '가계부', exact: true })).toBeVisible();
  await expect(page.getByTestId('connection')).toHaveText('실시간 연결됨');
}

async function snapshot(page: Page): Promise<Bootstrap> {
  const response = await page.request.get('/api/bootstrap');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function fixtureLedger(page: Page, name: string, parentId: string | null = null) {
  const state = await snapshot(page);
  const response = await page.request.post('/api/ledgers', {
    data: {
      mutationId: crypto.randomUUID(),
      expectedHierarchyVersion: state.hierarchyVersion,
      name,
      parentId,
      budget: 0,
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as { ledger: Ledger }).ledger;
}

test('the room list opens first and admin creation enters an independent room with scoped views', async ({
  page,
}) => {
  await loginHub(page);
  await capture(page, 'desktop-hub');
  await expect(page.getByRole('button', { name: '내역 추가', exact: true })).toHaveCount(0);
  const name = `함께 기록할 새 방 ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByRole('button', { name: '새 가계부', exact: true }).click();
  const create = page.getByRole('dialog', { name: '가계부 만들기', exact: true });
  await expect(create.getByRole('combobox', { name: '상위 가계부', exact: true })).toHaveAttribute(
    'data-value',
    '',
  );
  await create.getByLabel('가계부 이름', { exact: true }).fill(name);
  await create.getByRole('button', { name: '가계부 만들기', exact: true }).click();
  await expect(create).not.toBeVisible();
  const state = await snapshot(page);
  const ledger = state.ledgers.find((item) => item.name === name)!;
  expect(ledger.parentId).toBeNull();
  await expect(
    page.getByRole('region', { name: '현재 가계부' }).getByRole('heading', { level: 1 }),
  ).toHaveText(name);
  await chooseMonth(page.getByLabel('조회 월', { exact: true }), '2026-09');
  await page.getByRole('button', { name: '내역 추가', exact: true }).click();
  const form = page.getByRole('dialog', { name: '새 내역', exact: true });
  await form.getByLabel('내용', { exact: true }).fill('새 방에만 저장되는 기록');
  await form.getByLabel('금액', { exact: true }).fill('3210');
  await chooseDate(form.getByLabel('날짜', { exact: true }), '2026-09-17');
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(form).not.toBeVisible();
  expect(
    (await snapshot(page)).transactions.find(
      (item) => item.description === '새 방에만 저장되는 기록',
    )?.ledgerId,
  ).toBe(ledger.id);
  await capture(page, 'desktop-room');
  await openRoomTab(page, '통계');
  await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '분석할 가계부', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('분석 가계부', { exact: true })).toContainText(name);
  await expect(
    page.getByRole('region', { name: '분석 조회 조건', exact: true }).getByRole('status'),
  ).toHaveText('조회 결과 1건');
  await openRoomTab(page, '계획 · 일정');
  await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
  await expect(page.getByLabel('계획 가계부', { exact: true })).toContainText(name);
  await expect(page.getByRole('combobox', { name: '계획 가계부', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '예산 추가', exact: true }).click();
  const plan = page.getByRole('dialog', { name: '예산 추가', exact: true });
  await plan.getByLabel('계획 이름', { exact: true }).fill('새 방의 예산');
  await plan.getByLabel('예산 금액', { exact: true }).fill('10000');
  await plan.getByRole('button', { name: '계획 저장', exact: true }).click();
  await expect(plan).not.toBeVisible();
  expect(
    (await snapshot(page)).plans?.find((item) => item.title === '새 방의 예산')?.ledgerId,
  ).toBe(ledger.id);
  await openRoom(page);
  await openRoomTab(page, '목록');
  await expect(page.getByRole('row').filter({ hasText: '새 방에만 저장되는 기록' })).toHaveCount(0);
});

test('creating a dated historical room opens its own month and calendar immediately', async ({
  page,
}) => {
  await loginHub(page);
  await openRoom(page);
  await chooseMonth(page.getByLabel('조회 월', { exact: true }), '2026-09');
  await openGlobalView(page, '가계부');
  await page.getByRole('button', { name: '새 가계부', exact: true }).click();
  const form = page.getByRole('dialog', { name: '가계부 만들기', exact: true });
  const name = `지난 1월의 방 ${crypto.randomUUID().slice(0, 8)}`;
  await form.getByLabel('가계부 이름', { exact: true }).fill(name);
  await form.getByLabel('전체 예산 (원)', { exact: true }).fill('0');
  await chooseDate(form.getByLabel('시작일 (선택)', { exact: true }), '2026-01-01');
  await chooseDate(form.getByLabel('종료일 (선택)', { exact: true }), '2026-01-31');
  await form.getByRole('button', { name: '가계부 만들기', exact: true }).click();
  await expect(form).not.toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
  await expect(page.getByLabel('조회 월', { exact: true })).toHaveAttribute(
    'data-value',
    '2026-01',
  );
  await expect(page.getByRole('combobox', { name: '조회 기간', exact: true })).toHaveAttribute(
    'data-value',
    'period',
  );
  await openRoomTab(page, '캘린더');
  await expect(
    page.getByRole('button', { name: '2026-01-15 내역 추가', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/month=2026-01/);
});

test('nested rooms are searchable, retain their parent context and survive calendar deep links and browser history', async ({
  page,
}) => {
  await loginHub(page);
  const suffix = crypto.randomUUID().slice(0, 8);
  const parent = await fixtureLedger(page, `여행 기록 ${suffix}`);
  const child = await fixtureLedger(page, `여행 1일차 ${suffix}`, parent.id);
  await page.reload();
  const rooms = page.getByRole('region', { name: '가계부 방 목록', exact: true });
  await expect(
    rooms.getByRole('button', { name: `${child.name} 가계부 열기`, exact: true }),
  ).toHaveCount(0);
  await openRoom(page, child.name);
  const context = page.getByRole('region', { name: '현재 가계부', exact: true });
  await expect(context).toContainText(parent.name);
  await chooseMonth(page.getByLabel('조회 월', { exact: true }), '2026-09');
  await openRoomTab(page, '캘린더');
  await expect(page).toHaveURL(new RegExp(`ledger=${child.id}.*view=calendar`));
  const calendarUrl = page.url();
  await page.reload();
  await expect(context.getByRole('heading', { level: 1 })).toHaveText(child.name);
  await expect(context.getByRole('button', { name: '캘린더', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await context.getByRole('button', { name: '가계부 목록', exact: true }).click();
  await expect(rooms).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(calendarUrl);
  await expect(context.getByRole('heading', { level: 1 })).toHaveText(child.name);
  await openRoom(page, parent.name);
  await expect(context.getByRole('button', { name: '목록', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const children = page.locator('details.room-child-ledgers');
  await children.locator('summary').click();
  await children.getByRole('button', { name: child.name, exact: true }).click();
  await expect(context.getByRole('heading', { level: 1 })).toHaveText(child.name);
  await expect(context.getByRole('button', { name: '캘린더', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Switching from an expanded parent must replace its children panel, not leave stale DOM.
  await expect(children).toHaveCount(1);
  await expect(children).toHaveJSProperty('open', false);
  await expect(children.locator('summary')).toContainText('0개');
  await expect(
    children.locator('.room-child-list > button').filter({ hasText: child.name }),
  ).toHaveCount(0);
  for (const tab of ['목록', '통계', '계획 · 일정', '목록'] as const) {
    await openRoomTab(page, tab);
    await expect(context.getByRole('heading', { level: 1 })).toHaveText(child.name);
    await expect(children).toHaveCount(1);
    await expect(children).toHaveJSProperty('open', false);
    await expect(children.locator('summary')).toContainText('0개');
    await expect(page.locator('.transactions-panel')).toHaveCount(tab === '목록' ? 1 : 0);
    await expect(page.locator('.analysis-page')).toHaveCount(tab === '통계' ? 1 : 0);
    await expect(page.locator('.planning-view')).toHaveCount(tab === '계획 · 일정' ? 1 : 0);
  }
});

test('a regular user enters shared rooms without creation or hierarchy controls', async ({
  page,
}) => {
  await loginHub(page, '와이프');
  await expect(page.getByRole('button', { name: '새 가계부', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '가계부 추가', exact: true })).toHaveCount(0);
  await openRoom(page);
  await expect(page.getByRole('button', { name: '하위 가계부 추가', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '내역 추가', exact: true })).toBeEnabled();
  await openRoomTab(page, '통계');
  await expect(
    page.getByRole('heading', { level: 1, name: '우리의 일상', exact: true }),
  ).toBeVisible();
});

for (const fallback of [false, true]) {
  test(`browser back keeps a dirty transaction in its original room and never retargets its save (${fallback ? 'history fallback' : 'navigation API'})`, async ({
    page,
  }) => {
    if (fallback)
      await page.addInitScript(() =>
        Object.defineProperty(window, 'navigation', { value: undefined, configurable: true }),
      );
    await loginHub(page);
    const room = await fixtureLedger(page, `입력 중인 방 ${crypto.randomUUID().slice(0, 8)}`);
    await page.reload();
    await openRoom(page);
    await chooseMonth(page.getByLabel('조회 월', { exact: true }), '2026-09');
    await page
      .getByRole('complementary')
      .getByRole('button', { name: room.name, exact: true })
      .click();
    const roomUrl = page.url();
    await page.getByRole('button', { name: '내역 추가', exact: true }).click();
    const form = page.getByRole('dialog', { name: '새 내역', exact: true });
    const description = `다른 방으로 바뀌지 않는 초안 ${crypto.randomUUID().slice(0, 8)}`;
    await form.getByLabel('내용', { exact: true }).fill(description);
    await form.getByLabel('금액', { exact: true }).fill('7123');
    await chooseDate(form.getByLabel('날짜', { exact: true }), '2026-09-17');
    await page.evaluate(() => history.back());
    await expect(form).toBeVisible();
    await expect(form.getByRole('alert')).toContainText(
      '입력 내용 보호를 위해 이동하지 않았어요. 저장을 마치거나 입력 창을 닫은 뒤 다시 이동해 주세요.',
    );
    await expect(page).toHaveURL(roomUrl);
    await expect(form.getByLabel('내용', { exact: true })).toHaveValue(description);
    await expect(form.getByLabel('금액', { exact: true })).toHaveValue('7123');
    expect(
      (await snapshot(page)).transactions.some((item) => item.description === description),
    ).toBe(false);
    await form.getByRole('button', { name: '닫기', exact: true }).last().click();
    await page.goBack();
    await expect(
      page.getByRole('heading', { level: 1, name: '우리의 일상', exact: true }),
    ).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(roomUrl);
    await expect(
      page.getByRole('heading', { level: 1, name: room.name, exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '내역 추가', exact: true }).click();
    await expect(form.getByLabel('내용', { exact: true })).toHaveValue(description);
    await form.getByRole('button', { name: '저장', exact: true }).click();
    await expect(form).not.toBeVisible();
    const saved = (await snapshot(page)).transactions.filter(
      (item) => item.description === description,
    );
    expect(saved).toHaveLength(1);
    expect(saved[0].ledgerId).toBe(room.id);
  });
}

test('a dirty plan blocks browser history without discarding its fields or changing its room', async ({
  page,
}) => {
  await loginHub(page);
  await openRoom(page);
  await openRoomTab(page, '계획 · 일정');
  const url = page.url();
  const before = (await snapshot(page)).plans;
  await page.getByRole('button', { name: '예산 추가', exact: true }).click();
  const form = page.getByRole('dialog', { name: '예산 추가', exact: true });
  await form.getByLabel('계획 이름', { exact: true }).fill('뒤로가기 중 보호할 계획 초안');
  await form.getByLabel('예산 금액', { exact: true }).fill('32100');
  await page.evaluate(() => history.back());
  await expect(form.getByRole('alert')).toContainText('입력 내용 보호를 위해 이동하지 않았어요.');
  await expect(page).toHaveURL(url);
  await expect(form.getByLabel('계획 이름', { exact: true })).toHaveValue(
    '뒤로가기 중 보호할 계획 초안',
  );
  await expect(form.getByLabel('예산 금액', { exact: true })).toHaveValue('32100');
  expect((await snapshot(page)).plans).toEqual(before);
  await form.getByRole('button', { name: '닫기', exact: true }).last().click();
  await page.goBack();
  await expect(
    page
      .getByRole('group', { name: '가계부 보기', exact: true })
      .getByRole('button', { name: '목록', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});

for (const width of [320, 390]) {
  test(`mobile ${width}px keeps the room and current view visible while scrolling and changing household screens`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await loginHub(page);
    await capture(page, `mobile-${width}-hub`);
    await openRoom(page);
    await chooseMonth(page.getByLabel('조회 월', { exact: true }), '2026-09');
    const context = page.getByRole('region', { name: '현재 가계부', exact: true });
    for (const tab of ['목록', '캘린더', '통계', '계획 · 일정'] as const) {
      await openRoomTab(page, tab);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(
        context.getByRole('heading', { level: 1, name: '우리의 일상', exact: true }),
      ).toBeInViewport({ ratio: 1 });
      await expect(context.getByRole('button', { name: tab, exact: true })).toBeInViewport({
        ratio: 1,
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${tab} fits ${width}px`,
      ).toBe(true);
      await capture(
        page,
        `mobile-${width}-${{ 목록: 'list', 캘린더: 'calendar', 통계: 'analytics', '계획 · 일정': 'planning' }[tab]}`,
      );
    }
    await openGlobalView(page, '자산');
    await expect(page.getByRole('heading', { name: '우리의 자산', exact: true })).toBeVisible();
    await expect(page.getByText('우리 집 공통', { exact: true }).last()).toBeVisible();
    await openRoom(page);
    await expect(
      context.getByRole('heading', { level: 1, name: '우리의 일상', exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await page
      .getByRole('navigation', { name: '모바일 주 메뉴', exact: true })
      .getByRole('button', { name: '내역 추가', exact: true })
      .click();
    await expect(page.getByRole('dialog', { name: '새 내역', exact: true })).toContainText(
      '우리의 일상',
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await context.getByRole('button', { name: '가계부 목록', exact: true }).click();
    await expect(page.getByRole('region', { name: '가계부 방 목록', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
