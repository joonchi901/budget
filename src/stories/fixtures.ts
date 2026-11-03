/**
 * Synthetic household for stories. Structure and amounts follow the Notion "2026 가계부" sample
 * (pay-period month, 수입·고정지출·지출, 결제방식·카테고리·누가·비고); names are generic.
 */
import {
  recordProblems,
  type FieldValue,
  type Ledger,
  type LedgerRecord,
  type Member,
  type TagOption,
} from '../shared/ledger';
import type { Friend, LedgerMember, Profile, RoomInvite, SignupLink } from '../shared/people';

export const FIXTURE_TODAY = '2026-11-02';

export const members: Member[] = [
  { id: 'u1', name: '준상' },
  { id: 'u2', name: '예디' },
];

const option = (id: string, name: string, color: string): TagOption => ({ id, name, color });
const people = (prefix: string) => [
  option(`${prefix}-who-p1`, '준상', '#7CC7F2'),
  option(`${prefix}-who-p2`, '예디', '#F08A5D'),
  option(`${prefix}-who-p3`, '예미', '#A7D7C5'),
];
// Copying a ledger gives new ids but keeps names, so parent stats can merge options by name.
const monthLedger = (id: string, name: string, start: string, end: string): Ledger => ({
  id,
  name,
  icon: 'ledger',
  period: { start, end },
  kinds: [
    { id: `${id}-k-in`, name: '수입', color: '#38735B', nature: 'income' },
    { id: `${id}-k-fixed`, name: '고정지출', color: '#9176A6', nature: 'expense' },
    { id: `${id}-k-out`, name: '지출', color: '#AE393B', nature: 'expense' },
  ],
  fields: [
    {
      id: `${id}-f-pay`,
      name: '결제방식',
      type: 'select',
      options: [
        option(`${id}-pay-kb`, '국민카드', '#B9A27A'),
        option(`${id}-pay-kt`, 'KT카드', '#E8AD3F'),
        option(`${id}-pay-hd`, '현대카드', '#4B4B4B'),
        option(`${id}-pay-ss`, '삼성카드', '#286588'),
        option(`${id}-pay-auto`, '자동이체', '#64866F'),
      ],
    },
    {
      id: `${id}-f-cat`,
      name: '카테고리',
      type: 'select',
      options: [
        option(`${id}-cat-salary`, '월급', '#38735B'),
        option(`${id}-cat-food`, '외식/배달/간식', '#D28C70'),
        option(`${id}-cat-grocery`, '장보기', '#64866F'),
        option(`${id}-cat-health`, '병원/약국', '#6C89A4'),
        option(`${id}-cat-insurance`, '보험', '#9176A6'),
        option(`${id}-cat-phone`, '통신비', '#7CC7F2'),
        option(`${id}-cat-house`, '관리비', '#B9A27A'),
        option(`${id}-cat-car`, '자동차', '#4B4B4B'),
        option(`${id}-cat-allowance`, '용돈', '#F08A5D'),
        option(`${id}-cat-meetup`, '모임비', '#E8AD3F'),
        option(`${id}-cat-saving`, '주택청약', '#286588'),
      ],
    },
    {
      id: `${id}-f-who`,
      name: '누가',
      type: 'multiSelect',
      options: people(id),
      emptyLabel: '공동',
    },
    { id: `${id}-f-note`, name: '비고', type: 'text' },
  ],
  childIds: [],
});

export const november = monthLedger('nov', '11월', '2026-10-23', '2026-11-22');
export const december = monthLedger('dec', '12월', '2026-11-23', '2026-12-22');
export const japanTrip: Ledger = {
  id: 'trip',
  name: '일본여행',
  icon: 'sprout',
  period: { start: '2026-10-09', end: '2026-10-12' },
  kinds: [{ id: 'trip-k-out', name: '지출', color: '#AE393B', nature: 'expense' }],
  fields: [
    {
      id: 'trip-f-cat',
      name: '카테고리',
      type: 'select',
      options: [
        option('trip-cat-move', '교통', '#6C89A4'),
        option('trip-cat-stay', '숙소', '#9176A6'),
        option('trip-cat-food', '식비', '#D28C70'),
        option('trip-cat-shop', '쇼핑', '#E8AD3F'),
      ],
    },
    {
      id: 'trip-f-pay',
      name: '결제방식',
      type: 'select',
      options: [
        option('trip-pay-kb', '국민카드', '#B9A27A'),
        option('trip-pay-hd', '현대카드', '#4B4B4B'),
        option('trip-pay-cash', '현금', '#64866F'),
      ],
    },
    {
      id: 'trip-f-who',
      name: '누가',
      type: 'multiSelect',
      options: people('trip'),
      emptyLabel: '공동',
    },
  ],
  childIds: [],
};

// Parents gather records only through their children; nothing is recorded on them directly.
const parent = (
  id: string,
  name: string,
  icon: string,
  start: string,
  end: string,
  childIds: string[],
): Ledger => ({
  id,
  name,
  icon,
  period: { start, end },
  kinds: [],
  fields: [],
  childIds,
});
/** 2026 › 하반기 › 11월·12월 and 2026 › 일본여행, while 일본여행 also sits under 여행. */
export const secondHalf = parent('h2', '하반기', 'planning', '2026-07-01', '2026-12-31', [
  'nov',
  'dec',
]);
export const year2026 = parent('y2026', '2026', 'planning', '2026-01-01', '2026-12-31', [
  'h2',
  'trip',
]);
export const travel = parent('travel', '여행', 'sprout', '2026-10-09', '2026-10-12', ['trip']);
export const ledgers = [november, december, japanTrip, secondHalf, year2026, travel];

let sequence = 0;
function record(
  ledger: Ledger,
  date: string,
  kind: 'in' | 'fixed' | 'out',
  title: string,
  amount: number,
  values: Record<string, string> = {},
  createdBy = 'u1',
): LedgerRecord {
  sequence += 1;
  // values: field suffix → option suffix(es), comma separated; 'note' is free text.
  const mapped: { [fieldId: string]: FieldValue } = {};
  for (const [field, value] of Object.entries(values))
    mapped[`${ledger.id}-f-${field}`] =
      field === 'note' ? value : value.split(',').map((item) => `${ledger.id}-${field}-${item}`);
  return {
    id: `r${sequence}`,
    ledgerId: ledger.id,
    date,
    kindId: `${ledger.id}-k-${kind}`,
    title,
    amount,
    values: mapped,
    createdBy,
    createdAt: `${date}T${String(8 + (sequence % 14)).padStart(2, '0')}:${String((sequence * 7) % 60).padStart(2, '0')}:00+09:00`,
  };
}

const n = november;
const t = japanTrip;
export const records: LedgerRecord[] = [
  record(t, '2026-10-09', 'out', '항공권', 412000, { cat: 'move', pay: 'kb', who: 'p1,p2' }),
  record(t, '2026-10-09', 'out', '숙소_교토', 280000, { cat: 'stay', pay: 'hd' }),
  record(t, '2026-10-10', 'out', '라멘', 23400, { cat: 'food', pay: 'kb' }, 'u2'),
  record(t, '2026-10-10', 'out', '지하철 패스', 18000, { cat: 'move', pay: 'cash' }),
  record(t, '2026-10-11', 'out', '기념품', 46500, { cat: 'shop', pay: 'hd', who: 'p2' }, 'u2'),
  record(t, '2026-10-12', 'out', '공항 리무진', 32000, { cat: 'move', pay: 'kb' }),

  record(n, '2026-10-23', 'in', '정기급여', 2736060, { cat: 'salary', who: 'p1' }),
  record(n, '2026-10-23', 'in', '일시/소급금', 3999830, { cat: 'salary', who: 'p1' }),
  record(n, '2026-10-23', 'in', '복지 지원금', 1596280, { cat: 'salary', who: 'p1' }),
  record(n, '2026-10-24', 'out', '고기집_시험 응원 파티', 115000, {
    pay: 'kb',
    cat: 'food',
    who: 'p1,p2,p3',
  }),
  record(
    n,
    '2026-10-24',
    'out',
    '장보기_쿠팡',
    9550,
    {
      pay: 'kt',
      cat: 'grocery',
      note: '닭다리살, 감자, 당근',
    },
    'u2',
  ),
  record(n, '2026-10-25', 'out', '식빵_핀토', 14300, { pay: 'kb', cat: 'food' }),
  record(n, '2026-10-25', 'out', '보리차_도서관', 2000, { pay: 'kb', cat: 'food' }),
  record(n, '2026-10-25', 'out', '우리마트', 4700, { pay: 'kb', cat: 'grocery' }, 'u2'),
  record(n, '2026-10-26', 'fixed', '보험_현대해상', 68990, {
    pay: 'auto',
    cat: 'insurance',
    note: '기존 거, 해지예정',
  }),
  record(n, '2026-10-26', 'fixed', '폰', 40000, { pay: 'auto', cat: 'phone', who: 'p2' }),
  record(n, '2026-10-27', 'fixed', '아파트 관리비', 263820, { pay: 'kb', cat: 'house' }),
  record(n, '2026-10-27', 'out', '요아정_쿠팡이츠', 21010, { pay: 'kt', cat: 'food' }, 'u2'),
  record(n, '2026-10-29', 'out', '우리마트', 13460, {
    pay: 'kb',
    cat: 'grocery',
    note: '우유, 브로콜리',
  }),
  record(n, '2026-10-29', 'out', '코모레커피_집앞카페', 10600, { pay: 'kb', cat: 'food' }),
  record(n, '2026-10-29', 'out', '코노미스시_평촌롯백', 63700, { pay: 'kb', cat: 'food' }),
  record(n, '2026-10-29', 'fixed', '주유', 76292, { pay: 'kb', cat: 'car' }),
  record(n, '2026-10-29', 'out', '편의점', 6000, { pay: 'kb', cat: 'food' }),
  record(n, '2026-10-29', 'out', '생일케이크_쿠팡이츠', 20600, { pay: 'kt', cat: 'food' }, 'u2'),
  record(
    n,
    '2026-10-29',
    'out',
    '영양제_쿠팡',
    49900,
    { pay: 'kt', cat: 'health', who: 'p2' },
    'u2',
  ),
  record(n, '2026-10-29', 'out', '정기 검진_동네병원', 22900, { pay: 'ss', cat: 'health' }, 'u2'),
  record(
    n,
    '2026-10-30',
    'out',
    '장보기_쿠팡',
    37350,
    {
      pay: 'kt',
      cat: 'grocery',
      note: '샤브샤브 야채, 식빵 등등',
    },
    'u2',
  ),
  record(n, '2026-10-30', 'out', '우렁쌈밥_쿠팡이츠', 17000, { pay: 'kt', cat: 'food' }),
  record(n, '2026-10-30', 'out', '코스트코', 135320, { pay: 'hd', cat: 'grocery' }),
  record(n, '2026-10-31', 'fixed', '보험_현대해상', 109460, {
    pay: 'auto',
    cat: 'insurance',
    note: '신규',
  }),
  record(n, '2026-10-31', 'out', '젤라또_잠실', 10800, { pay: 'kb', cat: 'food' }),
  record(n, '2026-10-31', 'out', '햄버거_코엑스', 33000, { pay: 'kb', cat: 'food' }),
  record(n, '2026-10-31', 'out', '블랙보리', 2500, { pay: 'kb', cat: 'food' }),
  record(
    n,
    '2026-10-31',
    'out',
    '쫄면,만두,김밥_쿠팡이츠',
    14000,
    { pay: 'kt', cat: 'food' },
    'u2',
  ),
  record(n, '2026-11-01', 'out', '스타벅스_쿠팡이츠', 13500, { pay: 'kt', cat: 'food' }, 'u2'),
  record(n, '2026-11-01', 'fixed', '용돈', 250000, { pay: 'auto', cat: 'allowance', who: 'p1' }),
  record(n, '2026-11-01', 'fixed', '용돈', 250000, { pay: 'auto', cat: 'allowance', who: 'p2' }),
  record(n, '2026-11-01', 'fixed', '친구 모임', 100000, {
    pay: 'auto',
    cat: 'meetup',
    who: 'p1,p2',
  }),
  record(n, '2026-11-01', 'fixed', '친구계', 30000, { pay: 'auto', cat: 'meetup', who: 'p2' }),
  record(n, '2026-11-01', 'fixed', '청약저축', 20000, { pay: 'auto', cat: 'saving', who: 'p1' }),
  record(n, '2026-11-01', 'fixed', '청약저축', 20000, { pay: 'auto', cat: 'saving', who: 'p2' }),
  record(n, '2026-11-01', 'out', '프레드피자_쿠팡이츠', 29300, { pay: 'kt', cat: 'food' }, 'u2'),
];

// Self-check: a broken fixture fails loudly in every story instead of rendering wrong numbers.
for (const item of records) {
  const ledger = ledgers.find((candidate) => candidate.id === item.ledgerId);
  const problems = ledger ? recordProblems(ledger, item) : ['없는 가계부'];
  if (problems.length) throw new Error(`fixture ${item.id} ${item.title}: ${problems.join(', ')}`);
}

// People. `me` is 준상; 일본여행 is shared with 예디, and 예미 has invited me to her ledger.
export const me: Profile = { id: 'u1', handle: 'junsang', name: '준상', avatar: 'happy' };
export const yedi: Profile = { id: 'u2', handle: 'yedi_kim', name: '예디', avatar: 'calm' };
export const yemi: Profile = { id: 'u3', handle: 'yemi22', name: '예미', avatar: 'surprise' };
export const minho: Profile = { id: 'u4', handle: 'minho_park', name: '민호', avatar: 'sleep' };
export const seoyeon: Profile = { id: 'u5', handle: 'seoyeon', name: '서연', avatar: 'happy' };

export const friends: Friend[] = [
  { profile: yedi, status: 'friend' },
  { profile: minho, status: 'friend' },
  { profile: yemi, status: 'incoming' },
  { profile: seoyeon, status: 'outgoing' },
];

export const tripMembers: LedgerMember[] = [
  { profile: me, role: 'owner' },
  { profile: yedi, role: 'editor' },
  { profile: minho, role: 'viewer', invited: true },
];

export const invites: RoomInvite[] = [
  {
    id: 'invite-jeju',
    ledger: {
      id: 'jeju',
      name: '제주 여행',
      icon: 'sprout',
      period: { start: '2026-12-20', end: '2026-12-23' },
    },
    from: yemi,
    role: 'editor',
    sentAt: '2026-11-02T09:10:00+09:00',
  },
];

export const signupLink: SignupLink = {
  url: 'https://uga.example/j/K7xQ2mP9vR4tW8yZ',
  expiresAt: '2026-12-02',
  joined: 1,
  limit: 20,
};
