import { openGlobalView, openRoom } from './helpers/navigation';
import { chooseMonth, selectChoice } from './helpers/controls';
import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import type { Bootstrap } from '../../src/shared/types';

// A small, entirely synthetic OOXML file. No personal workbook content is committed.
function workbook() {
  const sheets: Record<string, Record<string, string | number>> = {
    설정: { C3: 2026, E3: 1, G3: 1, B6: '식비', C6: '장보기' },
    '1': {
      T30: '2026-01-16',
      U30: '엑셀 합성 장보기',
      V30: 12000,
      W30: '식비',
      X30: '장보기',
      Y30: '합성 현금',
      U31: '날짜 보완 대기',
      V31: 5000,
      W31: '식비',
      X31: '장보기',
      Y31: '합성 현금',
      B69: '식비',
      C69: 50000,
      C129: 50000,
    },
    자산관리: { B28: '유동자산', C28: '저축', D28: '이관 합성 자산', E28: 50000, F28: 60000 },
    '차병원 정산': { B4: '제외 대상 합성 자료', C4: 9999 },
  };
  const escape = (text: string) =>
    text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const files: Record<string, Uint8Array> = {
    'xl/workbook.xml': strToU8(
      `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${Object.keys(
        sheets,
      )
        .map((name, i) => `<sheet name="${escape(name)}" sheetId="${i + 1}" r:id="r${i}"/>`)
        .join('')}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<Relationships>${Object.keys(sheets)
        .map((_, i) => `<Relationship Id="r${i}" Target="worksheets/sheet${i}.xml"/>`)
        .join('')}</Relationships>`,
    ),
  };
  Object.values(sheets).forEach((cells, index) => {
    files[`xl/worksheets/sheet${index}.xml`] = strToU8(
      `<worksheet><sheetData>${Object.entries(cells)
        .map(
          ([ref, value]) =>
            `<row><c r="${ref}"${typeof value === 'string' ? ' t="inlineStr"' : ''}>${typeof value === 'string' ? `<is><t>${escape(value)}</t></is>` : `<v>${value}</v>`}</c></row>`,
        )
        .join('')}</sheetData></worksheet>`,
    );
  });
  return Buffer.from(zipSync(files));
}
test('XLSX preview, review evidence and repeat import are usable from the data screen', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '나로 시작하기' }).click();
  await openRoom(page);
  await expect(page.getByRole('heading', { name: '우리의 일상' })).toBeVisible();
  await chooseMonth(page.getByLabel('조회 월', { exact: true }), '2027-09');
  const before: Bootstrap = await (await page.request.get('/api/bootstrap')).json();
  await openGlobalView(page, '데이터 관리');
  await page.getByLabel('원본 가계부 XLSX').setInputFiles({
    name: 'synthetic.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: workbook(),
  });
  await selectChoice(page.getByRole('combobox', { name: '가져올 가계부', exact: true }), '@new');
  await page.getByLabel('새 가계부 이름', { exact: true }).fill('과거 가져오기 검증');
  await selectChoice(page.getByRole('combobox', { name: /^가계부 구성/ }), 'monthly');
  await selectChoice(page.getByLabel('엑셀 결제수단 합성 현금'), '@new:cash');
  await page.getByRole('button', { name: '엑셀 반영 미리보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '반영할 내용', exact: true })).toBeVisible();
  await expect(page.locator('.data-preview')).toContainText('거래 1건');
  await expect(page.locator('.data-preview')).toContainText('12,000');
  await page.getByLabel('금액·연결과 미확정 자료의 검토함 보존을 확인했어요.').check();
  await page.getByRole('button', { name: '엑셀 자료 반영', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('엑셀 자료를 반영했어요.');
  const after: Bootstrap = await (await page.request.get('/api/bootstrap')).json();
  expect(after.ledgers.find((ledger) => ledger.name === '과거 가져오기 검증')).toMatchObject({
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  });
  expect(after.transactions.length - before.transactions.length).toBe(1);
  expect(after.transactions.find((t) => t.description === '엑셀 합성 장보기')?.amount).toBe(12000);
  expect(after.assets.find((a) => a.name === '이관 합성 자산')?.balance).toBe(60000);
  expect(
    after.assetMovements
      .filter((m) => m.assetId === after.assets.find((a) => a.name === '이관 합성 자산')?.id)
      .reduce((n, m) => n + m.savingsAmount, 0),
  ).toBe(0);
  const evidence = await (await page.request.get('/api/data/source-records')).json();
  expect(
    evidence.some(
      (r: { status: string; payload: { description?: string } }) =>
        r.status === 'pending' && r.payload.description === '날짜 보완 대기',
    ),
  ).toBe(true);
  expect(JSON.stringify(evidence)).not.toContain('제외 대상 합성 자료');
  await page.getByRole('button', { name: '엑셀 반영 미리보기', exact: true }).click();
  await expect(page.locator('.data-preview')).toContainText('거래 0건');
  await page.getByText('불완전한 월별 기록 보완 (1)', { exact: true }).click();
  await page.getByLabel('1!31 date', { exact: true }).fill('2026-09-17');
  await page.getByLabel('1!31 major', { exact: true }).fill(' 저축 ');
  await page.getByLabel('1!31 minor', { exact: true }).fill(' 합성 적립 ');
  await page.getByText('저축 기록의 자산 이동 연결 (1행)', { exact: true }).click();
  await expect(page.getByLabel('저축 합성 적립 fromAssetId')).toBeVisible();
  await selectChoice(page.getByLabel('저축 합성 적립 fromAssetId'), 'checking');
  await selectChoice(page.getByLabel('저축 합성 적립 toAssetId'), 'investment');
  await page.getByRole('button', { name: '엑셀 반영 미리보기', exact: true }).click();
  await expect(page.locator('.data-preview')).toContainText('거래 0건');
  await expect(page.locator('.data-preview')).toContainText('자산 이동 1건 · 이동 금액 5,000원');
  await page.getByText('자산 변동 상세 확인', { exact: true }).click();
  await expect(page.locator('.data-preview')).toContainText('생활 통장 → 투자금');
  await page.getByLabel('금액·연결과 미확정 자료의 검토함 보존을 확인했어요.').check();
  await page.getByRole('button', { name: '엑셀 자료 반영', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('엑셀 자료를 반영했어요.');
  const corrected: Bootstrap = await (await page.request.get('/api/bootstrap')).json();
  expect(corrected.transactions.length).toBe(after.transactions.length);
  expect(corrected.assets.find((a) => a.id === 'checking')?.balance).toBe(
    after.assets.find((a) => a.id === 'checking')!.balance - 5000,
  );
  expect(corrected.assets.find((a) => a.id === 'investment')?.balance).toBe(
    after.assets.find((a) => a.id === 'investment')!.balance + 5000,
  );
  await page.getByRole('button', { name: '가져온 가계부 보기', exact: true }).click();
  await expect(page.getByLabel('조회 월', { exact: true })).toHaveAttribute(
    'data-value',
    '2026-01',
  );
  await expect(page.getByRole('combobox', { name: '조회 기간', exact: true })).toHaveAttribute(
    'data-value',
    'period',
  );
  await expect(page.getByRole('combobox', { name: '조회 대상', exact: true })).toHaveAttribute(
    'data-value',
    'descendants',
  );
  await expect(page.getByRole('row').filter({ hasText: '엑셀 합성 장보기' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
