import { accountingPeriod, type PlanInput, type PayrollLine } from './planning';
import { cellValue, excelDate, type Workbook, type WorkbookCell, type WorkbookSheet } from './xlsx';

export interface ExtractedPlan {
  key: string;
  source: string;
  plan: PlanInput;
  tagNames?: { major?: string; minor?: string; tag?: string };
}
export interface PlanExtractionIssue {
  source: string;
  message: string;
}
export interface WorkbookPlans {
  plans: ExtractedPlan[];
  issues: PlanExtractionIssue[];
}
type Period = { startDate: string; endDate: string };
const present = (value: unknown) => value !== undefined && value !== null && value !== '';
const label = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
function strictDate(value: unknown, book: Workbook): string | null {
  let result: string | null = null;
  if (typeof value === 'number' && value > 60) result = excelDate(value, book.date1904);
  else if (typeof value === 'string')
    result =
      value.match(/^(\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?$/)?.[1] ?? null;
  if (
    !result ||
    !Number.isFinite(Date.parse(`${result}T00:00:00Z`)) ||
    new Date(`${result}T00:00:00Z`).toISOString().slice(0, 10) !== result
  )
    return null;
  return result >= '0001-01-01' && result <= '9998-12-31' ? result : null;
}
function amount(value: unknown, unit = 1): number | null {
  if (typeof value === 'string') {
    const match = value.trim().match(/^([\d,]+(?:\.\d+)?)\s*(만원|원)?$/);
    if (!match) return null;
    unit = match[2] === '만원' ? 10000 : match[2] === '원' ? 1 : unit;
    value = Number(match[1].replaceAll(',', ''));
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const scaled = value * unit,
    rounded = Math.round(scaled);
  return Math.abs(scaled - rounded) < 0.00001 &&
    Number.isSafeInteger(rounded) &&
    rounded <= 1_000_000_000_000
    ? rounded
    : null;
}
function yearValue(value: unknown): number | null {
  const result =
    typeof value === 'number' ? value : Number(label(value).match(/(?:^|\D)(\d{4})년?/)?.[1]);
  return Number.isInteger(result) && result >= 1900 && result <= 9998 ? result : null;
}
function column(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Read source facts and cached formula values only. Never execute formula text or infer undated transactions. */
export function extractWorkbookPlans(book: Workbook): WorkbookPlans {
  const result: WorkbookPlans = { plans: [], issues: [] };
  const issueKeys = new Set<string>();
  const issue = (source: string, message: string) => {
    if (!issueKeys.has(source + message)) {
      result.issues.push({ source, message });
      issueKeys.add(source + message);
    }
  };
  const cell = (sheet: string, address: string): WorkbookCell | undefined =>
    book.sheets.find((s) => s.name === sheet)?.cells[address];
  const raw = (sheet: string, addresses: string[]) =>
    addresses
      .filter((address) => present(cellValue(book, sheet, address)) || cell(sheet, address)?.error)
      .map(
        (address) =>
          `${address}: ${cell(sheet, address)?.error ? `[${cell(sheet, address)!.error}] ` : ''}${String(cellValue(book, sheet, address) ?? '')}`,
      )
      .join('\n');
  const configuredYear = yearValue(cellValue(book, '설정', 'C3'));
  const configuredStartMonth = Number(cellValue(book, '설정', 'E3'));
  const configuredStartDay = Number(cellValue(book, '설정', 'G3'));
  const validDay =
    Number.isInteger(configuredStartDay) && configuredStartDay >= 1 && configuredStartDay <= 31
      ? configuredStartDay
      : 1;
  function notes(source: string, value: string) {
    const complete = `원본: ${source}\n${value}`.trim();
    if (complete.length <= 2000) return complete;
    issue(source, `메모 길이 제한으로 전체 원문은 검토 자료에 보존했습니다.\n${complete}`);
    return complete.slice(0, 1900) + '\n[이후 내용은 가져오기 검토 자료에서 확인]';
  }
  function base(source: string, title: string, period: Period, target: number, text = '') {
    return {
      ledgerId: '',
      title: title.slice(0, 120),
      ...period,
      amount: target,
      tagIds: [] as string[],
      paymentMethodId: null,
      ownerId: null,
      includeLinked: true,
      notes: notes(source, text),
      archived: false,
    };
  }
  function readMoney(sheet: string, address: string, unit = 1) {
    const c = cell(sheet, address);
    if (!c) return null;
    if (!present(c.value) && !c.error) {
      if (c.formula)
        issue(`${sheet}!${address}`, '수식의 저장된 결과가 없어 금액을 가져오지 않았습니다.');
      return null;
    }
    const value = c.error ? null : amount(c.value, unit);
    if (value === null)
      issue(
        `${sheet}!${address}`,
        `금액 또는 저장된 수식 결과를 확인해야 합니다. ${raw(sheet, [address])}`,
      );
    return value;
  }
  function sheetPeriod(sheet: WorkbookSheet): Period | null {
    const startDate = strictDate(cellValue(book, sheet.name, 'H6'), book),
      endDate = strictDate(cellValue(book, sheet.name, 'H7'), book);
    if (startDate && endDate && startDate <= endDate) return { startDate, endDate };
    const y = yearValue(cellValue(book, sheet.name, 'F5'));
    const m = Number(cellValue(book, sheet.name, 'G5'));
    if (y && Number.isInteger(m) && m >= 1 && m <= 12) {
      const day = Number(cellValue(book, sheet.name, 'H5')) || validDay;
      if (Number.isInteger(day) && day >= 1 && day <= 31)
        return accountingPeriod(`${y}-${String(m).padStart(2, '0')}`, day);
    }
    if (
      configuredYear &&
      Number.isInteger(configuredStartMonth) &&
      configuredStartMonth >= 1 &&
      configuredStartMonth <= 12
    ) {
      const index = configuredStartMonth + Number(sheet.name) - 2;
      return accountingPeriod(
        `${configuredYear + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`,
        validDay,
      );
    }
    issue(
      `${sheet.name}!F5:H7`,
      '월별 계획의 집계 기간이 없습니다. 설정 연월 또는 시작일·종료일을 확인해 주세요.',
    );
    return null;
  }
  const budgetRows = [57, 69, 75, 79, 86, 92, 98, 104, 112, 117, 120, 125];
  for (const sheet of book.sheets.filter((s) => /^(?:[1-9]|1[0-2])$/.test(s.name))) {
    const period = sheetPeriod(sheet);
    const name = sheet.name;
    if (!period) continue;
    const monthTitle = `${name}번 시트`;
    const entered: { row: number; amount: number }[] = [];
    for (const row of budgetRows) {
      const value = readMoney(name, `C${row}`);
      if (value === null) continue;
      const major = label(cellValue(book, name, `B${row}`));
      if (!major) {
        issue(`${name}!B${row}:C${row}`, '예산 금액에 대응하는 대분류가 없습니다.');
        continue;
      }
      entered.push({ row, amount: value });
      const source = `${name}!B${row}:C${row}`;
      result.plans.push({
        key: `${name}-budget-${row}`,
        source,
        plan: {
          ...base(
            source,
            `${monthTitle} ${major} 예산`,
            period,
            value,
            '대분류별 월 예산. 주차별 금액은 실제 거래에서 다시 집계합니다.',
          ),
          kind: 'budget',
          cadence: 'month',
          budgetScope: 'category',
        },
        tagNames: { major },
      });
    }
    const variableRows = entered.filter((r) => r.row !== 57);
    const totalCell = cell(name, 'C129');
    // C129 sums variable budgets only. A cached zero without any entered budgets means blank planning, not a zero limit.
    if (variableRows.length || (present(totalCell?.value) && !totalCell?.formula)) {
      const total =
        readMoney(name, 'C129') ??
        (variableRows.length ? variableRows.reduce((sum, row) => sum + row.amount, 0) : null);
      if (total !== null) {
        const source = `${name}!C129`;
        result.plans.push({
          key: `${name}-variable-budget`,
          source,
          plan: {
            ...base(
              source,
              `${monthTitle} 비고정지출 총예산`,
              period,
              total,
              '원본 C129는 C69:C128만 합산하며 고정지출 C57은 제외합니다. 비고정지출 태그가 붙은 원본 거래와 비교합니다.',
            ),
            kind: 'budget',
            cadence: 'month',
            budgetScope: 'category',
          },
          tagNames: { tag: '비고정지출' },
        });
        if (variableRows.length && total !== variableRows.reduce((sum, row) => sum + row.amount, 0))
          issue(
            source,
            `저장된 비고정 총예산 ${total}원과 입력 항목 합계 ${variableRows.reduce((sum, row) => sum + row.amount, 0)}원이 다릅니다. 수식 캐시를 확인해 주세요.`,
          );
      }
    }
    if (entered.length) {
      const source = `${name}!${entered.map((r) => `C${r.row}`).join('+')}`;
      result.plans.push({
        key: `${name}-total-budget`,
        source,
        plan: {
          ...base(
            source,
            `${monthTitle} 전체 예산`,
            period,
            entered.reduce((sum, row) => sum + row.amount, 0),
            '원본에서 입력한 고정·비고정 대분류 예산을 합산한 전체 예산입니다. 미입력 분류는 합계에 더하지 않았습니다. 원본 C129의 비고정 총예산과 구분합니다.',
          ),
          kind: 'budget',
          cadence: 'month',
          budgetScope: 'total',
        },
      });
    }
    for (const [row, metric, direction] of [
      [37, 'income', 'atLeast'],
      [47, 'savings', 'atLeast'],
      [50, 'expense', 'atMost'],
    ] as const) {
      const value = readMoney(name, `C${row}`),
        detail = raw(name, [`J${row}`]);
      if (value === null) {
        if (detail)
          issue(
            `${name}!C${row}:J${row}`,
            `목표 금액은 미입력이며 세부 목표만 있습니다.\n${detail}`,
          );
        continue;
      }
      const source = `${name}!C${row}:J${row}`;
      result.plans.push({
        key: `${name}-goal-${metric}`,
        source,
        plan: {
          ...base(
            source,
            `${monthTitle} ${label(cellValue(book, name, `B${row}`)) || metric} 목표`,
            period,
            value,
            detail +
              (metric === 'savings'
                ? '\n저축은 기존 지출 분류가 아닌 실제 자산 순저축 효과로 재집계합니다.'
                : ''),
          ),
          kind: 'goal',
          metric,
          direction,
          assetId: null,
        },
      });
    }
    for (let row = 16; row <= 24; row++) {
      const addresses = [`H${row}`, `I${row}`, `J${row}`];
      if (!addresses.some((a) => present(cellValue(book, name, a)))) continue;
      const source = `${name}!H${row}:J${row}`,
        when = strictDate(cellValue(book, name, `H${row}`), book),
        title = label(cellValue(book, name, `J${row}`));
      if (!when) {
        issue(
          source,
          `이달의 이벤트에 날짜가 없어 날짜를 만들지 않았습니다.\n${raw(name, addresses)}`,
        );
        continue;
      }
      const target = readMoney(name, `I${row}`);
      if (target === null)
        issue(source, '행사 예산이 미입력입니다. 가져온 계획의 0원은 미입력 임시값입니다.');
      issue(
        source,
        '행사 실제 금액은 원본에 없습니다. 수동 실적 0원은 미입력 임시값이며 거래 연결 확인이 필요합니다.',
      );
      result.plans.push({
        key: `${name}-event-${row}`,
        source,
        plan: {
          ...base(
            source,
            title || `${monthTitle} 행사 ${row - 15}`,
            { startDate: when, endDate: when },
            target ?? 0,
            `${raw(name, addresses)}\n${target === null ? '예산 미입력(0원은 임시값). ' : ''}실제 지출 연결 미확인(수동 실적 0원은 임시값).`,
          ),
          kind: 'event',
          actualMode: 'manual',
          actualAmount: 0,
          evaluation: '',
        },
      });
    }
  }

  const payroll = book.sheets.find((s) => s.name === '월급관리');
  if (payroll) {
    const year = yearValue(cellValue(book, payroll.name, 'A1')) ?? configuredYear;
    const extraRows = [26, 27, 28, 29];
    for (let index = 1; index <= 7; index++) {
      const col = column(index),
        header = label(cellValue(book, payroll.name, `${col}1`));
      const match = header.match(/(?:^|\s)(\d{1,2})월\s*예산/);
      if (!match) {
        if (
          [2, ...Array.from({ length: 18 }, (_, i) => i + 5), ...extraRows].some((r) =>
            present(cellValue(book, payroll.name, `${col}${r}`)),
          )
        )
          issue(
            `${payroll.name}!${col}1:${col}29`,
            `급여 계획의 예산월을 확인할 수 없습니다.\n${raw(
              payroll.name,
              [1, 2, ...extraRows].map((r) => `${col}${r}`),
            )}`,
          );
        continue;
      }
      const month = Number(match[1]);
      if (!year || month < 1 || month > 12) {
        issue(`${payroll.name}!${col}1`, `예산 연월을 확인해 주세요. ${header}`);
        continue;
      }
      const source = `${payroll.name}!A1:${col}30`,
        period = accountingPeriod(`${year}-${String(month).padStart(2, '0')}`, validDay);
      const salary = readMoney(payroll.name, `${col}2`),
        lines: PayrollLine[] = [],
        details: string[] = [
          `예산월: ${header}`,
          '원본 급여는 원, 배분·잔여금 표시는 만원 단위입니다. 실제 입금일 대신 명시된 예산월에 연결합니다.',
        ];
      for (const row of [...Array.from({ length: 18 }, (_, i) => i + 5), ...extraRows]) {
        const address = `${col}${row}`,
          c = cell(payroll.name, address);
        if (!present(c?.value) && !c?.error && !c?.formula) continue;
        const title = label(cellValue(book, payroll.name, `A${row}`));
        if (!title) {
          issue(
            `${payroll.name}!${address}`,
            `배분 항목명이 없습니다. ${raw(payroll.name, [address])}`,
          );
          continue;
        }
        const reference = c?.formula?.match(
          /^=?ROUNDUP\(\s*(?:'([^']+)'|([^!]+))!\$?([A-Z]+)\$?(\d+)\s*,\s*-4\s*\)\s*\/\s*10000\s*$/i,
        );
        const referenced = reference
          ? amount(cellValue(book, reference[1] ?? reference[2], `${reference[3]}${reference[4]}`))
          : null;
        const value = referenced ?? (c?.error ? null : amount(c?.value, 10000));
        if (value === null) {
          details.push(`${title} (${address}): ${String(c?.value ?? c?.error ?? '')}`);
          if (c?.error || c?.formula)
            issue(
              `${payroll.name}!${address}`,
              '급여 배분 수식의 저장된 금액이 없어 배분 합계에서 제외했습니다.',
            );
          continue;
        }
        lines.push({
          id: `xlsx-${col}-${row}`,
          title,
          amount: value,
          rounding: reference ? 'ceil10000' : 'none',
          purpose: /저축|청약|적금|투자/.test(title) ? 'savings' : row <= 22 ? 'expense' : 'other',
          assetId: null,
        });
        if (reference)
          details.push(
            `${address}: 원본 ROUNDUP(참조금액,-4)/10000 규칙을 만원 단위 올림으로 보존. ${reference[1] ?? reference[2]}!${reference[3]}${reference[4]}`,
          );
      }
      if (salary === null && !lines.length && details.length === 2) continue;
      if (salary === null) {
        details.push('급여 원금액 미입력: 0원은 임시값이며 배분 계획만 보존합니다.');
        issue(
          `${payroll.name}!${col}2`,
          '급여 원금액이 미입력입니다. 배분 계획을 보존하며 급여 0원은 임시값입니다.',
        );
      }
      const previous = readMoney(payroll.name, `${col}30`);
      if (previous !== null) details.push(`작년 기준 월급 (${col}30): ${previous}원`);
      if (present(cellValue(book, payroll.name, `${col}24`)))
        details.push(
          `원본 월급-고정지출 (${col}24, 만원): ${String(cellValue(book, payroll.name, `${col}24`))}. 새 잔여금은 추가 배분 항목까지 뺀 금액입니다.`,
        );
      if (/\d+\/00/.test(header))
        issue(
          `${payroll.name}!${col}1`,
          `급여일 표기가 불완전합니다. 실제 입금일은 만들지 않았습니다. ${header}`,
        );
      result.plans.push({
        key: `payroll-${col}`,
        source,
        plan: {
          ...base(
            source,
            `${year}년 ${month}월 월급 배분`,
            period,
            salary ?? 0,
            details.join('\n'),
          ),
          kind: 'payroll',
          rounding: /ROUNDDOWN/i.test(cell(payroll.name, `${col}3`)?.formula ?? '')
            ? 'floor10000'
            : 'none',
          lines,
        },
      });
    }
    const extraMonth = label(cellValue(book, payroll.name, 'B32')).match(/^(\d{1,2})월/);
    if (extraMonth && year && Number(extraMonth[1]) >= 1 && Number(extraMonth[1]) <= 12) {
      const lines: PayrollLine[] = [];
      for (let row = 33; row <= 35; row++) {
        const value = readMoney(payroll.name, `B${row}`, 10000),
          title = label(cellValue(book, payroll.name, `A${row}`));
        if (value !== null && title)
          lines.push({
            id: `xlsx-extra-${row}`,
            title,
            amount: value,
            rounding: 'none',
            purpose: 'expense',
            assetId: null,
          });
      }
      if (lines.length) {
        const source = `${payroll.name}!A32:B35`;
        result.plans.push({
          key: 'payroll-extra',
          source,
          plan: {
            ...base(
              source,
              `${year}년 ${extraMonth[1]}월 별도 배분안`,
              accountingPeriod(`${year}-${extraMonth[1].padStart(2, '0')}`, validDay),
              0,
              raw(payroll.name, ['B32', 'A33', 'B33', 'A34', 'B34', 'A35', 'B35']) +
                '\n급여 원금액 미입력(0원은 임시값). 배분 단위는 본 시트의 만원 단위입니다.',
            ),
            kind: 'payroll',
            rounding: 'none',
            lines,
          },
        });
        issue(source, '별도 배분안의 급여 금액이 없습니다. 월급 원금액을 확인해 주세요.');
      }
    }
    const aside = Object.keys(payroll.cells).filter(
      (a) => /^(?:I|J|K|L|M|N)\d+$/.test(a) && present(payroll.cells[a].value),
    );
    if (aside.length)
      issue(
        `${payroll.name}!I1:N35`,
        `급여 표 밖의 자산·비교·자유 메모입니다. 날짜·금액 단위를 임의로 정하지 않았습니다.\n${raw(payroll.name, aside)}`,
      );
  }

  for (const sheet of book.sheets.filter((s) => /가족경조사/.test(s.name))) {
    const year =
      yearValue(sheet.name) ?? yearValue(cellValue(book, sheet.name, 'A1')) ?? configuredYear;
    for (let row = 3; row <= 10; row++) {
      const dateRaw = cellValue(book, sheet.name, `A${row}`),
        title = label(cellValue(book, sheet.name, `B${row}`));
      if (!present(dateRaw) && !title) continue;
      const source = `${sheet.name}!A${row}:B${row}`,
        when = strictDate(dateRaw, book);
      if (!when || !title) {
        issue(
          source,
          `가족 행사 날짜 또는 제목을 확인해 주세요.\n${raw(sheet.name, [`A${row}`, `B${row}`])}`,
        );
        continue;
      }
      issue(
        source,
        '날짜 있는 행사 달력만 가져왔습니다. 예산·실적은 미입력 임시값 0원이며 별도 결산표와의 대응을 확인해 주세요.',
      );
      result.plans.push({
        key: `family-calendar-${sheet.name}-${row}`,
        source,
        plan: {
          ...base(
            source,
            title,
            { startDate: when, endDate: when },
            0,
            '날짜가 있는 행사 달력입니다. 별도 F:I 예산·결산 표와 행이 일치하지 않아 자동 연결하지 않았습니다. 예산·실적 0원은 미입력 임시값입니다.',
          ),
          kind: 'event',
          actualMode: 'manual',
          actualAmount: 0,
          evaluation: '',
        },
      });
    }
    for (let row = 3; row <= 10; row++) {
      const addresses = ['F', 'G', 'H', 'I'].map((c) => `${c}${row}`);
      if (addresses.some((a) => present(cellValue(book, sheet.name, a))))
        issue(
          `${sheet.name}!F${row}:I${row}`,
          `날짜 없는 가족 행사 예산·결산입니다. 왼쪽 달력과 행이 일치하지 않아 날짜를 임의 연결하지 않았습니다.\n${raw(sheet.name, addresses)}`,
        );
    }
    const annualText = label(cellValue(book, sheet.name, 'B12'));
    const annualMatch = annualText.match(/총\s*예산\s*([\d,.]+)\s*(만원|원)/);
    const annualAmount = annualMatch ? amount(annualMatch[1] + annualMatch[2]) : null;
    const familyRows = [13, 17, 21, 24];
    if (year && annualAmount !== null) {
      const period = { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
      const inferredUnit =
        familyRows.every((r) => typeof cellValue(book, sheet.name, `B${r}`) === 'number') &&
        familyRows.reduce(
          (sum, r) => sum + Number(cellValue(book, sheet.name, `B${r}`)) * 10000,
          0,
        ) === annualAmount
          ? 10000
          : null;
      const source = `${sheet.name}!A12:B24`;
      result.plans.push({
        key: `family-annual-${sheet.name}`,
        source,
        plan: {
          ...base(
            source,
            `${year}년 가족경조사 총예산`,
            period,
            annualAmount,
            raw(sheet.name, ['A12', 'B12']) +
              '\n가족경조사비 태그를 실제 거래에 대응한 뒤 실적을 비교해 주세요.',
          ),
          kind: 'budget',
          cadence: 'period',
          budgetScope: 'category',
        },
        tagNames: { tag: '가족경조사비' },
      });
      for (const row of familyRows) {
        const title = label(cellValue(book, sheet.name, `A${row}`)),
          rawAmount = cellValue(book, sheet.name, `B${row}`);
        if (!present(rawAmount)) continue;
        const value = inferredUnit
          ? amount(rawAmount, inferredUnit)
          : typeof rawAmount === 'string' && /만원|원/.test(rawAmount)
            ? amount(rawAmount)
            : null;
        const rowSource = `${sheet.name}!A${row}:C${row}`;
        if (value === null || !title) {
          issue(
            rowSource,
            `가족경조사 항목 예산의 단위/분류를 확인해야 합니다.\n${raw(sheet.name, [`A${row}`, `B${row}`, `C${row}`])}`,
          );
          continue;
        }
        result.plans.push({
          key: `family-category-${sheet.name}-${row}`,
          source: rowSource,
          plan: {
            ...base(
              rowSource,
              `${year}년 가족경조사 ${title}`,
              period,
              value,
              `연간 총예산 ${annualAmount}원과 항목 합계가 일치하는 단위로 환산했습니다.\n${raw(sheet.name, [`A${row}`, `B${row}`, `C${row}`])}`,
            ),
            kind: 'budget',
            cadence: 'period',
            budgetScope: 'category',
          },
          tagNames: { tag: `가족경조사비 · ${title}` },
        });
      }
      issue(
        source,
        '연간 가족경조사 예산을 보존했습니다. 이 표의 분류와 실제 거래 태그의 대응이 원본에 정의돼 있지 않아 확인이 필요합니다.',
      );
    }
    const detailAddresses = [14, 15, 18, 19, 22].flatMap((r) =>
      ['A', 'B', 'C'].map((c) => `${c}${r}`),
    );
    if (detailAddresses.some((a) => present(cellValue(book, sheet.name, a))))
      issue(
        `${sheet.name}!A14:C22`,
        `가족경조사 세부 배분/산식 원문입니다. 문자로 작성된 산식은 실행하지 않았습니다.\n${raw(sheet.name, detailAddresses)}`,
      );
  }

  const schedules = book.sheets.find((s) => s.name.replaceAll(' ', '') === '결제일관리');
  if (schedules)
    for (let row = 4; row <= 33; row++) {
      const addresses = ['C', 'D', 'E', 'F', 'G', 'H'].map((c) => `${c}${row}`);
      if (!addresses.some((a) => present(cellValue(book, schedules.name, a)))) continue;
      const source = `${schedules.name}!C${row}:H${row}`,
        when = strictDate(cellValue(book, schedules.name, `F${row}`), book),
        target = readMoney(schedules.name, `E${row}`),
        title = label(cellValue(book, schedules.name, `C${row}`));
      if (!when || target === null || !title) {
        issue(
          source,
          `결제 일정의 정확한 날짜·내용·금액을 확인해 주세요. 일자만 있는 반복 일정은 시작·종료 기간을 임의로 정하지 않았습니다.\n${raw(schedules.name, addresses)}`,
        );
        continue;
      }
      result.plans.push({
        key: `payment-schedule-${row}`,
        source,
        plan: {
          ...base(
            source,
            title,
            { startDate: when, endDate: when },
            target,
            raw(schedules.name, addresses) +
              '\n원본 결제수단 이름은 메모로 보존했습니다. 등록한 결제수단에 연결해 주세요.',
          ),
          kind: 'schedule',
          repeat: 'once',
          payments: [],
        },
      });
    }
  return result;
}
