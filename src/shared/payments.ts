import type { PaymentMethod, Transaction } from './types';

/** Optional fields keep existing payment methods and historical imports readable. */
export interface PaymentDetails {
  institution?: string;
  cardKind?: 'credit' | 'debit';
  accountKind?: string;
  purpose?: string;
  monthlyBudget?: number;
  expiry?: string;
  annualFee?: number;
  accountNumber?: string;
  linkedAccountId?: string | null;
  assetId?: string | null;
  creditLimit?: number;
  performanceTarget?: number;
  benefits?: string;
  usagePeriodNote?: string;
  notes?: string;
  archived?: boolean;
  version?: number;
}
export type ManagedPayment = PaymentMethod & PaymentDetails;
export const paymentTextFields = [
  'institution',
  'accountKind',
  'purpose',
  'expiry',
  'accountNumber',
  'benefits',
  'usagePeriodNote',
  'notes',
] as const;
export const paymentMoneyFields = [
  'monthlyBudget',
  'annualFee',
  'creditLimit',
  'performanceTarget',
] as const;

/** This is recorded usage, not the card issuer's eligibility/benefit calculation. */
export function paymentUsage(transactions: Transaction[], id: string, month: string) {
  const seen = new Set<string>();
  const entries = transactions
    .filter((tx) => {
      if (tx.paymentMethodId !== id || !tx.date.startsWith(`${month}-`) || seen.has(tx.id))
        return false;
      seen.add(tx.id);
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  return {
    transactions: entries,
    income: entries.reduce((total, tx) => total + (tx.type === 'income' ? tx.amount : 0), 0),
    expense: entries.reduce((total, tx) => total + (tx.type === 'expense' ? tx.amount : 0), 0),
  };
}

export function maskedAccountNumber(value: string | undefined): string {
  if (!value) return '미등록';
  const compact = value.replace(/[\s-]/g, '');
  return compact.length > 4
    ? `${'•'.repeat(Math.min(compact.length - 4, 8))} ${compact.slice(-4)}`
    : '••••';
}

export function paymentSettingIssue(payment: ManagedPayment): string | null {
  if (payment.type !== 'card' || payment.cardKind === 'debit') return null;
  const valid = (day: number | null) => Number.isInteger(day) && day! >= 1 && day! <= 31;
  return valid(payment.closingDay) && valid(payment.paymentDay)
    ? null
    : '마감일과 납부일을 설정하면 예상 대금이 보여요.';
}
