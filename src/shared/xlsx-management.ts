import { cellValue, excelDate, type Workbook, type WorkbookCell, type WorkbookSheet } from './xlsx';
import { monthEndDate, type AssetDetails } from './assets';
import type { PaymentDetails } from './payments';

export interface WorkbookPaymentCandidate {
  key: string;
  source: string;
  name: string;
  type: 'card' | 'account';
  details: PaymentDetails;
  closingDay: number | null;
  paymentDay: number | null;
  ownerName?: string;
  linkedAccountName?: string;
}
export interface WorkbookAssetCandidate {
  key: string;
  source: string;
  name: string;
  kind: 'asset' | 'liability';
  details: AssetDetails;
  classifications: string[];
  observations: Array<{ date: string; amount: number; source: string }>;
  notes?: string;
}
export interface WorkbookReserveRow {
  key: string;
  source: string;
  date: string | null;
  description: string;
  amount: number;
  category: string;
  /** Original worksheet side, not a conclusion that the item is income or consumption. */
  kind: 'deposit' | 'expense';
  tag?: string;
  paymentName?: string;
  notes?: string;
}
export interface WorkbookManagement {
  payments: WorkbookPaymentCandidate[];
  assets: WorkbookAssetCandidate[];
  reserveRows: WorkbookReserveRow[];
  issues: Array<{ source: string; message: string }>;
  /** Unstructured sheet notes remain unassigned until the user chooses their destination. */
  notes: Array<{ source: string; text: string }>;
}

const label = (value: WorkbookCell['value'] | undefined) =>
  value == null ? '' : String(value).trim();
const numeric = (value: WorkbookCell['value'] | undefined): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const cleaned = value.replace(/[,\s₩원]/g, '');
  return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(cleaned) && Number.isFinite(Number(cleaned))
    ? Number(cleaned)
    : null;
};
const dateText = (value: WorkbookCell['value'] | undefined, book: Workbook): string | null => {
  if (typeof value === 'number') return excelDate(value, book.date1904);
  const text = label(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})(?:(?:T| )00:00:00(?:\.000)?Z?)?$/);
  if (!match) return null;
  const parsed = new Date(`${match[1]}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === match[1]
    ? match[1]
    : null;
};
const columnNumber = (column: string) =>
  [...column].reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0);

/** Reads cached data only. Workbook text, formulas, macros and links never execute. */
export function extractWorkbookManagement(book: Workbook): WorkbookManagement {
  const result: WorkbookManagement = {
    payments: [],
    assets: [],
    reserveRows: [],
    issues: [],
    notes: [],
  };
  const issue = (source: string, message: string) => result.issues.push({ source, message });
  const sheet = (name: string) => book.sheets.find((s) => s.name === name);
  const value = (s: WorkbookSheet, col: string, row: number) => s.cells[`${col}${row}`]?.value;
  const text = (s: WorkbookSheet, col: string, row: number) => label(value(s, col, row));
  const rowRaw = (s: WorkbookSheet, row: number, first = 2, last = 16) =>
    Object.entries(s.cells)
      .filter(([address, cell]) => {
        const match = address.match(/^([A-Z]+)(\d+)$/)!;
        return (
          Number(match[2]) === row &&
          columnNumber(match[1]) >= first &&
          columnNumber(match[1]) <= last &&
          ((cell.value !== null && cell.value !== '') ||
            Boolean(cell.formula) ||
            Boolean(cell.error))
        );
      })
      .sort(([a], [b]) => columnNumber(a.replace(/\d/g, '')) - columnNumber(b.replace(/\d/g, '')))
      .map(
        ([address, cell]) =>
          `${s.name}!${address}: ${label(cell.value)}${cell.formula ? ` [계산식: ${cell.formula}]` : ''}${cell.error ? ` [오류: ${cell.error}]` : ''}`,
      )
      .join('\n');
  const amount = (
    s: WorkbookSheet,
    col: string,
    row: number,
    allowNegative = false,
  ): number | null => {
    const raw = value(s, col, row);
    if (raw == null || raw === '') return null;
    const n = numeric(raw);
    if (
      n === null ||
      !Number.isSafeInteger(n) ||
      Math.abs(n) > 1_000_000_000_000 ||
      (!allowNegative && n < 0)
    ) {
      issue(
        `${s.name}!${col}${row}`,
        '정수 원 단위 금액을 확인해 주세요. 원문은 메모에 보존했어요.',
      );
      return null;
    }
    return n;
  };
  const day = (s: WorkbookSheet, col: string, row: number): number | null => {
    const raw = text(s, col, row);
    if (!raw) return null;
    const match = raw.match(/^(?:매월\s*)?(\d{1,2})(?:일)?$/);
    const n = match ? Number(match[1]) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > 31) {
      issue(`${s.name}!${col}${row}`, '매월 날짜를 1~31일 중에서 확인해 주세요.');
      return null;
    }
    return n;
  };
  const collectLowerNotes = (s: WorkbookSheet, minRow: number) => {
    const rows = [
      ...new Set(Object.keys(s.cells).map((address) => Number(address.replace(/\D/g, '')))),
    ]
      .filter((r) => r >= minRow)
      .sort((a, b) => a - b);
    for (const row of rows) {
      const raw = rowRaw(s, row, 2, 16);
      if (raw) result.notes.push({ source: `${s.name}!B${row}:P${row}`, text: raw });
    }
  };

  const cards = sheet('카드 관리');
  if (cards) {
    for (let row = 4; row <= 23; row++) {
      if (!'CDEFGHIJKLMNO'.split('').some((col) => text(cards, col, row))) continue;
      const source = `${cards.name}!B${row}:O${row}`;
      const details: PaymentDetails = {
        institution: text(cards, 'C', row),
        purpose: text(cards, 'F', row),
        usagePeriodNote: text(cards, 'J', row),
        benefits: text(cards, 'O', row),
        notes: rowRaw(cards, row, 3, 15),
      };
      const cardKind = text(cards, 'E', row);
      if (/^(신용|신용카드|credit)$/i.test(cardKind)) details.cardKind = 'credit';
      else if (/^(체크|체크카드|debit)$/i.test(cardKind)) details.cardKind = 'debit';
      else issue(`${cards.name}!E${row}`, '신용·체크 카드 구분을 확인해 주세요.');
      for (const [col, field] of [
        ['G', 'monthlyBudget'],
        ['I', 'annualFee'],
        ['M', 'creditLimit'],
        ['N', 'performanceTarget'],
      ] as const) {
        const n = amount(cards, col, row);
        if (n !== null) details[field] = n;
      }
      const expiry = text(cards, 'H', row);
      if (expiry) {
        const match = expiry.match(/^(\d{4})[-./](0?[1-9]|1[0-2])(?:[-./]\d{1,2})?$/);
        if (match) details.expiry = `${match[1]}-${match[2].padStart(2, '0')}`;
        else issue(`${cards.name}!H${row}`, '유효기간의 연도와 월을 확인해 주세요.');
      }
      let closingDay: number | null = null;
      const period = text(cards, 'J', row);
      if (period) {
        const match = period.match(
          /^(?:(?:매월|당월|이번달|전월)\s*)?\d{1,2}\s*일?\s*[~～–—-]\s*(?:(?:당월|이번달|전월)\s*)?(\d{1,2})\s*일?$/,
        );
        if (match && Number(match[1]) >= 1 && Number(match[1]) <= 31) closingDay = Number(match[1]);
        else if (
          /^(?:(?:매월|당월|전월)\s*)?\d{1,2}\s*일?\s*[~～–—-]\s*(?:(?:당월|전월)\s*)?말일$/.test(
            period,
          )
        )
          closingDay = 31;
        if (!closingDay)
          issue(
            `${cards.name}!J${row}`,
            '원본 이용 기간을 보존했어요. 청구 예상액에 사용할 마감일을 확인해 주세요.',
          );
      }
      const linkedAccountName = text(cards, 'L', row);
      if (linkedAccountName)
        issue(`${cards.name}!L${row}`, '원본 결제계좌를 확인하고 등록할 통장과 연결해 주세요.');
      const name = text(cards, 'D', row);
      if (!name) issue(`${cards.name}!D${row}`, '카드 이름이 필요해요.');
      result.payments.push({
        key: `${cards.name}!${row}`,
        source,
        name,
        type: 'card',
        details,
        closingDay,
        paymentDay: day(cards, 'K', row),
        ...(linkedAccountName ? { linkedAccountName } : {}),
      });
    }
    collectLowerNotes(cards, 24);
  }

  const accounts = sheet('통장관리');
  if (accounts)
    for (let row = 4; row <= 33; row++) {
      if (!'CDEFGH'.split('').some((col) => text(accounts, col, row))) continue;
      const institution = text(accounts, 'C', row),
        accountKind = text(accounts, 'D', row);
      const name = [institution, accountKind].filter(Boolean).join(' ');
      if (!name)
        issue(`${accounts.name}!C${row}:D${row}`, '통장을 구분할 은행과 종류를 확인해 주세요.');
      const rawNumber = value(accounts, 'E', row);
      if (typeof rawNumber === 'number')
        issue(
          `${accounts.name}!E${row}`,
          '계좌번호가 수치로 저장되어 있어 앞자리 0이 사라졌는지 확인해 주세요.',
        );
      const ownerName = text(accounts, 'F', row);
      result.payments.push({
        key: `${accounts.name}!${row}`,
        source: `${accounts.name}!B${row}:H${row}`,
        name,
        type: 'account',
        details: {
          institution,
          accountKind,
          accountNumber: text(accounts, 'E', row),
          purpose: text(accounts, 'G', row),
          notes: rowRaw(accounts, row, 3, 8),
        },
        closingDay: null,
        paymentDay: null,
        ...(ownerName ? { ownerName } : {}),
      });
    }

  const loans = sheet('대출 관리');
  if (loans) {
    for (let row = 4; row <= 23; row++) {
      if (!'CDEFGHIJKLMNO'.split('').some((col) => text(loans, col, row))) continue;
      const source = `${loans.name}!B${row}:O${row}`,
        notes = rowRaw(loans, row, 3, 15);
      const details: AssetDetails = {
        institution: text(loans, 'C', row),
        notes,
        principal: amount(loans, 'F', row),
        paymentDay: day(loans, 'H', row),
        monthlyPayment: amount(loans, 'I', row),
        rateType: text(loans, 'J', row),
        term: text(loans, 'K', row),
        conditions: text(loans, 'L', row),
        repaymentMethod: text(loans, 'M', row),
        benefits: text(loans, 'O', row),
      };
      const rateValue = value(loans, 'G', row);
      if (rateValue != null && rateValue !== '') {
        const rate =
          typeof rateValue === 'string' && /%\s*$/.test(rateValue)
            ? numeric(rateValue.replace(/%\s*$/, ''))
            : numeric(rateValue) === null
              ? null
              : Number((numeric(rateValue)! * 100).toFixed(8));
        if (rate === null || rate < 0 || rate > 100)
          issue(`${loans.name}!G${row}`, '금리 수치와 단위를 확인해 주세요.');
        else details.rate = rate;
      }
      const fee = value(loans, 'N', row);
      details.fees =
        typeof fee === 'number' && fee >= 0 && fee < 1
          ? `${Number((fee * 100).toFixed(8))}%`
          : label(fee);
      const name = text(loans, 'D', row);
      if (!name) issue(`${loans.name}!D${row}`, '대출 이름이 필요해요.');
      issue(
        source,
        '대출 원금과 현재 잔액은 다를 수 있어요. 자산관리의 부채와 대응시키고 기준일 잔액을 별도로 확인해 주세요.',
      );
      result.assets.push({
        key: `${loans.name}!${row}`,
        source,
        name,
        kind: 'liability',
        details,
        classifications: ['부채', '대출'],
        observations: [],
        notes,
      });
    }
    collectLowerNotes(loans, 24);
  }

  const assetSheet = sheet('자산관리');
  if (assetSheet) {
    const year = numeric(cellValue(book, '설정', 'C3')),
      startMonth = numeric(cellValue(book, '설정', 'E3'));
    const validPeriod =
      Number.isInteger(year) &&
      year! >= 1900 &&
      year! <= 9998 &&
      Number.isInteger(startMonth) &&
      startMonth! >= 1 &&
      startMonth! <= 12;
    if (!validPeriod)
      issue(
        '설정!C3:E3',
        '자산 월별 관측값의 연도와 시작 월이 필요해요. 금액 원문은 보존하고 날짜는 만들지 않았어요.',
      );
    let major = '',
      minor = '';
    for (let row = 11; row <= 38; row++) {
      const rawMajor = text(assetSheet, 'B', row),
        rawMinor = text(assetSheet, 'C', row),
        name = text(assetSheet, 'D', row);
      if (
        /^(총합|소계|합계|순자산)$/.test(rawMajor) ||
        /^(총합|소계|합계|순자산)$/.test(rawMinor)
      ) {
        minor = '';
        if (rawMajor) major = '';
        continue;
      }
      if (rawMajor) {
        major = rawMajor;
        minor = '';
      }
      if (rawMinor) minor = rawMinor;
      const monthlyColumns = 'EFGHIJKLMNOP'.split('');
      if (!name && !monthlyColumns.some((col) => value(assetSheet, col, row) != null)) continue;
      const source = `${assetSheet.name}!B${row}:P${row}`;
      if (!name)
        issue(`${assetSheet.name}!D${row}`, '금액이 있는 자산 항목의 이름을 확인해 주세요.');
      const observations: WorkbookAssetCandidate['observations'] = [];
      for (const [index, col] of monthlyColumns.entries()) {
        const cell = assetSheet.cells[`${col}${row}`];
        if (!cell) continue;
        if (cell.formula || cell.error) {
          issue(
            `${assetSheet.name}!${col}${row}`,
            '계산식 또는 오류가 있는 금액은 확정 관측값으로 옮기지 않았어요. 원문을 확인해 주세요.',
          );
          continue;
        }
        if (cell.value === null || cell.value === '') continue;
        const n = amount(assetSheet, col, row, major !== '부채');
        if (n === null || !validPeriod) continue;
        const calendar = year! * 12 + startMonth! - 1 + index;
        const month = `${Math.floor(calendar / 12)}-${String((calendar % 12) + 1).padStart(2, '0')}`;
        observations.push({
          date: monthEndDate(month),
          amount: n,
          source: `${assetSheet.name}!${col}${row}`,
        });
      }
      result.assets.push({
        key: `${assetSheet.name}!${row}`,
        source,
        name,
        kind: major === '부채' ? 'liability' : 'asset',
        details: {},
        classifications: [major, minor].filter(Boolean),
        observations,
        notes: rowRaw(assetSheet, row),
      });
    }
  }

  const reserve = sheet('예비비');
  if (reserve) {
    const categories = new Set<string>();
    for (let row = 10; row <= 23; row++) {
      const name = text(reserve, 'B', row);
      if (!name) continue;
      categories.add(name);
      const notes = rowRaw(reserve, row, 2, 8);
      result.assets.push({
        key: `${reserve.name}!category:${row}`,
        source: `${reserve.name}!B${row}:H${row}`,
        name,
        kind: 'asset',
        details: { notes: text(reserve, 'F', row) },
        classifications: ['예비비'],
        observations: [],
        notes,
      });
    }
    for (const kind of ['deposit', 'expense'] as const) {
      for (let row = kind === 'deposit' ? 26 : 10; row <= 310; row++) {
        const columns =
          kind === 'deposit'
            ? { date: 'B', amount: 'C', category: 'D', description: 'E', first: 2, last: 8 }
            : { date: 'K', amount: 'M', category: 'N', description: 'L', first: 11, last: 15 };
        const rawAmount = value(reserve, columns.amount, row);
        const source = `${reserve.name}!${kind === 'deposit' ? 'B' : 'K'}${row}:${kind === 'deposit' ? 'H' : 'O'}${row}`;
        const rawNotes = rowRaw(reserve, row, columns.first, columns.last);
        if (rawAmount == null || rawAmount === '') {
          if (rawNotes) {
            issue(source, '금액이 없는 예비비 행을 확인해 주세요.');
            result.notes.push({ source, text: rawNotes });
          }
          continue;
        }
        const n = amount(reserve, columns.amount, row);
        if (n === null) {
          result.notes.push({ source, text: rawNotes });
          continue;
        }
        if (n === 0) issue(source, '0원으로 작성한 내역의 반영 여부를 확인해 주세요.');
        const when = dateText(value(reserve, columns.date, row), book);
        if (!when)
          issue(
            `${reserve.name}!${columns.date}${row}`,
            '날짜가 없거나 올바르지 않아 확인이 필요해요.',
          );
        const category = text(reserve, columns.category, row);
        if (!category)
          issue(`${reserve.name}!${columns.category}${row}`, '예비비 분류가 필요해요.');
        else if (!categories.has(category))
          issue(
            `${reserve.name}!${columns.category}${row}`,
            '분류 요약에 등록되지 않은 항목이에요. 금액을 누락하지 않고 별도 확인 대상으로 보존했어요.',
          );
        issue(
          source,
          kind === 'deposit'
            ? '입금 열에는 기초 잔액·자산 이동·수입이 섞일 수 있어요. 경제적 성격을 확인하기 전에는 수입으로 반영하지 않아요.'
            : '지출 열에도 자산 간 이동이 있을 수 있어요. 기존 월별 거래 중복과 경제적 성격을 확인해 주세요.',
        );
        result.reserveRows.push({
          key: `${reserve.name}!${kind}:${row}`,
          source,
          date: when,
          description: text(reserve, columns.description, row),
          amount: n,
          category,
          kind,
          notes: rawNotes,
        });
      }
    }
  }
  return result;
}
