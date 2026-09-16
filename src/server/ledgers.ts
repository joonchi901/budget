import type { MutationResult } from '../shared/types';
import type { Session } from './auth';
import { ApiError, requireValue } from './errors';
import { commit, ledgerById } from './storage';
import { identity, text, date, money, version, type ObjectBody } from './validation';

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
