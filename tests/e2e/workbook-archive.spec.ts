import { openGlobalView, openRoom } from './helpers/navigation';
import { expect, test, type Page } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { backupTables, type BudgetBackup, type SourceRecord } from '../../src/shared/data';
import { appendWorkbookArchive } from '../../src/shared/workbook-archive';
import { selectChoice } from './helpers/controls';

async function archiveFixture() {
  const bytes = zipSync({
    'xl/workbook.xml': strToU8(
      '<workbook xmlns:r="r"><sheets><sheet name="기록" r:id="s1"/><sheet name="숨긴 메모" state="hidden" r:id="s2"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<Relationships><Relationship Id="s1" Target="worksheets/sheet1.xml"/><Relationship Id="s2" Target="worksheets/sheet2.xml"/></Relationships>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `<worksheet><sheetData>${Array.from({ length: 105 }, (_, index) => `<row r="${index + 1}"><c r="A${index + 1}" t="str"><v>합성 기록 ${index + 1}</v></c>${index === 0 ? '<c r="B1"><f>SUM(1,2)</f><v>3</v></c><c r="C1" t="str"><v>&lt;img src=x onerror=alert(1)&gt;</v></c><c r="D1" s="1"/>' : ''}</row>`).join('')}</sheetData></worksheet>`,
    ),
    'xl/worksheets/sheet2.xml': strToU8(
      '<worksheet><sheetData><row r="1"><c r="A1" t="str"><v>숨겨진 합성 메모</v></c></row></sheetData></worksheet>',
    ),
    'xl/comments1.xml': strToU8(
      '<comments><commentList><comment ref="A1"><text><t>다운로드 원본에 보존하는 합성 주석</t></text></comment></commentList></comments>',
    ),
    'xl/drawings/drawing1.xml': strToU8('<drawing>합성 도형 원본</drawing>'),
  });
  const backup: BudgetBackup = {
    format: 'our-budget',
    schemaVersion: 2,
    exportedAt: '2026-09-17T00:00:00.000Z',
    sourceHouseholdId: 'synthetic-archive',
    sourceRevision: 0,
    members: [],
    tables: Object.fromEntries(
      backupTables.map((name) => [name, [] as BudgetBackup['tables'][typeof name]]),
    ) as BudgetBackup['tables'],
  };
  await appendWorkbookArchive(backup, 'synthetic-workbook', '합성 원본.xlsx', bytes);
  const records: SourceRecord[] = backup.tables.source_records.map((row) => ({
    id: String(row.id),
    sourceId: String(row.source_id),
    sourceLocation: String(row.source_location),
    kind: row.kind as SourceRecord['kind'],
    payload: JSON.parse(String(row.payload_json)),
    note: String(row.note),
    status: row.status as SourceRecord['status'],
    version: Number(row.version),
  }));
  records.push({
    id: 'synthetic-pending',
    sourceId: 'synthetic-workbook',
    sourceLocation: '기록!30',
    kind: 'transaction',
    payload: {
      date: '',
      description: '검색할 합성 장보기',
      amount: 12345,
      major: '생활',
      minor: '마트',
      payment: '',
      tag: '주말',
      kind: 'expense',
    },
    note: '날짜 확인이 필요한 합성 자료',
    status: 'pending',
    version: 1,
  });
  return { records, bytes };
}

async function openData(page: Page, records: SourceRecord[]) {
  await page.route('**/api/data/source-records', (route) => route.fulfill({ json: records }));
  await page.goto('/');
  await page.getByRole('button', { name: /나로 시작하기/ }).click();
  await openRoom(page);
  await expect(page.getByTestId('connection')).toHaveText('실시간 연결됨');
  await openGlobalView(page, '데이터 관리');
}

test('preserved workbook cells are searchable and paged, hidden sheets remain accessible and original bytes download unchanged', async ({
  page,
}) => {
  const { records, bytes } = await archiveFixture();
  await openData(page, records);
  await page.getByRole('tab', { name: '원본 검토함', exact: true }).click();
  const inbox = page.getByRole('tabpanel', { name: '원본 검토함', exact: true });
  await expect(
    inbox.getByRole('heading', { name: '검색할 합성 장보기', exact: true }),
  ).toBeVisible();
  await expect(inbox.getByText('12,345원', { exact: true })).toBeVisible();
  await expect(inbox.getByText('미지정', { exact: true })).toBeVisible();
  await selectChoice(inbox.getByRole('combobox', { name: '검토 상태', exact: true }), '');
  await expect(inbox.locator('.data-source-list article')).toHaveCount(1);
  await inbox.getByLabel('원본 내역·출처·메모 검색', { exact: true }).fill('장보기');
  await expect(inbox.locator('.data-source-list article')).toHaveCount(1);
  await inbox.getByLabel('원본 내역·출처·메모 검색', { exact: true }).fill('없는 원문');
  await expect(inbox.locator('.data-source-list article')).toHaveCount(0);

  await page.getByRole('tab', { name: '엑셀 원본', exact: true }).click();
  const panel = page.getByRole('tabpanel', { name: '엑셀 원본', exact: true });
  await panel.getByRole('button', { name: '합성 원본.xlsx 원본 열기', exact: true }).click();
  const table = panel.getByRole('region', { name: '엑셀 원본 셀 표', exact: true });
  await expect(table.locator('tbody tr')).toHaveCount(100);
  await expect(
    table.getByRole('row').filter({ hasText: '<img src=x onerror=alert(1)>' }),
  ).toHaveCount(1);
  await expect(table.locator('img')).toHaveCount(0);
  await expect(table.getByRole('rowheader', { name: 'D1', exact: true })).toHaveCount(0);
  await panel
    .getByRole('navigation', { name: '원본 셀 페이지', exact: true })
    .getByRole('button', { name: '다음', exact: true })
    .click();
  await expect(table.getByRole('rowheader', { name: 'A105', exact: true })).toBeVisible();
  await panel.getByLabel('수식이 있는 셀만', { exact: true }).check();
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.getByText('=SUM(1,2)', { exact: true })).toBeVisible();
  await panel.getByLabel('수식이 있는 셀만', { exact: true }).uncheck();
  await panel.getByLabel('셀 주소·값·수식 검색', { exact: true }).fill('A105');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await panel.getByLabel('셀 주소·값·수식 검색', { exact: true }).fill('');
  await selectChoice(panel.getByRole('combobox', { name: '원본 시트', exact: true }), '1');
  await expect(table.getByText('숨겨진 합성 메모', { exact: true })).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await panel.getByRole('button', { name: '합성 원본.xlsx 원본 다운로드', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('합성 원본.xlsx');
  const chunks: Buffer[] = [];
  for await (const chunk of (await download.createReadStream())!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks)).toEqual(Buffer.from(bytes));
  await page.screenshot({ path: 'test-results/workbook-archive-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 760 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/workbook-archive-mobile.png', fullPage: true });
});

test('corrupt archive bytes block original viewing and download with a clear error', async ({
  page,
}) => {
  const { records } = await archiveFixture();
  const manifest = records.find(
    (record) =>
      !Array.isArray(record.payload) && record.payload.format === 'uga-workbook-manifest-v1',
  )!;
  manifest.payload = { ...manifest.payload, sha256: '0'.repeat(64) };
  await openData(page, records);
  await page.getByRole('tab', { name: '엑셀 원본', exact: true }).click();
  const panel = page.getByRole('tabpanel', { name: '엑셀 원본', exact: true });
  await panel.getByRole('button', { name: '합성 원본.xlsx 원본 열기', exact: true }).click();
  await expect(panel.getByRole('alert')).toHaveText('원본 파일 무결성 확인에 실패했어요.');
  await expect(panel.getByRole('region', { name: '엑셀 원본 셀 표', exact: true })).toHaveCount(0);
  const downloads: string[] = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await panel.getByRole('button', { name: '합성 원본.xlsx 원본 다운로드', exact: true }).click();
  await expect(
    panel.getByRole('button', { name: '합성 원본.xlsx 원본 다운로드', exact: true }),
  ).toBeEnabled();
  await expect(panel.getByRole('alert')).toHaveText('원본 파일 무결성 확인에 실패했어요.');
  expect(downloads).toHaveLength(0);
});
