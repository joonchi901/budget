import { expect, test, type Page } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import type { Bootstrap } from '../../src/shared/types';
import { chooseDate } from './helpers/controls';
import { openGlobalView, openRoom } from './helpers/navigation';

// The project's webServer creates a fresh temporary D1 database with fictional seeds.
// These regressions exercise browser controls and read snapshots; none applies an import.
async function login(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /나로 시작하기/ }).click();
  await openRoom(page);
  await expect(page.getByTestId('connection')).toHaveText('실시간 연결됨');
}

async function snapshot(page: Page): Promise<Bootstrap> {
  const response = await page.request.get('/api/bootstrap');
  expect(response.ok()).toBe(true);
  return response.json();
}

function createOpener(page: Page) {
  return page.getByRole('complementary').getByRole('button', { name: '가계부 추가', exact: true });
}

function settingsOnlyWorkbook() {
  return Buffer.from(
    zipSync({
      'xl/workbook.xml': strToU8(
        '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="설정" sheetId="1" r:id="rId1"/><sheet name="1" sheetId="2" r:id="rId2"/></sheets></workbook>',
      ),
      'xl/_rels/workbook.xml.rels': strToU8(
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
      ),
      'xl/worksheets/sheet2.xml': strToU8('<worksheet><sheetData/></worksheet>'),
      'xl/worksheets/sheet1.xml': strToU8(
        '<worksheet><sheetData><row><c r="C3"><v>2026</v></c><c r="E3"><v>1</v></c><c r="G3"><v>1</v></c></row></sheetData></worksheet>',
      ),
    }),
  );
}

async function discardDraft(page: Page) {
  const confirm = page.getByRole('dialog', { name: '입력 내용을 버릴까요?', exact: true });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: '변경 내용 버리기', exact: true }).click();
  await expect(confirm).not.toBeVisible();
}

test('Escape preserves a ledger draft until discard is confirmed and restores opener focus', async ({
  page,
}) => {
  await login(page);
  const before = await snapshot(page);
  const opener = createOpener(page);
  await opener.click();
  const form = page.getByRole('dialog', { name: '가계부 만들기', exact: true });
  const name = form.getByRole('textbox', { name: '가계부 이름', exact: true });
  await name.fill('Escape로 취소할 가상 초안');

  await name.press('Escape');
  const confirm = page.getByRole('dialog', { name: '입력 내용을 버릴까요?', exact: true });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: '계속 작성', exact: true }).click();
  await expect(confirm).not.toBeVisible();
  await expect(form).toBeVisible();
  await expect(name).toHaveValue('Escape로 취소할 가상 초안');
  await expect(name).toBeFocused();

  await name.press('Escape');
  await discardDraft(page);
  await expect(form).not.toBeVisible();
  await expect(opener).toBeFocused();
  const after = await snapshot(page);
  expect(after.ledgers).toEqual(before.ledgers);
  expect(after.revision).toBe(before.revision);
});

test('ledger settings reject whitespace names and a start date later than the existing end date', async ({
  page,
}) => {
  await login(page);
  const before = await snapshot(page);
  await createOpener(page).click();
  const form = page.getByRole('dialog', { name: '가계부 만들기', exact: true });
  const name = form.getByRole('textbox', { name: '가계부 이름', exact: true });
  const submit = form.getByRole('button', { name: '가계부 만들기', exact: true });

  await name.fill('   ');
  await submit.click();
  await expect(form.getByRole('alert')).toContainText('가계부 이름을 입력해 주세요.');
  await expect(form).toBeVisible();

  await name.fill('기간 검증용 가상 초안');
  // Choose the end first, then move the start beyond it through the real calendar.
  // This catches changing the lower bound after an otherwise valid date was selected.
  await chooseDate(form.getByLabel('종료일 (선택)', { exact: true }), '2026-06-10');
  await chooseDate(form.getByLabel('시작일 (선택)', { exact: true }), '2026-06-20');
  await submit.click();
  await expect(
    form.getByText(/2026-06-20 이후로 선택해 주세요\.|종료일은 시작일과 같거나 이후여야 해요\./),
  ).toBeVisible();
  await expect(form).toBeVisible();
  const after = await snapshot(page);
  expect(after.ledgers).toEqual(before.ledgers);
  expect(after.revision).toBe(before.revision);

  // The invalid-date calendar may be open; dismiss it before closing the dialog.
  await page.keyboard.press('Escape');
  const confirm = page.getByRole('dialog', { name: '입력 내용을 버릴까요?', exact: true });
  if (!(await confirm.isVisible())) {
    await form.getByRole('button', { name: '닫기', exact: true }).click();
  }
  await discardDraft(page);
});

test('selecting malformed CSV removes the prior preview and confirmation without importing rows', async ({
  page,
}) => {
  await login(page);
  const before = await snapshot(page);
  await openGlobalView(page, '데이터 관리');
  await page.getByRole('tab', { name: 'CSV 가져오기', exact: true }).click();
  const csv = page.getByRole('tabpanel', { name: 'CSV 가져오기', exact: true });
  const file = csv.getByLabel('CSV 파일', { exact: true });
  await file.setInputFiles({
    name: 'ui-consistency-valid.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '원본 행 ID,날짜,내역,금액,유형,결제수단\nui-consistency-1,2026-09-18,가상 CSV 초안,3500,expense,현금\n',
    ),
  });
  await csv.getByRole('button', { name: '가져올 내역 검사', exact: true }).click();
  await expect(csv.getByRole('heading', { name: '가져오기 미리보기', exact: true })).toBeVisible();
  await csv
    .getByRole('checkbox', { name: '원본 행, 거래 내용과 합계를 확인했습니다.', exact: true })
    .check();
  await expect(
    csv.getByRole('button', { name: '확인한 거래 가져오기', exact: true }),
  ).toBeEnabled();

  await file.setInputFiles({
    name: 'ui-consistency-malformed.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('"닫히지 않은 가상 CSV'),
  });
  await expect(
    page.getByText('CSV의 닫히지 않은 따옴표를 확인해 주세요.', { exact: true }),
  ).toBeVisible();
  await expect(csv.getByRole('heading', { name: '가져오기 미리보기', exact: true })).toHaveCount(0);
  await expect(csv.getByRole('button', { name: '확인한 거래 가져오기', exact: true })).toHaveCount(
    0,
  );
  await expect(csv.getByRole('button', { name: '가져올 내역 검사', exact: true })).toHaveCount(0);

  await page.getByRole('tab', { name: '백업·복원', exact: true }).click();
  await page.getByRole('tab', { name: 'CSV 가져오기', exact: true }).click();
  await expect(csv.getByRole('button', { name: '확인한 거래 가져오기', exact: true })).toHaveCount(
    0,
  );
  const after = await snapshot(page);
  expect(after.transactions).toEqual(before.transactions);
  expect(after.revision).toBe(before.revision);
});

test('Excel work locks data navigation until completion or a definite retry error', async ({
  page,
}) => {
  await login(page);
  const before = await snapshot(page);
  let releaseBackup!: () => void;
  const heldBackup = new Promise<void>((resolve) => {
    releaseBackup = resolve;
  });
  let firstBackup = true;
  await page.route('**/api/data/backup', async (route) => {
    if (firstBackup) {
      firstBackup = false;
      await heldBackup;
    }
    await route.continue();
  });
  const mutationIds: string[] = [];
  await page.route('**/api/data/restore', async (route) => {
    mutationIds.push(route.request().postDataJSON().mutationId);
    await route.fulfill({
      status: mutationIds.length === 1 ? 503 : 409,
      contentType: 'application/json',
      body: JSON.stringify({
        code: mutationIds.length === 1 ? 'UNAVAILABLE' : 'CONFLICT',
        error:
          mutationIds.length === 1
            ? '반영 결과를 확인하지 못했어요.'
            : '자료가 변경되었어요. 미리보기를 다시 확인해 주세요.',
      }),
    });
  });
  try {
    await openGlobalView(page, '데이터 관리');
    const shortcut = page.getByRole('button', { name: /가져온 원본 검토하기/ });
    await page.getByLabel('원본 가계부 XLSX', { exact: true }).setInputFiles({
      name: 'ui-pending-synthetic.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: settingsOnlyWorkbook(),
    });
    await page.getByRole('button', { name: '엑셀 반영 미리보기', exact: true }).click();
    for (const tab of await page.getByRole('tab').all()) await expect(tab).toBeDisabled();
    await expect(shortcut).toBeDisabled();
    releaseBackup();
    await expect(page.getByRole('heading', { name: '반영할 내용', exact: true })).toBeVisible();
    for (const tab of await page.getByRole('tab').all()) await expect(tab).toBeEnabled();
    await expect(shortcut).toBeEnabled();

    await page
      .getByLabel('금액·연결과 미확정 자료의 검토함 보존을 확인했어요.', { exact: true })
      .check();
    await page.getByRole('button', { name: '엑셀 자료 반영', exact: true }).click();
    const retry = page.getByRole('button', { name: '같은 요청으로 결과 확인', exact: true });
    await expect(retry).toBeEnabled();
    for (const tab of await page.getByRole('tab').all()) await expect(tab).toBeDisabled();
    await expect(shortcut).toBeDisabled();
    await expect(page.getByRole('tab', { name: '엑셀 가져오기', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await retry.click();
    await expect(retry).toHaveCount(0);
    for (const tab of await page.getByRole('tab').all()) await expect(tab).toBeEnabled();
    await expect(shortcut).toBeEnabled();
    expect(mutationIds).toHaveLength(2);
    expect(mutationIds[0]).toBeTruthy();
    expect(mutationIds[1]).toBe(mutationIds[0]);
    await shortcut.click();
    await expect(page.getByRole('tab', { name: '원본 검토함', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const after = await snapshot(page);
    expect(after.revision).toBe(before.revision);
    expect(after.transactions).toEqual(before.transactions);
    expect(after.ledgers).toEqual(before.ledgers);
  } finally {
    releaseBackup();
  }
});
