import { openGlobalView, openRoom, openRoomTab } from './helpers/navigation';
import { chooseDate, chooseMonth, selectChoice } from './helpers/controls';
import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const screens = [
  { key: 'ledger', label: '가계부', title: '우리의 일상' },
  { key: 'assets', label: '자산', title: '우리의 자산' },
  { key: 'payments', label: '카드 · 통장', title: '카드와 통장' },
  { key: 'analytics', label: '통계', title: '우리의 일상' },
  { key: 'planning', label: '계획 · 일정', title: '우리의 일상' },
  { key: 'tags', label: '태그 설정', title: '우리만의 태그' },
  { key: 'data', label: '데이터 관리', title: '데이터 관리' },
] as const;
type Screen = (typeof screens)[number];

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page), 'screens must not raise browser exceptions').toEqual([]);
});

async function login(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '나로 시작하기' })).toBeVisible();
  await expect(page.getByRole('button', { name: '나로 시작하기' })).toBeInViewport({ ratio: 1 });
  await fitsViewport(page, '로그인');
  const width = page.viewportSize()?.width ?? 1440;
  await capture(page, width > 760 ? 'desktop-login' : `mobile-${width}-login`);
  await page.getByRole('button', { name: '나로 시작하기' }).click();
  await openRoom(page);
  await expect(
    page.getByRole('heading', { level: 1, name: '우리의 일상', exact: true }),
  ).toBeVisible();
  await chooseMonth(page.getByLabel('조회 월', { exact: true }), '2026-09');
  await expect(page.getByTestId('connection')).toHaveText('실시간 연결됨');
}

async function fitsViewport(page: Page, context: string) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${context}: the document must fit without horizontal page scrolling`,
  ).toBe(true);
}

async function capture(page: Page, suffix: string) {
  await mkdir('output/playwright', { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  const assets = await page.locator('img[src^="/brand/"]').evaluateAll(async (images) => {
    return Promise.all(
      images.map(async (element) => {
        const image = element as HTMLImageElement;
        try {
          await image.decode();
        } catch {
          /* Report the failed URL below. */
        }
        return { src: image.getAttribute('src'), loaded: image.complete && image.naturalWidth > 0 };
      }),
    );
  });
  expect(assets.length, `${suffix}: brand assets should be present`).toBeGreaterThan(0);
  expect(
    assets.filter((asset) => !asset.loaded),
    `${suffix}: SVG assets must load`,
  ).toEqual([]);
  await page.screenshot({ path: `output/playwright/design-${suffix}.png`, animations: 'disabled' });
}

async function openScreen(page: Page, screen: Screen, _mobile: boolean) {
  if (screen.key === 'ledger' || screen.key === 'analytics' || screen.key === 'planning') {
    await openRoom(page);
    await openRoomTab(
      page,
      screen.key === 'analytics' ? '통계' : screen.key === 'planning' ? '계획 · 일정' : '목록',
    );
  } else {
    await openGlobalView(page, screen.label);
  }
  await expect(
    page.getByRole('heading', { level: 1, name: new RegExp(screen.title) }),
  ).toBeVisible();
  if (screen.key === 'data') await expect(page.getByLabel('원본 가계부 XLSX')).toBeVisible();
  await fitsViewport(page, screen.label);
  await expect(
    page.locator(
      'select:visible, input[type="month"]:visible, input[type="date"]:visible, input[type="color"]:visible, [title]:visible',
    ),
  ).toHaveCount(0);
}

async function openTransactionDraft(page: Page, suffix?: string) {
  await page.getByRole('button', { name: '내역 추가', exact: true }).click();
  const form = page.getByRole('dialog', { name: '새 내역', exact: true });
  await form.getByLabel('내용', { exact: true }).fill('화면 확인용 초안');
  await form.getByLabel('금액', { exact: true }).fill('12340');
  await chooseDate(form.getByLabel('날짜', { exact: true }), '2026-09-16');
  await fitsViewport(page, '새 내역');
  expect(
    await form.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return (
        bounds.left >= 0 &&
        bounds.right <= innerWidth &&
        element.scrollWidth <= element.clientWidth &&
        (innerWidth > 760 || Math.abs(bounds.width - innerWidth) <= 1)
      );
    }),
  ).toBe(true);
  if (suffix) await capture(page, `${suffix}-transaction`);
  await form.getByRole('button', { name: '닫기', exact: true }).last().click();
  await expect(form).not.toBeVisible();
}

test('desktop screens remain reachable and data tabs preserve file selections, mappings and draft text', async ({
  page,
}) => {
  await login(page);
  await expect(page.getByRole('navigation', { name: '주 메뉴', exact: true })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: '모바일 주 메뉴', exact: true }),
  ).not.toBeVisible();
  for (const screen of screens) {
    await openScreen(page, screen, false);
    await capture(page, `desktop-${screen.key}`);
    if (screen.key === 'ledger') await openTransactionDraft(page, 'desktop');
  }

  await page.getByRole('tab', { name: 'CSV 가져오기', exact: true }).click();
  const csv = page.getByRole('tabpanel', { name: 'CSV 가져오기', exact: true });
  await csv.getByLabel('CSV 파일', { exact: true }).setInputFiles({
    name: 'design-draft.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '원본 행 ID,날짜,내역,내용,금액,유형,결제수단\nui-1,2026-09-16,합성 초안,합성 초안,12340,expense,현금\n',
    ),
  });
  await csv.getByRole('textbox', { name: /^원본 자료 ID/ }).fill('디자인 검증 원본 식별자');
  await selectChoice(csv.getByRole('combobox', { name: '내역', exact: true }), '내용');

  await page.getByRole('tab', { name: '백업·복원', exact: true }).click();
  const backup = page.getByRole('tabpanel', { name: '백업·복원', exact: true });
  const response = await page.request.get('/api/data/backup');
  expect(response.ok()).toBe(true);
  await backup.getByLabel('복원할 JSON 파일', { exact: true }).setInputFiles({
    name: 'design-synthetic-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(await response.json())),
  });
  await expect(backup.getByText('design-synthetic-backup.json', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '원본 검토함', exact: true }).click();
  await expect(page.getByRole('heading', { name: '원본 자료 검토함', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'CSV 가져오기', exact: true }).click();
  await expect(csv.getByRole('textbox', { name: /^원본 자료 ID/ })).toHaveValue(
    '디자인 검증 원본 식별자',
  );
  await expect(csv.getByRole('combobox', { name: '내역', exact: true })).toHaveAttribute(
    'data-value',
    '내용',
  );
  expect(
    await csv
      .getByLabel('CSV 파일', { exact: true })
      .evaluate((input) => (input as HTMLInputElement).files?.[0]?.name),
  ).toBe('design-draft.csv');
  await page.getByRole('tab', { name: '백업·복원', exact: true }).click();
  await expect(backup.getByText('design-synthetic-backup.json', { exact: true })).toBeVisible();
  expect(
    await backup
      .getByLabel('복원할 JSON 파일', { exact: true })
      .evaluate((input) => (input as HTMLInputElement).files?.[0]?.name),
  ).toBe('design-synthetic-backup.json');
  await expect(backup.getByRole('button', { name: '복원 내용 검사', exact: true })).toBeEnabled();
});

for (const width of [320, 390]) {
  test(`mobile ${width}px keeps all screens accessible and restores focus after closing the menu`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await login(page);
    await expect(page.getByRole('navigation', { name: '주 메뉴', exact: true })).not.toBeVisible();
    const mobileNav = page.getByRole('navigation', { name: '모바일 주 메뉴', exact: true });
    await expect(mobileNav).toBeVisible();
    const more = mobileNav.getByRole('button', { name: '더보기', exact: true });
    await more.focus();
    await more.press('Enter');
    const menu = page.getByRole('dialog', { name: '전체 메뉴', exact: true });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
    await expect(menu.getByRole('button', { name: '가계부 추가', exact: true })).toBeVisible();
    await fitsViewport(page, `${width}px 전체 메뉴`);
    await page.keyboard.press('Escape');
    await expect(menu).not.toBeVisible();
    await expect(more).toBeFocused();

    for (const screen of screens) {
      await openScreen(page, screen, true);
      if (width === 390) await capture(page, `mobile-${screen.key}`);
      if (screen.key === 'ledger')
        await openTransactionDraft(page, width === 390 ? 'mobile' : undefined);
    }

    await more.click();
    await menu.getByRole('button', { name: '제주에서 보내는 가을', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: '제주에서 보내는 가을', exact: true }),
    ).toBeVisible();
    await expect(menu).not.toBeVisible();
    await fitsViewport(page, `${width}px 목적 가계부`);
    await more.click();
    await menu.getByRole('button', { name: '가계부 추가', exact: true }).click();
    const ledgerForm = page.getByRole('dialog', { name: '가계부 만들기', exact: true });
    await expect(ledgerForm).toBeVisible();
    await expect(ledgerForm.getByLabel('가계부 이름', { exact: true })).toBeEditable();
    await fitsViewport(page, `${width}px 목적 가계부 추가`);
    await page.keyboard.press('Escape');
    await expect(ledgerForm).not.toBeVisible();
  });
}
