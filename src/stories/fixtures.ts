import type { Bootstrap, Ledger, Tag, TagGroup, Transaction, User } from '../shared/types';

/** Handwritten synthetic data only. Never derive Storybook fixtures from D1, Excel or sessions. */
export const STORY_MONTH = '2026-06';

export const storyUsers: User[] = [
  { id: 'u1', name: '구성원 A', color: '#64866f', role: 'admin' },
  { id: 'u2', name: '구성원 B', color: '#9b78a8', role: 'user' },
];

function ledger(overrides: Partial<Ledger> & Pick<Ledger, 'id' | 'name'>): Ledger {
  return {
    icon: '📒',
    kind: 'purpose',
    parentId: null,
    budget: 300000,
    startDate: null,
    endDate: null,
    archived: false,
    version: 1,
    sortOrder: 0,
    periodStartDay: 1,
    ...overrides,
  };
}

export const storyLedgers: Ledger[] = [
  ledger({ id: 'sb-home', name: '우리의 일상', kind: 'main', icon: '🏠', budget: 1000000 }),
  ledger({ id: 'sb-year', name: '2026 기록', parentId: 'sb-home' }),
  ledger({
    id: 'sb-june',
    name: '6월 생활비',
    parentId: 'sb-year',
    startDate: '2026-06-01',
    endDate: '2026-06-30',
  }),
  ledger({
    id: 'sb-july',
    name: '7월 생활비',
    parentId: 'sb-year',
    sortOrder: 1,
    startDate: '2026-07-01',
    endDate: '2026-07-31',
  }),
  ledger({ id: 'sb-trip', name: '여름 바다 여행', icon: '✈️', sortOrder: 1 }),
  ledger({
    id: 'sb-archived',
    name: '지난 봄 소풍',
    icon: '🍊',
    archived: true,
    sortOrder: 2,
  }),
];

export const storyTagGroups: TagGroup[] = [
  {
    id: 'sb-category',
    name: '분류',
    selectionMode: 'single',
    appliesTo: 'transaction',
    role: 'category',
    ledgerIds: null,
    sortOrder: 0,
    archived: false,
    version: 1,
  },
  {
    id: 'sb-context',
    name: '내역',
    selectionMode: 'multiple',
    appliesTo: 'transaction',
    role: 'regular',
    ledgerIds: null,
    sortOrder: 1,
    archived: false,
    version: 1,
  },
  {
    id: 'sb-trip-category',
    name: '여행 구분',
    selectionMode: 'single',
    appliesTo: 'transaction',
    role: 'regular',
    ledgerIds: ['sb-trip'],
    sortOrder: 2,
    archived: false,
    version: 1,
  },
  {
    id: 'sb-old-category',
    name: '이전 분류',
    selectionMode: 'single',
    appliesTo: 'transaction',
    role: 'regular',
    ledgerIds: null,
    sortOrder: 3,
    archived: true,
    version: 1,
  },
  {
    id: 'sb-asset-purpose',
    name: '자산 목적',
    selectionMode: 'multiple',
    appliesTo: 'asset',
    role: 'regular',
    ledgerIds: null,
    sortOrder: 4,
    archived: false,
    version: 1,
  },
];

function tag(overrides: Partial<Tag> & Pick<Tag, 'id' | 'groupId' | 'name'>): Tag {
  return {
    color: '#64866f',
    sortOrder: 0,
    archived: false,
    version: 1,
    parentId: null,
    ...overrides,
  };
}

export const storyTags: Tag[] = [
  tag({ id: 'sb-food', groupId: 'sb-category', name: '식비' }),
  tag({ id: 'sb-transport', groupId: 'sb-category', name: '교통', color: '#7b91b0', sortOrder: 1 }),
  tag({ id: 'sb-salary', groupId: 'sb-category', name: '급여', color: '#9b78a8', sortOrder: 2 }),
  tag({ id: 'sb-family', groupId: 'sb-context', name: '가족' }),
  tag({ id: 'sb-weekend', groupId: 'sb-context', name: '주말', color: '#c1956e', sortOrder: 1 }),
  tag({
    id: 'sb-family-meal',
    groupId: 'sb-context',
    name: '가족 식사',
    parentId: 'sb-family',
    sortOrder: 2,
  }),
  tag({
    id: 'sb-retired-option',
    groupId: 'sb-context',
    name: '지난 행사',
    archived: true,
    sortOrder: 3,
  }),
  tag({ id: 'sb-lodging', groupId: 'sb-trip-category', name: '숙박', color: '#9b78a8' }),
  tag({ id: 'sb-legacy', groupId: 'sb-old-category', name: '기존 기록', color: '#8d8d8d' }),
  tag({ id: 'sb-reserve', groupId: 'sb-asset-purpose', name: '예비금' }),
  tag({ id: 'sb-investment', groupId: 'sb-asset-purpose', name: '투자금', color: '#7b91b0' }),
];

function transaction(
  overrides: Partial<Transaction> & Pick<Transaction, 'id' | 'description'>,
): Transaction {
  return {
    ledgerId: 'sb-june',
    date: '2026-06-12',
    amount: 12000,
    type: 'expense',
    ownerId: 'shared',
    paymentMethodId: null,
    tagIds: [],
    allocations: [],
    version: 1,
    updatedAt: '2026-06-12T12:00:00.000Z',
    updatedBy: 'u1',
    ...overrides,
  };
}

export const storyTransactions: Transaction[] = [
  transaction({ id: 'sb-lunch', description: '함께 먹은 점심', tagIds: ['sb-food', 'sb-family'] }),
  transaction({
    id: 'sb-bus',
    description: '버스 이용',
    amount: 3000,
    ownerId: 'u2',
    tagIds: ['sb-transport'],
  }),
  transaction({
    id: 'sb-grocery',
    description: '주말 장보기',
    amount: 45000,
    paymentMethodId: 'sb-card',
    tagIds: ['sb-food', 'sb-weekend'],
    updatedAt: '2026-06-13T12:00:00.000Z',
  }),
  transaction({
    id: 'sb-income',
    description: '예시 급여',
    date: '2026-06-25',
    amount: 2000000,
    type: 'income',
    ownerId: 'u1',
    tagIds: ['sb-salary'],
    updatedAt: '2026-06-25T12:00:00.000Z',
  }),
  transaction({
    id: 'sb-hotel',
    ledgerId: 'sb-trip',
    description: '바다 여행 숙소 예약',
    date: '2026-06-20',
    amount: 100000,
    tagIds: ['sb-lodging'],
    updatedAt: '2026-06-20T12:00:00.000Z',
  }),
];

/** Returns independent objects so play interactions cannot mutate another story's state. */
export function makeStoryBootstrap(overrides: Partial<Bootstrap> = {}): Bootstrap {
  return structuredClone({
    householdId: 'storybook-synthetic-household',
    user: storyUsers[0],
    users: storyUsers,
    ledgers: storyLedgers,
    transactions: storyTransactions,
    assets: [],
    paymentMethods: [
      {
        id: 'sb-card',
        name: '예시 가족 카드',
        type: 'card',
        ownerId: 'shared',
        closingDay: 20,
        paymentDay: 10,
      },
    ],
    tagGroups: storyTagGroups,
    tags: storyTags,
    assetOperations: [],
    assetMovements: [],
    plans: [],
    revision: 1,
    hierarchyVersion: 1,
    mode: 'demo',
    ...overrides,
  } satisfies Bootstrap);
}
