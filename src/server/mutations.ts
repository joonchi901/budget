import type { MutationResult, TransactionInput, TransactionType } from '../shared/types';
import type { Session } from './auth';
import { hash } from './auth';
import { ApiError, requireValue } from './errors';
import { commit, ledgerById, replay, transactionById, type StoredRule } from './storage';

type ObjectBody = Record<string, unknown>;
type Binding = string | number | null;

export async function readBody(request: Request): Promise<ObjectBody> {
  const text = await request.text();
  if (text.length > 65536)
    throw new ApiError(
      413,
      'REQUEST_TOO_LARGE',
      '한 번에 전송할 수 있는 데이터 크기를 넘었습니다.',
    );
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'INVALID_JSON', '요청 형식을 확인해 주세요.');
  }
  requireValue(
    data && typeof data === 'object' && !Array.isArray(data),
    '요청 형식을 확인해 주세요.',
  );
  return data as ObjectBody;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const r = value as ObjectBody;
    return `{${Object.keys(r)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(r[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function text(value: unknown, name: string, max = 100): string {
  requireValue(
    typeof value === 'string' && value.trim().length > 0 && value.length <= max,
    `${name}을(를) 확인해 주세요.`,
  );
  return value.trim();
}

function date(value: unknown, name: string): string {
  const result = text(value, name, 10);
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(result), `${name} 형식은 YYYY-MM-DD입니다.`);
  const parsed = new Date(`${result}T00:00:00Z`);
  requireValue(
    Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === result,
    `${name}이(가) 올바르지 않습니다.`,
  );
  return result;
}

function money(value: unknown, allowZero = false): number {
  requireValue(
    typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= (allowZero ? 0 : 1) &&
      value <= 1_000_000_000_000,
    '금액은 허용 범위 안의 정수 원 단위로 입력해 주세요.',
  );
  return value;
}

function version(value: unknown): number {
  requireValue(
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0,
    '수정할 항목의 버전이 필요합니다.',
  );
  return value;
}

async function identity(db: D1Database, session: Session, body: ObjectBody, scope: string) {
  const mutationId = text(body.mutationId, '저장 요청 번호', 100);
  requireValue(/^[a-zA-Z0-9_-]+$/.test(mutationId), '저장 요청 번호가 올바르지 않습니다.');
  const requestHash = await hash(`${scope}:${stable(body)}`);
  return { mutationId, requestHash, previous: await replay(db, session, mutationId, requestHash) };
}

async function validateTransaction(
  db: D1Database,
  householdId: string,
  raw: unknown,
): Promise<{ transaction: TransactionInput; rule: StoredRule | null }> {
  requireValue(raw && typeof raw === 'object' && !Array.isArray(raw), '거래 내용을 확인해 주세요.');
  const r = raw as ObjectBody;
  const type = r.type as TransactionType;
  requireValue(
    ['expense', 'income', 'saving', 'transfer'].includes(type),
    '거래 종류를 선택해 주세요.',
  );
  requireValue(['u1', 'u2', 'shared'].includes(String(r.ownerId)), '지출 귀속을 선택해 주세요.');
  requireValue(
    Array.isArray(r.tagIds) &&
      r.tagIds.length <= 20 &&
      r.tagIds.every((id) => typeof id === 'string' && id.length <= 80),
    '태그 목록을 확인해 주세요.',
  );
  const tagIds = [...new Set(r.tagIds as string[])];
  const tx: TransactionInput = {
    ledgerId: text(r.ledgerId, '가계부'),
    date: date(r.date, '거래일'),
    description: text(r.description, '내용', 240),
    amount: money(r.amount),
    type,
    category: text(r.category, '분류', 80),
    ownerId: r.ownerId as TransactionInput['ownerId'],
    paymentMethodId: text(r.paymentMethodId, '결제수단'),
    tagIds,
    assetId: r.assetId == null || r.assetId === '' ? null : text(r.assetId, '출금 자산'),
    toAssetId: r.toAssetId == null || r.toAssetId === '' ? null : text(r.toAssetId, '입금 자산'),
  };
  if (r.id != null) tx.id = text(r.id, '거래 ID');
  const queries = [
    db
      .prepare('SELECT id FROM ledgers WHERE household_id = ? AND id = ?')
      .bind(householdId, tx.ledgerId),
    db
      .prepare('SELECT id FROM payment_methods WHERE household_id = ? AND id = ?')
      .bind(householdId, tx.paymentMethodId),
    db.prepare('SELECT id FROM tags WHERE household_id = ?').bind(householdId),
    db
      .prepare('SELECT id, tag_id AS tagId, name, type, version FROM rules WHERE household_id = ?')
      .bind(householdId),
    db.prepare("SELECT id FROM assets WHERE household_id = ? AND kind = 'asset'").bind(householdId),
  ];
  const results = await db.batch<Record<string, unknown>>(queries);
  requireValue(results[0].results.length === 1, '접근할 수 있는 원본 가계부를 선택해 주세요.');
  requireValue(results[1].results.length === 1, '사용할 수 있는 결제수단을 선택해 주세요.');
  const allowedTags = new Set(results[2].results.map((row) => String(row.id)));
  requireValue(
    tagIds.every((id) => allowedTags.has(id)),
    '사용할 수 없는 태그가 포함돼 있습니다.',
  );
  const rules = (results[3].results as unknown as StoredRule[]).filter((rule) =>
    tagIds.includes(rule.tagId),
  );
  requireValue(rules.length <= 1, '금액 처리 규칙은 한 번에 하나만 선택해 주세요.');
  const rule = rules[0] ?? null;
  const expectedRule = {
    expense: 'asset-expense',
    income: 'asset-income',
    saving: 'saving',
    transfer: 'transfer',
  }[type];
  requireValue(
    !rule || rule.type === expectedRule,
    '선택한 태그의 처리 규칙과 거래 종류가 다릅니다.',
  );
  if (!rule) {
    requireValue(
      type === 'expense' || type === 'income',
      '저축·이체에 적용할 처리 규칙 태그를 선택해 주세요.',
    );
    requireValue(
      !tx.assetId && !tx.toAssetId,
      '자산을 반영하려면 명시적인 처리 규칙 태그를 선택해 주세요.',
    );
  } else {
    const allowedAssets = new Set(results[4].results.map((row) => String(row.id)));
    requireValue(tx.assetId && allowedAssets.has(tx.assetId), '반영할 자산을 선택해 주세요.');
    if (type === 'saving' || type === 'transfer') {
      requireValue(
        tx.toAssetId && allowedAssets.has(tx.toAssetId) && tx.toAssetId !== tx.assetId,
        '서로 다른 출금 자산과 입금 자산을 선택해 주세요.',
      );
    } else {
      requireValue(!tx.toAssetId, '이 거래 종류에는 추가 입금 자산을 지정할 수 없습니다.');
    }
  }
  return { transaction: tx, rule };
}

export async function saveTransaction(
  db: D1Database,
  session: Session,
  body: ObjectBody,
): Promise<MutationResult> {
  const op = await identity(db, session, body, 'transaction.save');
  if (op.previous) return op.previous;
  const { transaction: tx, rule } = await validateTransaction(
    db,
    session.householdId,
    body.transaction,
  );
  const h = session.householdId;
  const id = tx.id ?? crypto.randomUUID();
  const existing = tx.id ? await transactionById(db, h, id) : null;
  if (tx.id && !existing) throw new ApiError(404, 'NOT_FOUND', '수정할 거래를 찾을 수 없습니다.');
  // Moving a record through an aggregated main view would change its ownership.
  requireValue(
    !existing || existing.ledgerId === tx.ledgerId,
    '거래는 원본 가계부에서 수정해 주세요.',
  );
  const expectedVersion = existing ? version(body.expectedVersion) : null;
  const now = new Date().toISOString();
  const columns = [
    tx.ledgerId,
    tx.date,
    tx.description,
    tx.amount,
    tx.type,
    tx.category,
    tx.ownerId,
    tx.paymentMethodId,
    JSON.stringify(tx.tagIds),
    tx.assetId,
    tx.toAssetId,
    now,
    session.user.id,
  ] as Binding[];
  const statements: D1PreparedStatement[] = existing
    ? [
        db
          .prepare(
            `UPDATE transactions SET ledger_id = ?, date = ?, description = ?, amount = ?, type = ?, category = ?,
      owner_id = ?, payment_method_id = ?, tag_ids = ?, asset_id = ?, to_asset_id = ?, updated_at = ?, updated_by = ?, version = version + 1
      WHERE household_id = ? AND id = ?`,
          )
          .bind(...columns, h, id),
      ]
    : [
        db
          .prepare(
            `INSERT INTO transactions (ledger_id, date, description, amount, type, category, owner_id, payment_method_id,
      tag_ids, asset_id, to_asset_id, updated_at, updated_by, household_id, id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(...columns, h, id),
      ];
  statements.push(
    db
      .prepare('DELETE FROM asset_movements WHERE household_id = ? AND transaction_id = ?')
      .bind(h, id),
  );
  if (rule) {
    const effects = [
      { assetId: tx.assetId!, amount: tx.type === 'income' ? tx.amount : -tx.amount },
    ];
    if (tx.toAssetId) effects.push({ assetId: tx.toAssetId, amount: tx.amount });
    for (const [index, effect] of effects.entries()) {
      statements.push(
        db
          .prepare(
            `INSERT INTO asset_movements (id, household_id, transaction_id, asset_id, amount, rule_id, rule_version)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(`${id}:${index}`, h, id, effect.assetId, effect.amount, rule.id, rule.version),
      );
    }
  }
  return commit(db, session, {
    ...op,
    entityId: id,
    entityType: 'transaction',
    ledgerId: tx.ledgerId,
    statements,
    guardSql: existing
      ? 'SELECT CASE WHEN EXISTS (SELECT 1 FROM transactions WHERE household_id = ? AND id = ? AND version = ? AND deleted_at IS NULL) THEN 1 ELSE 0 END'
      : 'SELECT 1',
    guardBindings: existing ? [h, id, expectedVersion] : [],
  });
}

export async function deleteTransaction(
  db: D1Database,
  session: Session,
  id: string,
  body: ObjectBody,
): Promise<MutationResult> {
  const op = await identity(db, session, body, `transaction.delete:${id}`);
  if (op.previous) return op.previous;
  const expected = version(body.expectedVersion);
  const current = await transactionById(db, session.householdId, id);
  if (!current) throw new ApiError(404, 'NOT_FOUND', '삭제할 거래를 찾을 수 없습니다.');
  const h = session.householdId;
  const now = new Date().toISOString();
  return commit(db, session, {
    ...op,
    entityId: id,
    entityType: 'deleted-transaction',
    ledgerId: current.ledgerId,
    guardSql:
      'SELECT CASE WHEN EXISTS (SELECT 1 FROM transactions WHERE household_id = ? AND id = ? AND version = ? AND deleted_at IS NULL) THEN 1 ELSE 0 END',
    guardBindings: [h, id, expected],
    statements: [
      db
        .prepare(
          'UPDATE transactions SET deleted_at = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE household_id = ? AND id = ?',
        )
        .bind(now, now, session.user.id, h, id),
      db
        .prepare('DELETE FROM asset_movements WHERE household_id = ? AND transaction_id = ?')
        .bind(h, id),
    ],
  });
}

export async function createLedger(
  db: D1Database,
  session: Session,
  body: ObjectBody,
): Promise<MutationResult> {
  const op = await identity(db, session, body, 'ledger.create');
  if (op.previous) return op.previous;
  const name = text(body.name, '가계부 이름', 60);
  const icon = body.icon ? text(body.icon, '아이콘', 16) : '📒';
  const budget = money(body.budget, true);
  const start = body.startDate ? date(body.startDate, '시작일') : null;
  const end = body.endDate ? date(body.endDate, '종료일') : null;
  requireValue(!start || !end || start <= end, '종료일은 시작일보다 빠를 수 없습니다.');
  const parentId = body.parentId == null ? null : text(body.parentId, '메인 가계부');
  if (parentId) {
    const parent = await ledgerById(db, session.householdId, parentId);
    requireValue(parent?.kind === 'main', '같은 가구의 메인 가계부에만 연결할 수 있습니다.');
  }
  const id = crypto.randomUUID();
  return commit(db, session, {
    ...op,
    entityId: id,
    entityType: 'ledger',
    ledgerId: id,
    guardSql: 'SELECT 1',
    guardBindings: [],
    statements: [
      db
        .prepare(
          `INSERT INTO ledgers (id, household_id, name, icon, kind, parent_id, budget, start_date, end_date)
      VALUES (?, ?, ?, ?, 'purpose', ?, ?, ?, ?)`,
        )
        .bind(id, session.householdId, name, icon, parentId, budget, start, end),
    ],
  });
}

export async function patchLedger(
  db: D1Database,
  session: Session,
  id: string,
  body: ObjectBody,
): Promise<MutationResult> {
  const op = await identity(db, session, body, `ledger.patch:${id}`);
  if (op.previous) return op.previous;
  const expected = version(body.expectedVersion);
  const current = await ledgerById(db, session.householdId, id);
  if (!current) throw new ApiError(404, 'NOT_FOUND', '가계부를 찾을 수 없습니다.');
  requireValue(
    ['parentId', 'archived', 'budget'].some((key) => Object.hasOwn(body, key)),
    '변경할 내용을 입력해 주세요.',
  );
  const parentId = Object.hasOwn(body, 'parentId')
    ? body.parentId == null
      ? null
      : text(body.parentId, '메인 가계부')
    : current.parentId;
  requireValue(
    current.kind === 'purpose' || parentId === null,
    '메인 가계부를 다른 가계부에 연결할 수 없습니다.',
  );
  if (parentId) {
    const parent = await ledgerById(db, session.householdId, parentId);
    requireValue(
      parent?.kind === 'main' && parent.id !== id,
      '메인 가계부에 한 단계로 연결해 주세요.',
    );
  }
  const budget = Object.hasOwn(body, 'budget') ? money(body.budget, true) : current.budget;
  if (Object.hasOwn(body, 'archived'))
    requireValue(typeof body.archived === 'boolean', '보관 여부가 올바르지 않습니다.');
  const archived = Object.hasOwn(body, 'archived') ? Boolean(body.archived) : current.archived;
  return commit(db, session, {
    ...op,
    entityId: id,
    entityType: 'ledger',
    ledgerId: id,
    guardSql:
      'SELECT CASE WHEN EXISTS (SELECT 1 FROM ledgers WHERE household_id = ? AND id = ? AND version = ?) THEN 1 ELSE 0 END',
    guardBindings: [session.householdId, id, expected],
    statements: [
      db
        .prepare(
          'UPDATE ledgers SET parent_id = ?, budget = ?, archived = ?, version = version + 1 WHERE household_id = ? AND id = ?',
        )
        .bind(parentId, budget, archived ? 1 : 0, session.householdId, id),
    ],
  });
}
