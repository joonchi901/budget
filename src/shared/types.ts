import type { PaymentDetails } from './payments';
import type { Plan } from './planning';
import type { AssetDetails } from './assets';
export type TransactionType = 'expense' | 'income';
export type OwnerId = 'u1' | 'u2' | 'shared';
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
  periodStartDay?: number;
  fixedExpenseTagIds?: string[];
  tagMappings?: Record<string, string>;
}
export interface Allocation {
  assetId: string;
  amount: number;
}
export interface Transaction {
  id: string;
  ledgerId: string;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  ownerId: OwnerId;
  paymentMethodId: string;
  tagIds: string[];
  allocations: Allocation[];
  version: number;
  updatedAt: string;
  updatedBy: string;
  createdBy?: string | null;
  createdAt?: string | null;
}
export interface TagGroup {
  id: string;
  name: string;
  selectionMode: 'single' | 'multiple';
  appliesTo: 'transaction' | 'asset';
  role: 'category' | 'regular';
  ledgerIds: string[] | null;
  sortOrder: number;
  archived: boolean;
  version: number;
}
export interface Tag {
  id: string;
  groupId: string;
  name: string;
  color: string;
  sortOrder: number;
  archived: boolean;
  version: number;
  parentId?: string | null;
}
export interface Asset {
  id: string;
  name: string;
  kind: 'asset' | 'liability';
  openingBalance: number;
  balance: number;
  color: string;
  tagIds: string[];
  trackSavings: boolean;
  version: number;
  openingDate?: string | null;
  archived?: boolean;
  details?: AssetDetails;
}
export interface AssetOperation {
  id: string;
  type: 'transfer' | 'adjustment';
  date: string;
  description: string;
  fromAssetId: string | null;
  toAssetId: string | null;
  assetId: string | null;
  amount: number;
  targetBalance: number | null;
  version: number;
  createdBy: string;
  createdAt: string;
  deletedAt: string | null;
}
export interface AssetMovement {
  id: string;
  assetId: string;
  transactionId: string | null;
  operationId: string | null;
  date: string;
  description: string;
  amount: number;
  savingsAmount: number;
  actorId: string;
}
export interface PaymentMethod extends PaymentDetails {
  id: string;
  name: string;
  type: 'card' | 'account' | 'cash';
  ownerId: OwnerId;
  closingDay: number | null;
  paymentDay: number | null;
}
export interface Bootstrap {
  householdId?: string;
  user: User;
  users: User[];
  ledgers: Ledger[];
  transactions: Transaction[];
  assets: Asset[];
  paymentMethods: PaymentMethod[];
  tagGroups: TagGroup[];
  tags: Tag[];
  assetOperations: AssetOperation[];
  assetMovements: AssetMovement[];
  revision: number;
  mode: 'demo' | 'production';
  plans?: Plan[];
}
export type TransactionInput = Omit<
  Transaction,
  'version' | 'updatedAt' | 'updatedBy' | 'createdBy' | 'createdAt' | 'id'
> & {
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
  asset?: Asset;
  tagGroup?: TagGroup;
  tag?: Tag;
  assetOperation?: AssetOperation;
  paymentMethod?: PaymentMethod;
  plan?: Plan;
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
