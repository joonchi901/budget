import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { readXlsx, excelDate, originalTransactions } from '../../src/shared/xlsx';
const pack = (sheet: string) =>
  zipSync({
    'xl/workbook.xml': strToU8(
      '<workbook xmlns:r="r"><sheets><sheet name="1" r:id="s"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<Relationships><Relationship Id="s" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  });
describe('local XLSX source reader', () => {
  it('reads cells and cached formulas but never executes formula instructions', () => {
    const book = readXlsx(
      pack(
        '<worksheet><sheetData><row r="30"><c r="T30" t="str"><v>2026-01-03</v></c><c r="U30" t="inlineStr"><is><t>메모 &amp; 식사</t></is></c><c r="V30"><f>HYPERLINK("https://example.invalid")</f><v>1000</v></c><c r="W30" t="str"><v>식비</v></c><c r="X30" t="str"><v>외식</v></c></row></sheetData></worksheet>',
      ),
    );
    expect(book.sheets[0].cells.V30.value).toBe(1000);
    const rows = originalTransactions(book);
    expect(rows[0]).toMatchObject({
      description: '메모 & 식사',
      date: '2026-01-03',
      amount: 1000,
      kind: 'expense',
      errors: [],
    });
  });
  it('quarantines rows with amounts but incomplete dates instead of inventing dates', () => {
    const book = readXlsx(
      pack(
        '<worksheet><sheetData><row r="30"><c r="V30"><v>1000</v></c></row></sheetData></worksheet>',
      ),
    );
    expect(originalTransactions(book)[0].errors).toHaveLength(2);
  });
  it('preserves savings as an explicitly separate import decision', () => {
    const book = readXlsx(
      pack(
        '<worksheet><sheetData><row r="30"><c r="T30" t="str"><v>2026-01-03</v></c><c r="V30"><v>1000</v></c><c r="W30" t="str"><v>저축</v></c><c r="X30" t="str"><v>적금</v></c></row></sheetData></worksheet>',
      ),
    );
    expect(originalTransactions(book)[0].kind).toBe('saving');
  });
  it('handles both date systems and rejects the fictitious leap day', () => {
    expect(excelDate(1)).toBe('1900-01-01');
    expect(excelDate(60)).toBeNull();
    expect(excelDate(61)).toBe('1900-03-01');
    expect(excelDate(0, true)).toBe('1904-01-01');
  });
  it('rejects external entity declarations', () => {
    expect(() =>
      readXlsx(
        pack('<!DOCTYPE worksheet [<!ENTITY secret SYSTEM "file:///etc/passwd">]><worksheet/>'),
      ),
    ).toThrow('외부 엔터티');
  });
});
