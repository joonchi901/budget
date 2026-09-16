import { describe, expect, it } from 'vitest';
import {
  maskedAccountNumber,
  paymentSettingIssue,
  paymentUsage,
  type ManagedPayment,
} from '../../src/shared/payments';
import type { Transaction } from '../../src/shared/types';
const tx = (
  id: string,
  amount: number,
  type: 'income' | 'expense' = 'expense',
  date = '2026-09-15',
): Transaction => ({
  id,
  amount,
  type,
  date,
  ledgerId: 'main',
  description: id,
  ownerId: 'shared',
  paymentMethodId: 'payment',
  tagIds: [],
  allocations: [],
  version: 1,
  updatedAt: '',
  updatedBy: 'u1',
});
const card: ManagedPayment = {
  id: 'payment',
  type: 'card',
  name: '카드',
  ownerId: 'u1',
  closingDay: 31,
  paymentDay: 15,
};
describe('payment management summaries', () => {
  it('counts household source transactions once across linked ledger views', () => {
    const expense = tx('a', 300),
      income = tx('b', 100, 'income');
    const summary = paymentUsage(
      [
        expense,
        expense,
        income,
        tx('outside', 900, 'expense', '2026-08-31'),
        { ...tx('other', 900), paymentMethodId: 'other' },
      ],
      'payment',
      '2026-09',
    );
    expect(summary.expense).toBe(300);
    expect(summary.income).toBe(100);
    expect(summary.transactions.map((t) => t.id)).toEqual(['a', 'b']);
  });
  it('requires billing settings only for credit cards', () => {
    expect(paymentSettingIssue(card)).toBeNull();
    expect(paymentSettingIssue({ ...card, paymentDay: null })).toContain('설정');
    expect(paymentSettingIssue({ ...card, closingDay: 32 })).toContain('설정');
    expect(
      paymentSettingIssue({ ...card, cardKind: 'debit', closingDay: null, paymentDay: null }),
    ).toBeNull();
    expect(paymentSettingIssue({ ...card, type: 'account' })).toBeNull();
  });
  it('masks account identifiers outside the explicit settings editor', () => {
    expect(maskedAccountNumber('123-456-789012')).toBe('•••••••• 9012');
    expect(maskedAccountNumber('1234')).toBe('••••');
    expect(maskedAccountNumber(undefined)).toBe('미등록');
  });
});
