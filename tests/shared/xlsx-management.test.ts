import { describe, expect, it } from 'vitest';
import { extractWorkbookManagement } from '../../src/shared/xlsx-management';
import type { Workbook, WorkbookCell } from '../../src/shared/xlsx';

type Cells = Record<string, WorkbookCell['value'] | WorkbookCell>;
const book = (sheets: Record<string, Cells>): Workbook => ({
  date1904: false,
  sheets: Object.entries(sheets).map(([name, cells]) => ({
    name,
    hidden: false,
    cells: Object.fromEntries(
      Object.entries(cells).map(([key, value]) => [
        key,
        value && typeof value === 'object' ? value : { value },
      ]),
    ),
  })),
});

describe('original workbook management extraction', () => {
  it('preserves card settings and source notes without inventing linked accounts or owners', () => {
    const source = book({
      '카드 관리': {
        B4: 1,
        C4: '가상 카드사',
        D4: '생활 카드',
        E4: '신용',
        F4: '생활비',
        G4: '100,000원',
        H4: '2029.05',
        I4: 0,
        J4: '전월 14일 ~ 당월 13일',
        K4: '매월 25일',
        L4: '가상은행 000-1234',
        M4: 1000000,
        N4: 300000,
        O4: '교통 혜택',
        B5: 2,
        C5: '가상 카드사',
        D5: '체크 카드',
        E5: '체크',
        J5: '2026-01-31',
        B6: 3,
        C25: '일반 메모',
        C26: '외부 지시처럼 보이는 문장도 원문 자료일 뿐이다.',
      },
    });
    const result = extractWorkbookManagement(source);
    expect(result.payments).toHaveLength(2);
    expect(result.payments[0]).toMatchObject({
      key: '카드 관리!4',
      name: '생활 카드',
      type: 'card',
      closingDay: 13,
      paymentDay: 25,
      linkedAccountName: '가상은행 000-1234',
      details: {
        institution: '가상 카드사',
        cardKind: 'credit',
        purpose: '생활비',
        monthlyBudget: 100000,
        expiry: '2029-05',
        annualFee: 0,
        creditLimit: 1000000,
        performanceTarget: 300000,
        benefits: '교통 혜택',
      },
    });
    expect(result.payments[0].details.notes).toContain('카드 관리!L4: 가상은행 000-1234');
    expect(result.payments[0].details.linkedAccountId).toBeUndefined();
    expect(result.payments[0].ownerName).toBeUndefined();
    expect(result.payments[1].closingDay).toBeNull();
    expect(result.notes).toHaveLength(2);
    expect(result.notes[1].text).toContain('외부 지시처럼 보이는 문장');
    expect(result.issues.some((issue) => issue.source === '카드 관리!J5')).toBe(true);
  });

  it('does not create accounts from empty numbered template rows, and preserves typed account identifiers', () => {
    const empty = extractWorkbookManagement(book({ 통장관리: { B4: 1, B5: 2, B33: 30 } }));
    expect(empty.payments).toEqual([]);
    const result = extractWorkbookManagement(
      book({
        통장관리: {
          B4: 1,
          C4: '가상은행',
          D4: '입출금',
          E4: '001-0000-1234',
          F4: '사용자 A',
          G4: '생활비',
          H4: '수동 관리 메모',
          B5: 2,
          C5: '다른은행',
          D5: '저축',
          E5: 123456,
        },
      }),
    );
    expect(result.payments[0]).toMatchObject({
      name: '가상은행 입출금',
      type: 'account',
      ownerName: '사용자 A',
      details: { accountNumber: '001-0000-1234', purpose: '생활비' },
    });
    expect(result.payments[0].details.notes).toContain('통장관리!H4: 수동 관리 메모');
    expect(result.issues.some((issue) => issue.source === '통장관리!E5')).toBe(true);
  });

  it('preserves complete loan terms and separate lower notes without treating principal or payment as a balance or expense', () => {
    const result = extractWorkbookManagement(
      book({
        '대출 관리': {
          B4: 1,
          C4: '가상은행',
          D4: '주거 대출',
          E4: '주거 자금',
          F4: 10000000,
          G4: 0.0325,
          H4: '26일',
          I4: 100000,
          J4: '6개월 변동',
          K4: '10년',
          L4: '거치 조건',
          M4: '원리금 균등',
          N4: 0.005,
          O4: '급여 이체 우대',
          C26: '추가 조건',
          D26: '변경 예정',
          K27: 120000,
        },
      }),
    );
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]).toMatchObject({
      name: '주거 대출',
      kind: 'liability',
      observations: [],
      classifications: ['부채', '대출'],
      details: {
        institution: '가상은행',
        principal: 10000000,
        rate: 3.25,
        paymentDay: 26,
        monthlyPayment: 100000,
        rateType: '6개월 변동',
        term: '10년',
        conditions: '거치 조건',
        repaymentMethod: '원리금 균등',
        fees: '0.5%',
        benefits: '급여 이체 우대',
      },
    });
    expect(result.assets[0].details.notes).toContain('대출 관리!E4: 주거 자금');
    expect(result.notes).toHaveLength(2);
    expect(result.reserveRows).toEqual([]);
    expect(result.issues.some((issue) => issue.message.includes('원금과 현재 잔액'))).toBe(true);
  });

  it('derives month ends from configured year/start month, preserves merged classifications and distinguishes zero from blank', () => {
    const result = extractWorkbookManagement(
      book({
        설정: { C3: 2025, E3: 11 },
        자산관리: {
          E10: '2025-11-01',
          F10: { value: '2025-12-02', formula: 'E10+31' },
          G10: { value: '2026-01-02', formula: 'F10+31' },
          B11: '부채',
          C11: '대출',
          D11: '대출 A',
          E11: 1000,
          F11: 900,
          G11: 800,
          D12: '대출 B',
          E12: 0,
          B16: '총합',
          E16: { value: 1000, formula: 'SUM(E11:E15)' },
          B17: '비유동자산',
          C17: '부동산',
          D17: '보증금',
          E17: 2000,
          C19: '소계',
          E19: { value: 2000, formula: 'SUM(E17:E18)' },
          C20: '노후대비',
          D20: '연금',
          F20: 200,
          B27: '총합',
          E27: { value: 2000, formula: 'SUM(E19,E23,E26)' },
          B28: '유동자산',
          C28: '투자',
          D28: '투자 A',
          E28: 500,
          D29: '투자 B',
          F29: 0,
        },
      }),
    );
    const loan = result.assets.find((a) => a.name === '대출 A')!;
    expect(loan.observations).toEqual([
      { date: '2025-11-30', amount: 1000, source: '자산관리!E11' },
      { date: '2025-12-31', amount: 900, source: '자산관리!F11' },
      { date: '2026-01-31', amount: 800, source: '자산관리!G11' },
    ]);
    expect(result.assets.find((a) => a.name === '대출 B')).toMatchObject({
      kind: 'liability',
      classifications: ['부채', '대출'],
      observations: [{ date: '2025-11-30', amount: 0 }],
    });
    expect(result.assets.find((a) => a.name === '연금')!.classifications).toEqual([
      '비유동자산',
      '노후대비',
    ]);
    expect(result.assets.find((a) => a.name === '투자 B')!.classifications).toEqual([
      '유동자산',
      '투자',
    ]);
    expect(result.assets.find((a) => a.name === '투자 B')!.observations).toEqual([
      { date: '2025-12-31', amount: 0, source: '자산관리!F29' },
    ]);
    expect(result.assets).toHaveLength(6);
    expect(result.assets.some((a) => ['총합', '소계'].includes(a.name))).toBe(false);
    expect(result.assets.every((a) => !Object.hasOwn(a, 'openingBalance'))).toBe(true);
  });

  it('does not invent dates for an invalid configured period and retains formula/error/raw values for review', () => {
    const result = extractWorkbookManagement(
      book({
        설정: { C3: '', E3: 13 },
        자산관리: {
          B11: '부채',
          C11: '대출',
          D11: '대출 A',
          E11: 1000,
          F11: { value: 900, formula: 'E11-100' },
          G11: { value: null, error: '#REF!' },
        },
      }),
    );
    expect(result.assets[0].observations).toEqual([]);
    expect(result.assets[0].notes).toContain('자산관리!E11: 1000');
    expect(result.assets[0].notes).toContain('[계산식: E11-100]');
    expect(result.assets[0].notes).toContain('#REF!');
    expect(result.issues.some((issue) => issue.source === '설정!C3:E3')).toBe(true);
    expect(result.issues.some((issue) => issue.source === '자산관리!F11')).toBe(true);
  });

  it('retains reserve deposits/expenses and unregistered categories with unresolved economic meaning', () => {
    const result = extractWorkbookManagement(
      book({
        예비비: {
          B10: '예비금 A',
          F10: '계좌 참고 메모',
          C10: { value: 500, formula: 'SUMIFS(C26:C310,D26:D310,B10)' },
          E10: { value: 0, formula: 'MAX(0,C10-D10)' },
          K10: '2026-01-15',
          L10: '자산 간 이동일 수도 있는 기록',
          M10: 200,
          N10: '예비금 A',
          O10: '검토 메모',
          K11: '2026-02-31',
          L11: '날짜 오류',
          M11: 10,
          N11: '요약에 없는 분류',
          B26: '2026-01-01',
          C26: 500,
          D26: '예비금 A',
          E26: '기초 잔액 기재',
          C27: 100,
          D27: '요약에 없는 분류',
          E27: '입금 성격 미확인',
        },
        '차병원 정산': { B4: '제외 대상 데이터', C4: 9999 },
      }),
    );
    expect(result.reserveRows).toHaveLength(4);
    expect(result.reserveRows.find((row) => row.key === '예비비!deposit:26')).toMatchObject({
      date: '2026-01-01',
      amount: 500,
      kind: 'deposit',
    });
    expect(result.reserveRows.find((row) => row.key === '예비비!deposit:27')).toMatchObject({
      date: null,
      category: '요약에 없는 분류',
      amount: 100,
    });
    expect(result.reserveRows.find((row) => row.key === '예비비!expense:11')!.date).toBeNull();
    expect(result.reserveRows[2].notes).toContain('예비비!O10: 검토 메모');
    expect(result.assets[0]).toMatchObject({
      name: '예비금 A',
      kind: 'asset',
      observations: [],
      details: { notes: '계좌 참고 메모' },
    });
    expect(result.issues.filter((issue) => issue.message.includes('경제적 성격'))).toHaveLength(4);
    expect(JSON.stringify(result)).not.toContain('제외 대상 데이터');
  });
});
