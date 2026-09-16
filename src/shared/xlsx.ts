import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

export interface WorkbookCell {
  value: string | number | boolean | null;
  formula?: string;
  error?: string;
}
export interface WorkbookSheet {
  name: string;
  hidden: boolean;
  cells: Record<string, WorkbookCell>;
}
export interface Workbook {
  sheets: WorkbookSheet[];
  date1904: boolean;
}
type Xml = Record<string, any>;
const list = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
function rich(value: any): string {
  if (value == null) return '';
  if (typeof value !== 'object') return String(value);
  if (value.t !== undefined) return rich(value.t);
  if (value.r !== undefined) return list(value.r).map(rich).join('');
  return String(value['#text'] ?? '');
}
export function excelDate(serial: number, date1904 = false): string | null {
  if (!Number.isFinite(serial) || serial < 0 || (!date1904 && Math.floor(serial) === 60))
    return null;
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
  const adjusted = serial - (!date1904 && serial > 60 ? 1 : 0);
  const date = new Date(epoch + Math.floor(adjusted) * 86400000);
  return Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() >= 1900 &&
    date.getUTCFullYear() <= 9999
    ? date.toISOString().slice(0, 10)
    : null;
}
/** OOXML data reader only. Formulas, links, macros and workbook instructions never execute. */
export function readXlsx(bytes: Uint8Array): Workbook {
  if (bytes.length > 20_000_000) throw new Error('엑셀 파일은 20MB 이하로 선택해 주세요.');
  let total = 0,
    count = 0;
  const entries = unzipSync(bytes, {
    filter(file) {
      if (
        !/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/.test(
          file.name,
        )
      )
        return false;
      total += file.originalSize;
      count++;
      if (total > 60_000_000 || file.originalSize > 15_000_000 || count > 200)
        throw new Error('압축을 푼 엑셀 자료가 허용 크기를 넘었어요.');
      return true;
    },
  });
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
  });
  const xml = (path: string): Xml => {
    const bytes = entries[path];
    if (!bytes) return {};
    const text = strFromU8(bytes);
    if (/<!DOCTYPE|<!ENTITY/i.test(text))
      throw new Error('외부 엔터티가 포함된 XML은 읽을 수 없어요.');
    return parser.parse(text);
  };
  const root = xml('xl/workbook.xml').workbook;
  if (!root) throw new Error('지원하는 XLSX 통합문서가 아니에요.');
  const date1904 = ['1', 'true'].includes(root.workbookPr?.['@_date1904']);
  const relations = new Map(
    list<Xml>(xml('xl/_rels/workbook.xml.rels').Relationships?.Relationship)
      .filter((r) => r['@_TargetMode'] !== 'External')
      .map((r) => [r['@_Id'], r['@_Target']]),
  );
  const strings = list<Xml>(xml('xl/sharedStrings.xml').sst?.si).map(rich);
  const styles = xml('xl/styles.xml').styleSheet;
  const custom = new Map(
    list<Xml>(styles?.numFmts?.numFmt).map((v) => [
      Number(v['@_numFmtId']),
      String(v['@_formatCode']),
    ]),
  );
  const dateStyles = list<Xml>(styles?.cellXfs?.xf).map((style) => {
    const id = Number(style['@_numFmtId']);
    const format = (custom.get(id) ?? '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
    return (id >= 14 && id <= 22) || /[yd]/i.test(format);
  });
  const sheets = list<Xml>(root.sheets?.sheet).map((s) => {
    const target = relations.get(s['@_r:id']);
    if (typeof target !== 'string') throw new Error('시트 연결을 확인할 수 없어요.');
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    if (!entries[path]) throw new Error('시트 자료를 읽을 수 없어요.');
    const cells: Record<string, WorkbookCell> = {};
    for (const row of list<Xml>(xml(path).worksheet?.sheetData?.row))
      for (const c of list<Xml>(row.c)) {
        const address = c['@_r'];
        if (typeof address !== 'string' || !/^[A-Z]{1,3}\d{1,7}$/.test(address)) continue;
        const type = c['@_t'];
        let value: WorkbookCell['value'] = null;
        let error: string | undefined;
        const raw = c.v === undefined ? '' : rich(c.v);
        if (type === 's') value = strings[Number(raw)] ?? '';
        else if (type === 'inlineStr') value = rich(c.is);
        else if (type === 'str' || type === 'd') value = raw;
        else if (type === 'b') value = raw === '1';
        else if (type === 'e') {
          error = raw;
          value = null;
        } else if (raw !== '') {
          const n = Number(raw);
          value = Number.isFinite(n) ? n : raw;
          if (typeof value === 'number' && dateStyles[Number(c['@_s'] ?? 0)]) {
            const converted = excelDate(value, date1904);
            if (converted) value = converted;
            else error = '날짜 형식의 수치 범위 확인 필요';
          }
        }
        cells[address] = {
          value,
          ...(c.f !== undefined ? { formula: rich(c.f) } : {}),
          ...(error ? { error } : {}),
        };
      }
    return {
      name: String(s['@_name']),
      hidden: s['@_state'] === 'hidden' || s['@_state'] === 'veryHidden',
      cells,
    };
  });
  return { sheets, date1904 };
}
export function cellValue(book: Workbook, sheet: string, address: string) {
  return book.sheets.find((s) => s.name === sheet)?.cells[address]?.value ?? null;
}
export interface ExcelTransactionRow {
  rowId: string;
  sheet: string;
  row: number;
  date: string;
  description: string;
  amount: number;
  kind: 'income' | 'expense' | 'saving';
  major: string;
  minor: string;
  payment: string;
  tag: string;
  fixed: boolean;
  errors: string[];
}
export function originalTransactions(book: Workbook): ExcelTransactionRow[] {
  const result: ExcelTransactionRow[] = [];
  for (const sheet of book.sheets.filter((s) => /^(?:[1-9]|1[0-2])$/.test(s.name))) {
    for (const row of [
      ...Array.from({ length: 20 }, (_, i) => i + 7),
      ...Array.from({ length: 300 }, (_, i) => i + 30),
    ]) {
      const c = (col: string) => sheet.cells[`${col}${row}`]?.value;
      if (c('V') == null || c('V') === '' || c('V') === 0) continue;
      const errors: string[] = [];
      const rawDate = c('T');
      const date =
        typeof rawDate === 'number'
          ? (excelDate(rawDate, book.date1904) ?? '')
          : String(rawDate ?? '');
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
        new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
      )
        errors.push('날짜를 확인해 주세요.');
      const amount = Number(c('V'));
      if (!Number.isSafeInteger(amount) || amount <= 0)
        errors.push('양의 정수 원 금액이 필요해요.');
      const major = String(c('W') ?? '').trim(),
        minor = String(c('X') ?? '').trim();
      if (!major || !minor) errors.push('대분류와 소분류가 필요해요.');
      const kind = major === '수입' ? 'income' : major === '저축' ? 'saving' : 'expense';
      result.push({
        rowId: `${sheet.name}!${row}`,
        sheet: sheet.name,
        row,
        date,
        amount,
        description: String(c('U') ?? '').trim(),
        major,
        minor,
        payment: String(c('Y') ?? '').trim(),
        tag: String(c('Z') ?? '').trim(),
        fixed: row < 27,
        kind,
        errors,
      });
    }
  }
  return result;
}
