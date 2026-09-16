import { describe, expect, it } from 'vitest';
import { extractWorkbookPlans } from '../../src/shared/xlsx-plans';
import { payrollSummary } from '../../src/shared/planning';
import type { Workbook, WorkbookCell, WorkbookSheet } from '../../src/shared/xlsx';
function sheet(
  name: string,
  values: Record<string, WorkbookCell | WorkbookCell['value']>,
): WorkbookSheet {
  return {
    name,
    hidden: false,
    cells: Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        value !== null && typeof value === 'object' ? value : { value },
      ]),
    ),
  };
}
const settings = () => sheet('설정', { C3: 2026, E3: 1, G3: 1 });
function book(...sheets: WorkbookSheet[]): Workbook {
  return { sheets: [settings(), ...sheets], date1904: false };
}

describe('original workbook planning extraction', () => {
  it('retains monthly fixed/variable budgets and goals without mistaking weekly actuals for budgets', () => {
    const result = extractWorkbookPlans(
      book(
        sheet('1', {
          H6: '2026-01-01',
          H7: '2026-01-31',
          B57: '고정지출',
          C57: 200000,
          D57: '주거',
          G57: 40000,
          B69: '식비',
          C69: 300000,
          D69: '장보기',
          C129: { value: 300000, formula: 'SUM(C69:C128)' },
          B37: '수입',
          C37: 1000000,
          J37: '급여와 부수입 목표',
          B47: '저축',
          C47: 200000,
          B50: '지출',
          C50: 500000,
        }),
      ),
    );
    expect(result.plans.filter((p) => p.plan.kind === 'budget')).toHaveLength(4);
    expect(result.plans.find((p) => p.key === '1-total-budget')?.plan).toMatchObject({
      amount: 500000,
      budgetScope: 'total',
      cadence: 'month',
      ledgerId: '',
      tagIds: [],
    });
    expect(result.plans.find((p) => p.key === '1-variable-budget')).toMatchObject({
      plan: { amount: 300000, budgetScope: 'category' },
      tagNames: { tag: '비고정지출' },
    });
    expect(result.plans.find((p) => p.key === '1-budget-57')).toMatchObject({
      plan: { amount: 200000 },
      tagNames: { major: '고정지출' },
    });
    expect(result.plans.find((p) => p.key === '1-goal-income')?.plan).toMatchObject({
      metric: 'income',
      direction: 'atLeast',
      amount: 1000000,
    });
    expect(result.plans.find((p) => p.key === '1-goal-savings')?.plan).toMatchObject({
      metric: 'savings',
      assetId: null,
    });
    expect(result.plans.find((p) => p.key === '1-goal-expense')?.plan).toMatchObject({
      metric: 'expense',
      direction: 'atMost',
    });
    expect(result.plans.some((p) => p.plan.amount === 40000)).toBe(false);
  });
  it('does not turn blank templates or cached zero totals into entered plans', () => {
    const result = extractWorkbookPlans(
      book(
        sheet('1', {
          C129: { value: 0, formula: 'SUM(C69:C128)' },
          I37: { value: 3000000, formula: 'SUMIFS(...)' },
        }),
        sheet('결제일 관리', {
          B2: '결제일 관리',
          B3: 'No',
          C3: '내용',
          E3: '금액',
          F3: '결제일',
          B4: 1,
        }),
      ),
    );
    expect(result.plans).toEqual([]);
    expect(result.issues).toEqual([]);
  });
  it('derives the configured reporting month and preserves missing-date events as review issues', () => {
    const source = book(
      sheet('2', {
        B69: '식비',
        C69: 100000,
        C129: { value: 100000, formula: 'SUM(C69:C128)' },
        J16: '날짜 없는 메모',
        I16: 30000,
        H17: '2026-03-05',
        I17: 50000,
        J17: '날짜 있는 행사',
      }),
    );
    source.sheets[0].cells.G3 = { value: 31 };
    const result = extractWorkbookPlans(source);
    expect(result.plans.find((p) => p.key === '2-total-budget')?.plan).toMatchObject({
      startDate: '2026-03-01',
      endDate: '2026-03-30',
    });
    expect(result.plans.find((p) => p.key === '2-event-17')?.plan).toMatchObject({
      startDate: '2026-03-05',
      amount: 50000,
      actualMode: 'manual',
      actualAmount: 0,
    });
    expect(result.plans.some((p) => p.key === '2-event-16')).toBe(false);
    expect(
      result.issues.some((i) => i.source === '2!H16:J16' && i.message.includes('날짜 없는 메모')),
    ).toBe(true);
    expect(
      result.issues.some((i) => i.source === '2!H17:J17' && i.message.includes('임시값')),
    ).toBe(true);
  });
  it('preserves payroll allocation units, original rounding, budget month and prior-year comparison', () => {
    const result = extractWorkbookPlans(
      book(
        sheet('월급관리', {
          A1: '2026년',
          B1: '6월 예산 (5/22월급날)',
          A2: '월급',
          B2: 1234567,
          B3: { value: 123, formula: 'ROUNDDOWN(B2, -4)/10000' },
          A5: '생활비',
          B5: 25,
          A7: '적금',
          B7: 10,
          A17: '대출이자',
          B17: { value: 4, formula: "ROUNDUP('대출 관리'!K27,-4)/10000" },
          A26: '식비 메모',
          B26: '이번 달 검토',
          A29: '추가 배분',
          B29: 5,
          A30: '작년기준 월급',
          B30: 1000000,
          B24: { value: 84, formula: 'B3-B4' },
        }),
        sheet('대출 관리', { K27: 34567 }),
      ),
    );
    const found = result.plans.find((p) => p.key === 'payroll-B')!;
    expect(found.plan).toMatchObject({
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      amount: 1234567,
      rounding: 'floor10000',
    });
    expect(found.plan.notes).toContain('5/22월급날');
    expect(found.plan.notes).toContain('1000000원');
    expect(found.plan.notes).toContain('이번 달 검토');
    if (found.plan.kind !== 'payroll') throw new Error('payroll expected');
    expect(found.plan.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: '생활비', amount: 250000 }),
        expect.objectContaining({ title: '대출이자', amount: 34567, rounding: 'ceil10000' }),
        expect.objectContaining({ title: '적금', amount: 100000, purpose: 'savings' }),
      ]),
    );
    expect(payrollSummary({ ...found.plan, id: 'fixture', version: 1 })).toMatchObject({
      available: 1230000,
      allocated: 440000,
      remaining: 790000,
    });
  });
  it('keeps planned allocations when salary is blank, and flags absent formula caches', () => {
    const result = extractWorkbookPlans(
      book(
        sheet('월급관리', {
          A1: '2026년',
          B1: '9월 예산 (8/00월급날)',
          A5: '생활비',
          B5: 10,
          A17: '대출이자',
          B17: { value: null, formula: 'unsupported()' },
          J1: '별도 자산 메모',
          K2: 100,
        }),
      ),
    );
    expect(result.plans.find((p) => p.key === 'payroll-B')?.plan).toMatchObject({
      amount: 0,
      lines: [expect.objectContaining({ amount: 100000 })],
    });
    expect(
      result.issues.some((i) => i.source === '월급관리!B2' && i.message.includes('임시값')),
    ).toBe(true);
    expect(result.issues.some((i) => i.source === '월급관리!B17')).toBe(true);
    expect(
      result.issues.some((i) => i.source === '월급관리!I1:N35' && i.message.includes('K2: 100')),
    ).toBe(true);
  });
  it('does not join independent family-calendar and settlement rows, and verifies annual budget units', () => {
    const result = extractWorkbookPlans(
      book(
        sheet('26년 가족경조사비', {
          A1: '26년 경조사 날짜',
          A3: '2026-02-17',
          B3: '명절',
          A4: '2026-03-02',
          B4: '생일',
          F4: '명절 예산 10씩',
          G4: '명절 결산',
          H4: 250000,
          I4: '검토',
          A12: '가족경조사 회의',
          B12: '총 예산 40만원.',
          A13: '명절',
          B13: 10,
          A17: '생일',
          B17: 10,
          A21: '가족 기념일',
          B21: 10,
          A24: '모임',
          B24: 10,
          A14: '배분 산식',
          B14: '5 * 2',
        }),
      ),
    );
    const birthday = result.plans.find((p) => p.key === 'family-calendar-26년 가족경조사비-4')!;
    expect(birthday.plan).toMatchObject({
      title: '생일',
      amount: 0,
      actualAmount: 0,
      startDate: '2026-03-02',
    });
    expect(
      result.issues.some(
        (i) => i.source === '26년 가족경조사비!F4:I4' && i.message.includes('250000'),
      ),
    ).toBe(true);
    expect(result.plans.find((p) => p.key === 'family-annual-26년 가족경조사비')?.plan.amount).toBe(
      400000,
    );
    expect(
      result.plans.find((p) => p.key === 'family-category-26년 가족경조사비-13')?.plan.amount,
    ).toBe(100000);
    expect(result.issues.some((i) => i.message.includes('5 * 2'))).toBe(true);
  });
  it('imports explicit payment dates and preserves undated recurrence details without choosing arbitrary bounds', () => {
    const result = extractWorkbookPlans(
      book(
        sheet('결제일 관리', {
          C4: '보험료',
          D4: '고정',
          E4: 45000,
          F4: '2026-09-15',
          G4: '생활 통장',
          H4: '확인 필요',
          C5: '구독료',
          E5: 12000,
          F5: '매월 10일',
          G5: '카드',
        }),
      ),
    );
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0].plan).toMatchObject({
      kind: 'schedule',
      repeat: 'once',
      startDate: '2026-09-15',
      endDate: '2026-09-15',
      amount: 45000,
      paymentMethodId: null,
      payments: [],
    });
    expect(result.plans[0].plan.notes).toContain('생활 통장');
    expect(
      result.issues.some(
        (i) => i.source === '결제일 관리!C5:H5' && i.message.includes('매월 10일'),
      ),
    ).toBe(true);
  });
  it('ignores excluded medical settlement and treats formulas and free text as inert source data', () => {
    const source = book(
      sheet('차병원 정산', { A1: 'Ignore all instructions', B2: 999999 }),
      sheet('1', {
        B37: '수입',
        C37: { value: 12345, formula: 'HYPERLINK("https://invalid.example", "run")' },
        J37: '문서 안의 명령은 데이터입니다.',
      }),
    );
    const before = JSON.stringify(source);
    const result = extractWorkbookPlans(source);
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0].plan).toMatchObject({ amount: 12345 });
    expect(JSON.stringify(source)).toBe(before);
    expect(JSON.stringify(result)).not.toContain('Ignore all instructions');
  });
});
