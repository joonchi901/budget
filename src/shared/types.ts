export type TransactionType = 'expense' | 'income' | 'saving' | 'transfer';
export type OwnerId = 'u1' | 'u2' | 'shared';
export type RuleType = 'asset-expense' | 'asset-income' | 'saving' | 'transfer';

export interface User {
  id: 'u1' | 'u2';
  name: string;
  color: string;
}
export interface Ledger {
  id: string;
  name: string;
  icon: string;
  kind: 'main' | 'purpose';
  parentId: string | null;
  budget: number;
  startDate: string | null;
  endDate: string | null;
  archived: boolean;
  version: number;
}
export interface Transaction {
  id: string;
  ledgerId: string;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  category: string;
  ownerId: OwnerId;
  paymentMethodId: string;
  tagIds: string[];
  assetId: string | null;
  toAssetId: string | null;
  version: number;
  updatedAt: string;
  updatedBy: string;
}
export interface Asset {
  id: string;
  name: string;
  kind: 'asset' | 'liability';
  openingBalance: number;
  balance: number;
  color: string;
}
export interface PaymentMethod {
  id: string;
  name: string;
  type: 'card' | 'account' | 'cash';
  ownerId: OwnerId;
  closingDay: number | null;
  paymentDay: number | null;
}
export interface Tag {
  id: string;
  name: string;
  color: string;
}
export interface Rule {
  id: string;
  tagId: string;
  name: string;
  type: RuleType;
}
export interface Bootstrap {
  user: User;
  users: User[];
  ledgers: Ledger[];
  transactions: Transaction[];
  assets: Asset[];
  paymentMethods: PaymentMethod[];
  tags: Tag[];
  rules: Rule[];
  revision: number;
  mode: 'demo' | 'production';
}
export type TransactionInput = Omit<Transaction, 'version' | 'updatedAt' | 'updatedBy' | 'id'> & {
  id?: string;
};
export interface TransactionMutation {
  mutationId: string;
  expectedVersion?: number;
  transaction: TransactionInput;
}
export interface MutationResult {
  revision: number;
  transaction?: Transaction;
  ledger?: Ledger;
  replayed?: boolean;
}
export interface Presence {
  userId: string;
  name: string;
  color: string;
  ledgerId: string;
  transactionId: string | null;
  field: string | null;
}
export type RealtimeMessage =
  | { type: 'revision'; revision: number }
  | { type: 'presence'; peers: Presence[] }
  | { type: 'error'; message: string };
