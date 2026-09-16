import type { Session } from './auth';
import { assetDetailTextFields, type AssetDetails } from '../shared/assets';
import { ApiError, requireValue } from './errors';
import { bumpAssets } from './mutations';
import { commit, combineGuards, entityById, existsGuard } from './storage';
import { tagIds, validateTags } from './tags';
import {
  checkVersion,
  bool,
  color,
  date,
  identity,
  money,
  signedMoney,
  text,
  version,
  type ObjectBody,
} from './validation';

export const assetDefinition = {
  table: 'assets',
  json: `json_object('id',t.id,'name',t.name,'kind',t.kind,'openingBalance',t.opening_balance,'balance',t.opening_balance+COALESCE((SELECT SUM(e.amount) FROM asset_effects e WHERE e.household_id=t.household_id AND e.asset_id=t.id),0),'color',t.color,'tagIds',json(t.tag_ids),'trackSavings',json(CASE t.track_savings WHEN 1 THEN 'true' ELSE 'false' END),'version',t.version,'openingDate',t.opening_date,'archived',json(CASE t.archived WHEN 1 THEN 'true' ELSE 'false' END),'details',json(t.metadata_json))`,
};

function details(value: unknown, kind: string, previous: AssetDetails = {}): AssetDetails {
  if (value === undefined) return previous;
  requireValue(
    value && typeof value === 'object' && !Array.isArray(value),
    '자산 상세 정보를 확인해 주세요.',
  );
  const input = value as ObjectBody;
  const result: AssetDetails = { ...previous };
  if (input.openingKind !== undefined) {
    requireValue(
      input.openingKind === 'initial' || input.openingKind === 'observation',
      '기준 잔액 종류를 확인해 주세요.',
    );
    result.openingKind = input.openingKind;
  }
  for (const field of assetDetailTextFields) {
    if (input[field] === undefined) continue;
    requireValue(
      typeof input[field] === 'string' && (input[field] as string).length <= 2000,
      '상세 정보는 2,000자 이내로 입력해 주세요.',
    );
    result[field] = (input[field] as string).trim().normalize('NFC');
  }
  if (input.ownerId !== undefined) {
    requireValue(['u1', 'u2', 'shared'].includes(String(input.ownerId)), '소유자를 확인해 주세요.');
    result.ownerId = input.ownerId as AssetDetails['ownerId'];
  }
  for (const field of ['principal', 'monthlyPayment'] as const) {
    if (input[field] !== undefined)
      result[field] = input[field] === null ? null : money(input[field], true);
  }
  if (input.rate !== undefined) {
    requireValue(
      input.rate === null ||
        (typeof input.rate === 'number' &&
          Number.isFinite(input.rate) &&
          input.rate >= 0 &&
          input.rate <= 100),
      '금리는 0~100% 범위로 입력해 주세요.',
    );
    result.rate = input.rate as number | null;
  }
  if (input.paymentDay !== undefined) {
    requireValue(
      input.paymentDay === null ||
        (Number.isInteger(input.paymentDay) &&
          Number(input.paymentDay) >= 1 &&
          Number(input.paymentDay) <= 31),
      '납입일은 1~31일로 입력해 주세요.',
    );
    result.paymentDay = input.paymentDay as number | null;
  }
  if (input.endDate !== undefined)
    result.endDate =
      input.endDate === null || input.endDate === '' ? null : date(input.endDate, '만기일');
  requireValue(
    kind === 'liability' ||
      ['principal', 'rate', 'paymentDay', 'monthlyPayment', 'endDate'].every(
        (field) => input[field] == null || input[field] === '',
      ),
    '대출 조건은 부채 항목에 기록해 주세요.',
  );
  return result;
}

export async function createAsset(db: D1Database, session: Session, body: ObjectBody) {
  const op = await identity(db, session, body, 'asset.create');
  if (op.previous) return op.previous;
  const h = session.householdId,
    id = crypto.randomUUID(),
    name = text(body.name, '자산 이름', 80),
    shade = color(body.color),
    opening = signedMoney(body.openingBalance),
    ids = tagIds(body.tagIds),
    track = bool(body.trackSavings),
    openingDate = date(body.openingDate, '최초 잔액 기준일');
  requireValue(body.kind === 'asset' || body.kind === 'liability', '자산 종류를 확인해 주세요.');
  requireValue(
    body.kind !== 'liability' || !track,
    '부채는 저축 집계 대상으로 설정할 수 없습니다.',
  );
  requireValue(body.kind !== 'liability' || opening >= 0, '부채 잔액은 0원 이상이어야 합니다.');
  const metadata = details(body.details, String(body.kind));
  const guards = await validateTags(db, h, ids, 'asset', null);
  return commit(db, session, {
    ...op,
    entityId: id,
    entityType: 'asset',
    ledgerId: null,
    ...combineGuards(guards),
    statements: [
      db
        .prepare(
          'INSERT INTO assets(id,household_id,name,kind,opening_balance,color,tag_ids,track_savings,opening_date,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          id,
          h,
          name,
          body.kind,
          opening,
          shade,
          JSON.stringify(ids),
          Number(track),
          openingDate,
          JSON.stringify(metadata),
        ),
    ],
  });
}
export async function patchAsset(db: D1Database, session: Session, id: string, body: ObjectBody) {
  const op = await identity(db, session, body, `asset.patch:${id}`);
  if (op.previous) return op.previous;
  const h = session.householdId,
    current = await entityById(db, h, 'asset', id);
  if (!current) throw new ApiError(404, 'NOT_FOUND', '자산을 찾을 수 없습니다.');
  const name = body.name === undefined ? current.name : text(body.name, '자산 이름', 80),
    shade = body.color === undefined ? current.color : color(body.color),
    ids = body.tagIds === undefined ? current.tagIds : tagIds(body.tagIds),
    track = body.trackSavings === undefined ? current.trackSavings : bool(body.trackSavings),
    archived = body.archived === undefined ? Boolean(current.archived) : bool(body.archived),
    openingDate =
      body.openingDate === undefined
        ? (current.openingDate ?? null)
        : date(body.openingDate, '최초 잔액 기준일'),
    metadata = details(body.details, current.kind, current.details);
  requireValue(
    current.kind !== 'liability' || !track,
    '부채는 저축 집계 대상으로 설정할 수 없습니다.',
  );
  requireValue(
    !Object.hasOwn(body, 'openingBalance') && !Object.hasOwn(body, 'balance'),
    '잔액은 별도 잔액 조정으로 변경해 주세요.',
  );
  const guards = await validateTags(db, h, ids, 'asset', null, current.tagIds);
  if (openingDate && openingDate !== current.openingDate) {
    const earliest = await db
      .prepare('SELECT MIN(date) AS date FROM asset_effects WHERE household_id=? AND asset_id=?')
      .bind(h, id)
      .first<string>('date');
    requireValue(
      !earliest || openingDate <= earliest,
      '최초 잔액 기준일은 이미 기록한 자산 변동일보다 늦을 수 없습니다.',
    );
  }
  guards.push(existsGuard('assets', h, id, checkVersion(current, body.expectedVersion)));
  return commit(db, session, {
    ...op,
    entityId: id,
    entityType: 'asset',
    ledgerId: null,
    ...combineGuards(guards),
    statements: [
      db
        .prepare(
          'UPDATE assets SET name=?,color=?,tag_ids=?,track_savings=?,opening_date=?,archived=?,metadata_json=?,version=version+1 WHERE household_id=? AND id=?',
        )
        .bind(
          name,
          shade,
          JSON.stringify(ids),
          Number(track),
          openingDate,
          Number(archived),
          JSON.stringify(metadata),
          h,
          id,
        ),
    ],
  });
}
export async function createAssetOperation(db: D1Database, session: Session, body: ObjectBody) {
  const op = await identity(db, session, body, 'assetOperation.create');
  if (op.previous) return op.previous;
  const h = session.householdId,
    id = crypto.randomUUID(),
    when = date(body.date, '기록일'),
    description = text(body.description, '내용', 240),
    now = new Date().toISOString();
  requireValue(
    body.type === 'transfer' || body.type === 'adjustment',
    '자산 기록 종류를 확인해 주세요.',
  );
  requireValue(
    body.expectedAssetVersions &&
      typeof body.expectedAssetVersions === 'object' &&
      !Array.isArray(body.expectedAssetVersions),
    '자산의 최신 버전이 필요합니다.',
  );
  const expected = body.expectedAssetVersions as ObjectBody;
  const from = body.type === 'transfer' ? text(body.fromAssetId, '출금 자산') : null,
    to = body.type === 'transfer' ? text(body.toAssetId, '입금 자산') : null,
    assetId = body.type === 'adjustment' ? text(body.assetId, '조정 자산') : null;
  requireValue(
    body.type !== 'transfer' || from !== to,
    '서로 다른 출금 자산과 입금 자산을 선택해 주세요.',
  );
  const ids = body.type === 'transfer' ? [from!, to!] : [assetId!];
  const assets = await Promise.all(ids.map((a) => entityById(db, h, 'asset', a)));
  requireValue(
    assets.every((a) => a !== null),
    '같은 가구의 자산을 선택해 주세요.',
  );
  requireValue(
    assets.every((a) => !a!.archived),
    '보관한 자산을 먼저 복원해 주세요.',
  );
  requireValue(
    assets.every((a) => a!.openingDate),
    '자산 설정에서 최초 잔액 기준일을 먼저 확인해 주세요.',
  );
  requireValue(
    assets.every((a) => when >= a!.openingDate!),
    '최초 잔액 기준일 이전에는 자산 변동을 기록할 수 없습니다.',
  );
  requireValue(
    body.type !== 'transfer' || assets.every((a) => a!.kind === 'asset'),
    '부채는 자산 이체에 사용할 수 없습니다.',
  );
  for (const a of assets)
    if (version(expected[a!.id]) !== a!.version)
      throw new ApiError(
        409,
        'VERSION_CONFLICT',
        '다른 곳에서 수정된 자산입니다. 최신 잔액을 확인해 주세요.',
        { assets },
      );
  const target = body.type === 'adjustment' ? signedMoney(body.targetBalance) : null;
  requireValue(
    body.type !== 'adjustment' || assets[0]!.kind !== 'liability' || target! >= 0,
    '부채 잔액은 0원 이상이어야 합니다.',
  );
  // A backdated valuation targets that day's closing balance, not today's balance.
  // The asset version guard below prevents a concurrent effect from making this delta stale.
  const historicalEffects =
    body.type === 'adjustment'
      ? await db
          .prepare(
            'SELECT COALESCE(SUM(amount),0) AS amount FROM asset_effects WHERE household_id=? AND asset_id=? AND date<=?',
          )
          .bind(h, assetId, when)
          .first<number>('amount')
      : 0;
  const balanceAtDate = assets[0]!.openingBalance + Number(historicalEffects ?? 0);
  const amount = body.type === 'transfer' ? money(body.amount) : target! - balanceAtDate;
  requireValue(
    Number.isSafeInteger(amount) && Math.abs(amount) <= 2_000_000_000_000,
    '조정 금액이 허용 범위를 벗어났습니다.',
  );
  const guards = ids.map((a) => existsGuard('assets', h, a, version(expected[a])));
  const bothTracked = body.type === 'transfer' && assets.every((a) => a!.trackSavings);
  const statements = [
    db
      .prepare(
        'INSERT INTO asset_operations(id,household_id,type,date,description,from_asset_id,to_asset_id,asset_id,amount,target_balance,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        id,
        h,
        body.type,
        when,
        description,
        from,
        to,
        assetId,
        amount,
        target,
        session.user.id,
        now,
      ),
  ];
  for (const [i, a] of assets.entries()) {
    const delta = body.type === 'transfer' ? (i === 0 ? -amount : amount) : amount;
    const tracking = body.type === 'transfer' && a!.trackSavings ? 1 : 0;
    statements.push(
      db
        .prepare(
          'INSERT INTO asset_effects(id,household_id,operation_id,asset_id,amount,savings_amount,savings_tracking,date,description,actor_id) VALUES(?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          `${id}:${i}`,
          h,
          id,
          a!.id,
          delta,
          tracking && !bothTracked ? delta : 0,
          tracking,
          when,
          description,
          session.user.id,
        ),
    );
  }
  statements.push(...bumpAssets(db, h, ids));
  return commit(db, session, {
    ...op,
    entityId: id,
    entityType: 'assetOperation',
    ledgerId: null,
    ...combineGuards(guards),
    statements,
    conflictAssets: ids,
  });
}
export async function deleteAssetOperation(
  db: D1Database,
  session: Session,
  id: string,
  body: ObjectBody,
) {
  const op = await identity(db, session, body, `assetOperation.delete:${id}`);
  if (op.previous) return op.previous;
  const h = session.householdId,
    current = await entityById(db, h, 'assetOperation', id);
  if (!current || current.deletedAt)
    throw new ApiError(404, 'NOT_FOUND', '되돌릴 자산 기록을 찾을 수 없습니다.');
  return commit(db, session, {
    ...op,
    entityId: id,
    entityType: 'assetOperation',
    ledgerId: null,
    ...combineGuards([
      existsGuard(
        'asset_operations',
        h,
        id,
        checkVersion(current, body.expectedVersion),
        ' AND deleted_at IS NULL',
      ),
    ]),
    statements: [
      db
        .prepare(
          'UPDATE asset_operations SET deleted_at=?,version=version+1 WHERE household_id=? AND id=?',
        )
        .bind(new Date().toISOString(), h, id),
      db
        .prepare(
          'UPDATE assets SET version=version+1 WHERE household_id=? AND id IN (SELECT asset_id FROM asset_effects WHERE household_id=? AND operation_id=?)',
        )
        .bind(h, h, id),
      db.prepare('DELETE FROM asset_effects WHERE household_id=? AND operation_id=?').bind(h, id),
    ],
  });
}
