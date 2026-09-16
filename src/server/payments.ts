import type { PaymentDetails } from '../shared/payments';
import { paymentMoneyFields, paymentTextFields } from '../shared/payments';
import type { Session } from './auth';
import { ApiError, requireValue } from './errors';
import { combineGuards, commit, entityById, existsGuard, type Guard } from './storage';
import { bool, checkVersion, identity, money, text, type ObjectBody } from './validation';

export const paymentDefinition = {
  table: 'payment_methods',
  json: `json_set(t.details_json,'$.id',t.id,'$.name',t.name,'$.type',t.type,'$.ownerId',t.owner_id,'$.closingDay',t.closing_day,'$.paymentDay',t.payment_day,'$.archived',json(CASE t.archived WHEN 1 THEN 'true' ELSE 'false' END),'$.version',t.version)`,
};
const optionalText = (value: unknown, label: string, max: number): string => {
  if (value === null || value === '') return '';
  return text(value, label, max);
};
const day = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  requireValue(
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 31,
    '마감일과 납부일은 1~31 사이의 정수로 입력해 주세요.',
  );
  return value;
};

async function validated(
  db: D1Database,
  h: string,
  body: ObjectBody,
  current?: NonNullable<Awaited<ReturnType<typeof readPayment>>>,
) {
  const kind = body.type ?? current?.type;
  requireValue(
    kind === 'card' || kind === 'account' || kind === 'cash',
    '결제수단 종류를 확인해 주세요.',
  );
  requireValue(
    !current || kind === current.type,
    '결제수단 종류는 변경할 수 없습니다. 새 항목을 등록해 주세요.',
  );
  const owner = body.ownerId ?? current?.ownerId;
  requireValue(owner === 'shared' || owner === 'u1' || owner === 'u2', '명의를 확인해 주세요.');
  if (owner !== 'shared')
    requireValue(
      await db.prepare('SELECT id FROM users WHERE household_id=? AND id=?').bind(h, owner).first(),
      '같은 가구의 명의를 선택해 주세요.',
    );
  const details: PaymentDetails = {};
  for (const key of paymentTextFields) {
    const value = Object.hasOwn(body, key) ? body[key] : current?.[key];
    if (value !== undefined)
      details[key] = optionalText(
        value,
        '상세 정보',
        key === 'benefits' || key === 'notes' ? 3000 : 240,
      );
  }
  requireValue(
    !details.expiry || /^\d{4}-(0[1-9]|1[0-2])$/.test(details.expiry),
    '유효기간은 YYYY-MM 형식으로 입력해 주세요.',
  );
  requireValue(
    !details.accountNumber || /^[\d\s-]{1,64}$/.test(details.accountNumber),
    '계좌번호는 숫자, 공백, 하이픈으로 입력해 주세요.',
  );
  for (const key of paymentMoneyFields) {
    const value = Object.hasOwn(body, key) ? body[key] : current?.[key];
    if (value !== undefined && value !== null && value !== '') details[key] = money(value, true);
  }
  const cardKind = body.cardKind ?? current?.cardKind ?? 'credit';
  requireValue(cardKind === 'credit' || cardKind === 'debit', '카드 종류를 확인해 주세요.');
  if (kind === 'card') details.cardKind = cardKind;
  const guards: Guard[] = [];
  for (const key of ['linkedAccountId', 'assetId'] as const) {
    const raw = Object.hasOwn(body, key) ? body[key] : current?.[key];
    const id = raw === undefined || raw === null || raw === '' ? null : text(raw, '연결 항목', 100);
    details[key] = id;
    if (!id) continue;
    if (key === 'linkedAccountId') {
      requireValue(kind === 'card', '결제 통장은 카드에 연결해 주세요.');
      const account = await readPayment(db, h, id);
      requireValue(
        account?.type === 'account' && (!account.archived || current?.linkedAccountId === id),
        '같은 가구의 사용 중인 통장을 선택해 주세요.',
      );
      guards.push(existsGuard('payment_methods', h, id, account.version ?? 1));
    } else {
      requireValue(kind !== 'card', '자산은 통장이나 현금 항목에 연결해 주세요.');
      const asset = await entityById(db, h, 'asset', id);
      requireValue(asset?.kind === 'asset', '같은 가구의 자산을 선택해 주세요.');
      guards.push(existsGuard('assets', h, id, asset.version));
    }
  }
  const credit = kind === 'card' && cardKind === 'credit';
  return {
    name: body.name === undefined && current ? current.name : text(body.name, '결제수단 이름', 80),
    type: kind,
    ownerId: owner,
    closingDay: credit
      ? day(body.closingDay === undefined ? current?.closingDay : body.closingDay)
      : null,
    paymentDay: credit
      ? day(body.paymentDay === undefined ? current?.paymentDay : body.paymentDay)
      : null,
    archived: body.archived === undefined ? (current?.archived ?? false) : bool(body.archived),
    details,
    guards,
  };
}
const readPayment = (db: D1Database, h: string, id: string) =>
  entityById(db, h, 'paymentMethod', id);

export async function createPaymentMethod(db: D1Database, session: Session, body: ObjectBody) {
  const op = await identity(db, session, body, 'paymentMethod.create');
  if (op.previous) return op.previous;
  const item = await validated(db, session.householdId, body),
    id = crypto.randomUUID();
  return commit(db, session, {
    ...op,
    entityId: id,
    entityType: 'paymentMethod',
    ledgerId: null,
    ...combineGuards(item.guards),
    statements: [
      db
        .prepare(
          'INSERT INTO payment_methods(id,household_id,name,type,owner_id,closing_day,payment_day,details_json,archived) VALUES(?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          id,
          session.householdId,
          item.name,
          item.type,
          item.ownerId,
          item.closingDay,
          item.paymentDay,
          JSON.stringify(item.details),
          Number(item.archived),
        ),
    ],
  });
}

export async function patchPaymentMethod(
  db: D1Database,
  session: Session,
  id: string,
  body: ObjectBody,
) {
  const op = await identity(db, session, body, `paymentMethod.patch:${id}`);
  if (op.previous) return op.previous;
  const current = await readPayment(db, session.householdId, id);
  if (!current) throw new ApiError(404, 'NOT_FOUND', '결제수단을 찾을 수 없습니다.');
  const expected = checkVersion(
    { ...current, version: current.version ?? 1 },
    body.expectedVersion,
  );
  const item = await validated(db, session.householdId, body, current);
  item.guards.push(existsGuard('payment_methods', session.householdId, id, expected));
  return commit(db, session, {
    ...op,
    entityId: id,
    entityType: 'paymentMethod',
    ledgerId: null,
    ...combineGuards(item.guards),
    statements: [
      db
        .prepare(
          'UPDATE payment_methods SET name=?,owner_id=?,closing_day=?,payment_day=?,details_json=?,archived=?,version=version+1 WHERE household_id=? AND id=?',
        )
        .bind(
          item.name,
          item.ownerId,
          item.closingDay,
          item.paymentDay,
          JSON.stringify(item.details),
          Number(item.archived),
          session.householdId,
          id,
        ),
    ],
  });
}
