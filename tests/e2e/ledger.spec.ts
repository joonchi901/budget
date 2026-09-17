import { chooseDate, chooseMonth, selectChoice } from './helpers/controls';
import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Bootstrap } from '../../src/shared/types';

async function login(page: Page, user: '나' | '와이프') {
  await page.goto('/');
  await page.getByRole('button', { name: `${user}로 시작하기` }).click();
  await expect(page.getByRole('heading', { name: '우리의 일상' })).toBeVisible();
  await chooseMonth(page.getByLabel('조회 월'), '2026-09');
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
    const baseline: Bootstrap = await (await first.request.get('/api/bootstrap')).json();
    const checkingBefore = baseline.assets.find((asset) => asset.id === 'checking')!.balance;
    const reserveBefore = baseline.assets.find((asset) => asset.id === 'reserve')!.balance;
    const balanceText = (amount: number) => `${amount.toLocaleString('ko-KR')}원`;
    await first.getByRole('button', { name: '가계부 추가' }).click();
    await first.getByLabel('가계부 이름').fill('우리의 테스트 여행');
    await first.getByLabel('전체 예산 (원)').fill('300000');
    await first.getByRole('button', { name: '가계부 만들기', exact: true }).click();
    await expect(first.getByRole('heading', { name: '우리의 테스트 여행' })).toBeVisible();
    await first.getByRole('button', { name: '내역 추가', exact: true }).click();
    const form = first.getByRole('dialog', { name: '새 내역' });
    await form.getByLabel('금액', { exact: true }).fill('27000');
    await form.getByLabel('내용', { exact: true }).fill('여행 중 저녁 식사');
    await chooseDate(form.getByLabel('날짜', { exact: true }), '2026-09-16');
    await form.getByRole('button', { name: '상세 태그 선택', exact: true }).click();
    await form.getByRole('option', { name: '여행', exact: true }).click();
    await form.getByRole('button', { name: '옵션 선택 닫기', exact: true }).click();
    await form.getByRole('button', { name: '자산 배분 추가', exact: true }).click();
    await selectChoice(
      form.getByRole('combobox', { name: '출금 자산 1', exact: true }),
      'checking',
    );
    await form.getByRole('button', { name: '저장', exact: true }).click();
    await expect(form).not.toBeVisible();
    const row = second.getByRole('row').filter({ hasText: '여행 중 저녁 식사' });
    await expect(row).toBeVisible();
    await expect(
      row.getByRole('button', { name: '여행 중 저녁 식사 원본 가계부 열기' }),
    ).toBeVisible();
    await expect(row.getByRole('button', { name: '여행 중 저녁 식사 수정' })).toHaveCount(0);
    await second.getByRole('button', { name: '자산', exact: true }).click();
    await expect(second.getByTestId('asset-checking')).toHaveText(
      balanceText(checkingBefore - 27000),
    );
    await expect(second.getByTestId('asset-reserve')).toHaveText(balanceText(reserveBefore));
    await first.getByRole('button', { name: '우리의 테스트 여행 관리 메뉴', exact: true }).click();
    await first.getByRole('button', { name: '우리의 테스트 여행 위치 변경', exact: true }).click();
    await selectChoice(
      first.getByRole('dialog').getByRole('combobox', { name: '상위 가계부', exact: true }),
      '',
    );
    await first
      .getByRole('dialog')
      .getByRole('button', { name: '이 위치로 이동', exact: true })
      .click();
    await expect(first.getByRole('dialog')).toHaveCount(0);
    await second.getByRole('button', { name: '가계부', exact: true }).click();
    await expect(second.getByRole('row').filter({ hasText: '여행 중 저녁 식사' })).toHaveCount(0);
    await first.getByRole('button', { name: '우리의 테스트 여행 관리 메뉴', exact: true }).click();
    await first.getByRole('button', { name: '우리의 테스트 여행 위치 변경', exact: true }).click();
    await selectChoice(
      first.getByRole('dialog').getByRole('combobox', { name: '상위 가계부', exact: true }),
      'main',
    );
    await first
      .getByRole('dialog')
      .getByRole('button', { name: '이 위치로 이동', exact: true })
      .click();
    await expect(first.getByRole('dialog')).toHaveCount(0);
    await expect(second.getByRole('row').filter({ hasText: '여행 중 저녁 식사' })).toHaveCount(1);
    await second.getByRole('button', { name: '자산', exact: true }).click();
    await expect(second.getByTestId('asset-checking')).toHaveText(
      balanceText(checkingBefore - 27000),
    );
    await second.getByRole('button', { name: '가계부', exact: true }).click();
    await second.getByRole('button', { name: '여행 중 저녁 식사 원본 가계부 열기' }).click();
    await expect(second.getByRole('heading', { name: '우리의 테스트 여행' })).toBeVisible();
    await first.getByRole('button', { name: '여행 중 저녁 식사 수정' }).click();
    const editing = first.getByRole('dialog', { name: '내역 수정', exact: true });
    await editing.getByLabel('날짜', { exact: true }).click();
    await expect(second.getByText('나 · 날짜 편집 중', { exact: true })).toBeVisible();
    await editing.getByRole('gridcell', { name: '2026-09-16', exact: true }).focus();
    await first.keyboard.press('ArrowRight');
    await expect(editing.getByRole('gridcell', { name: '2026-09-17', exact: true })).toBeFocused();
    await expect(second.getByText('나 · 날짜 편집 중', { exact: true })).toBeVisible();
    await first.keyboard.press('Escape');
    const payment = editing.getByRole('combobox', { name: '결제수단', exact: true });
    await payment.click();
    await expect(second.getByText('나 · 결제수단 편집 중', { exact: true })).toBeVisible();
    await first.keyboard.press('Escape');
    await first.getByRole('dialog').getByLabel('금액', { exact: true }).fill('28000');
    await first.getByRole('dialog').getByLabel('배분 금액 1', { exact: true }).fill('28000');
    await expect(second.getByText('나 · 배분 금액 편집 중')).toBeVisible();
    await second.getByRole('button', { name: '여행 중 저녁 식사 수정' }).click();
    await second.getByRole('dialog').getByLabel('금액', { exact: true }).fill('29000');
    await second.getByRole('dialog').getByLabel('배분 금액 1', { exact: true }).fill('29000');
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
    await first.getByRole('dialog').getByLabel('배분 금액 1', { exact: true }).fill('30000');
    await first.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
    await b.setOffline(false);
    await expect(second.getByRole('row').filter({ hasText: '여행 중 저녁 식사' })).toContainText(
      '30,000',
    );
    await second.reload();
    await chooseMonth(second.getByLabel('조회 월'), '2026-09');
    await second.getByRole('button', { name: '자산', exact: true }).click();
    await expect(second.getByTestId('asset-checking')).toHaveText(
      balanceText(checkingBefore - 30000),
    );
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
  await chooseDate(dialog.getByLabel('날짜', { exact: true }), '2026-09-16');
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
  await chooseMonth(page.getByLabel('조회 월'), '2026-10');
  await expect(
    page.getByRole('region', { name: '카드 사용 요약' }).getByText('2026년 10월'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '이번 달 납부 예정', exact: true })).toBeVisible();
  await page.screenshot({ path: 'output/playwright/cards-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '통계', exact: true }).click();
  await page.locator('.analysis-extra-filters summary').click();
  await page.getByRole('button', { name: '# 함께', exact: true }).click();
  await expect(page.getByText('선택한 기록의 지출')).toBeVisible();
  await page.getByRole('button', { name: '태그 설정', exact: true }).click();
  await page.screenshot({ path: 'output/playwright/tags-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '가계부', exact: true }).click();
  await expect(page.getByRole('heading', { name: '우리의 일상' })).toBeVisible();
  await chooseMonth(page.getByLabel('조회 월'), '2026-09');
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
      ['태그 설정', '우리만의 태그'],
      ['계획 · 일정', '계획과 일정'],
      ['데이터 관리', '데이터 관리'],
      ['가계부', '우리의 일상'],
    ]) {
      if (['태그 설정', '계획 · 일정', '데이터 관리'].includes(menu)) {
        await page.getByRole('button', { name: '더보기', exact: true }).click();
      }
      await page.getByRole('button', { name: menu, exact: true }).click();
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${menu} at ${width}px`,
      ).toBe(true);
      if (width === 390 && menu === '태그 설정')
        await page.screenshot({ path: 'output/playwright/tags-mobile.png', fullPage: true });
      if (width === 390 && menu === '자산')
        await page.screenshot({ path: 'output/playwright/assets-mobile.png', fullPage: true });
    }
  }
  expect(errors).toEqual([]);
});

test('custom tag types, inline options and archived history are shared', async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const first = await a.newPage();
  const second = await b.newPage();
  try {
    await login(first, '나');
    await login(second, '와이프');
    await first.getByRole('button', { name: '태그 설정', exact: true }).click();
    await first.getByRole('button', { name: '유형 만들기', exact: true }).click();
    await first.getByLabel('유형 이름').fill('이동수단');
    await selectChoice(first.getByLabel('선택 방식'), 'single');
    await first.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
    await expect(first.getByRole('dialog')).toHaveCount(0);
    await second.getByRole('button', { name: '내역 추가', exact: true }).click();
    const form = second.getByRole('dialog');
    await expect(form.getByRole('button', { name: '이동수단 선택', exact: true })).toBeVisible();
    await form.getByLabel('내용', { exact: true }).fill('태그 커스텀 열차');
    await form.getByLabel('금액', { exact: true }).fill('18000');
    await chooseDate(form.getByLabel('날짜', { exact: true }), '2026-09-16');
    await form.getByRole('button', { name: '이동수단 선택', exact: true }).click();
    let droppedTag = false;
    await second.route('**/api/tags', async (route) => {
      if (!droppedTag && route.request().method() === 'POST') {
        droppedTag = true;
        await route.fetch();
        await route.abort('failed');
      } else await route.continue();
    });
    await form.getByLabel('이동수단 옵션 검색').fill('KTX');
    await form.getByRole('button', { name: '“KTX” 만들기', exact: true }).click();
    await expect(form.getByRole('button', { name: '생성 결과 다시 확인' })).toBeVisible();
    await expect(form.getByRole('button', { name: '저장', exact: true })).toBeDisabled();
    await form.getByRole('button', { name: '생성 결과 다시 확인' }).click();
    await expect(form.getByRole('button', { name: '이동수단 선택', exact: true })).toContainText(
      'KTX',
    );
    await form.getByRole('button', { name: '저장', exact: true }).click();
    await expect(form).toHaveCount(0);
    await first
      .getByRole('navigation', { name: '태그 유형 목록' })
      .getByRole('button', { name: /이동수단/ })
      .click();
    await expect(first.getByRole('button', { name: 'KTX 옵션 수정' })).toBeVisible();
    await first.getByRole('button', { name: 'KTX 옵션 수정' }).click();
    await first.getByLabel('옵션 이름').fill('고속열차');
    await first.getByLabel('직접 색상 선택').fill('#8262a0');
    await first.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
    await expect(second.getByRole('row').filter({ hasText: '태그 커스텀 열차' })).toContainText(
      '고속열차',
    );
    await first.getByRole('button', { name: '고속열차 옵션 보관' }).click();
    await expect(first.getByRole('button', { name: '고속열차 옵션 보관' })).toHaveCount(0);
    await second.getByRole('button', { name: '태그 커스텀 열차 수정' }).click();
    await expect(form.getByRole('button', { name: '이동수단 선택', exact: true })).toContainText(
      '보관됨',
    );
    await form.getByLabel('내용', { exact: true }).fill('태그 커스텀 열차 수정');
    await form.getByRole('button', { name: '저장', exact: true }).click();
    await expect(form).toHaveCount(0);
    await second.getByRole('button', { name: '통계', exact: true }).click();
    await second.locator('.analysis-extra-filters summary').click();
    await second.getByRole('button', { name: '# 고속열차 (보관)', exact: true }).click();
    await expect(second.locator('.stat').filter({ hasText: '선택한 기록의 지출' })).toContainText(
      '18,000',
    );
    await second.getByRole('button', { name: '분류별', exact: true }).click();
    await selectChoice(second.getByLabel('집계할 태그 유형'), { label: '이동수단' });
    const tagSummary = second.locator('section').filter({
      has: second.getByRole('heading', { name: '어디에 얼마나 썼을까요?', exact: true }),
    });
    const trainSummary = tagSummary.getByRole('row').filter({
      has: second.getByRole('cell', { name: '고속열차', exact: true }),
    });
    await expect(trainSummary.getByRole('cell').nth(1)).toHaveText('1');
    await expect(trainSummary.getByRole('cell').nth(3)).toHaveText('18,000');
    await trainSummary.getByRole('button', { name: '18,000', exact: true }).click();
    const drilldown = second.getByRole('dialog', { name: '고속열차 지출', exact: true });
    await expect(
      drilldown.getByRole('row').filter({ hasText: '태그 커스텀 열차 수정' }),
    ).toContainText('18,000');
    await drilldown.getByRole('button', { name: '닫기', exact: true }).click();
  } finally {
    await Promise.all([a.close(), b.close()]);
  }
});

test('income allocation, savings transfers and balance correction preserve one ledger record', async ({
  page,
}) => {
  await login(page, '나');
  await page.getByRole('button', { name: '자산', exact: true }).click();
  async function createAsset(name: string, track: boolean) {
    await page.getByRole('button', { name: '자산 추가', exact: true }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('자산 이름').fill(name);
    await chooseDate(form.getByLabel('최초 잔액 기준일'), '2026-01-01');
    if (track) await form.getByLabel('이 자산의 유입·인출을 저축으로 집계').check();
    await form.getByRole('button', { name: '저장', exact: true }).click();
    await expect(form).toHaveCount(0);
  }
  await createAsset('테스트 생활자산', false);
  await createAsset('테스트 저축 A', true);
  await createAsset('테스트 저축 B', true);
  let data = await (await page.request.get('/api/bootstrap')).json();
  const normal = data.assets.find((a: { name: string }) => a.name === '테스트 생활자산');
  const saved = data.assets.find((a: { name: string }) => a.name === '테스트 저축 A');
  const other = data.assets.find((a: { name: string }) => a.name === '테스트 저축 B');
  await page.getByRole('button', { name: '가계부', exact: true }).click();
  await page.getByRole('button', { name: '내역 추가', exact: true }).click();
  let form = page.getByRole('dialog');
  await form.getByRole('button', { name: '수입', exact: true }).click();
  await expect(form.getByRole('button', { name: '저축', exact: true })).toHaveCount(0);
  await form.getByLabel('내용', { exact: true }).fill('나눠 넣는 급여');
  await form.getByLabel('금액', { exact: true }).fill('3000000');
  await chooseDate(form.getByLabel('날짜', { exact: true }), '2026-09-16');
  await form.getByRole('button', { name: '자산 배분 추가' }).click();
  await selectChoice(form.getByLabel('입금 자산 1'), normal.id);
  await form.getByLabel('배분 금액 1').fill('2500000');
  await form.getByRole('button', { name: '자산 배분 추가' }).click();
  await selectChoice(form.getByLabel('입금 자산 2'), saved.id);
  await form.getByLabel('배분 금액 2').fill('500000');
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(form).toHaveCount(0);
  await page.getByRole('button', { name: '자산', exact: true }).click();
  await expect(page.getByTestId(`asset-${normal.id}`)).toHaveText('2,500,000원');
  await expect(page.getByTestId(`asset-${saved.id}`)).toHaveText('500,000원');
  await expect(page.locator('.stat').filter({ hasText: '순저축' })).toContainText('500,000');
  async function transfer(from: string, to: string, amount: string, description: string) {
    await page.getByRole('button', { name: '자산 이동', exact: true }).click();
    form = page.getByRole('dialog');
    await selectChoice(form.getByLabel('보내는 자산'), from);
    await selectChoice(form.getByLabel('받는 자산'), to);
    await form.getByLabel('이동 금액').fill(amount);
    await chooseDate(form.getByLabel('날짜'), '2026-09-16');
    await form.getByLabel('이동 내용').fill(description);
    await form.getByRole('button', { name: '저장', exact: true }).click();
  }
  let dropped = false;
  await page.route('**/api/asset-operations', async (route) => {
    if (!dropped && route.request().method() === 'POST') {
      dropped = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await transfer(saved.id, other.id, '200000', '저축끼리 이동');
  await expect(form.getByRole('button', { name: '저장 결과 다시 확인' })).toBeVisible();
  await form.getByRole('button', { name: '저장 결과 다시 확인' }).click();
  await expect(form).toHaveCount(0);
  await expect(page.locator('.stat').filter({ hasText: '순저축' })).toContainText('500,000');
  await expect(page.locator('.stat').filter({ hasText: '저축 유입' })).toContainText('500,000');
  await expect(page.locator('.stat').filter({ hasText: '저축 인출' })).toContainText('0');
  await transfer(other.id, normal.id, '50000', '저축 인출');
  await expect(form).toHaveCount(0);
  await expect(page.locator('.stat').filter({ hasText: '순저축' })).toContainText('450,000');
  await page
    .locator('.asset-card')
    .filter({ hasText: '테스트 저축 B' })
    .getByRole('button', { name: '현재 잔액 맞추기' })
    .click();
  form = page.getByRole('dialog');
  await form.getByLabel('맞출 잔액').fill('123456');
  await chooseDate(form.getByLabel('날짜'), '2026-09-16');
  await form.getByLabel('조정 사유').fill('실제 잔액 확인');
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByTestId(`asset-${other.id}`)).toHaveText('123,456원');
  await expect(page.locator('.stat').filter({ hasText: '순저축' })).toContainText('450,000');
  await page.getByRole('button', { name: '실제 잔액 확인 취소' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '변동 취소 확인' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId(`asset-${other.id}`)).toHaveText('150,000원');
  data = await (await page.request.get('/api/bootstrap')).json();
  expect(
    data.transactions.filter((t: { description: string }) => t.description === '나눠 넣는 급여'),
  ).toHaveLength(1);
  expect(
    data.transactions.some((t: { description: string }) =>
      ['저축끼리 이동', '저축 인출', '실제 잔액 확인'].includes(t.description),
    ),
  ).toBe(false);
  expect(
    data.assetOperations.filter(
      (op: { description: string }) => op.description === '저축끼리 이동',
    ),
  ).toHaveLength(1);
});
