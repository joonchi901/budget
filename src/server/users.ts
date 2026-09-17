import type { MutationResult } from '../shared/types';
import type { Session } from './auth';
import { ApiError, requireValue } from './errors';
import {
  adminHierarchyGuard,
  checkHierarchyVersion,
  hierarchyIncrement,
  hierarchyVersion,
  requireAdmin,
} from './hierarchy';
import { combineGuards, commit, entityById } from './storage';
import { identity, type ObjectBody } from './validation';

export async function patchUserRole(
  db: D1Database,
  session: Session,
  id: string,
  body: ObjectBody,
): Promise<MutationResult> {
  const op = await identity(db, session, body, `user.role:${id}`);
  if (op.previous) return op.previous;
  await requireAdmin(db, session);
  const expectedHierarchyVersion = hierarchyVersion(body.expectedHierarchyVersion);
  await checkHierarchyVersion(db, session, expectedHierarchyVersion);
  requireValue(
    body.role === 'admin' || body.role === 'user',
    '권한은 admin 또는 user로 선택해 주세요.',
  );
  const current = await entityById(db, session.householdId, 'user', id);
  if (!current) throw new ApiError(404, 'NOT_FOUND', '구성원을 찾을 수 없습니다.');
  const admins = await db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE household_id=? AND role='admin'")
    .bind(session.householdId)
    .first<number>('count');
  if (current.role === 'admin' && body.role === 'user' && Number(admins) <= 1)
    throw new ApiError(
      400,
      'LAST_ADMIN',
      '최소 한 명의 관리자가 필요합니다. 다른 구성원에게 관리자 권한을 먼저 부여해 주세요.',
    );
  return commit(db, session, {
    ...op,
    entityType: 'user',
    entityId: id,
    ledgerId: null,
    expectedHierarchyVersion,
    ...combineGuards([
      adminHierarchyGuard(session, expectedHierarchyVersion),
      {
        sql: "EXISTS(SELECT 1 FROM users WHERE household_id=? AND id=? AND (?='admin' OR role!='admin' OR (SELECT COUNT(*) FROM users WHERE household_id=? AND role='admin')>1))",
        bindings: [session.householdId, id, body.role, session.householdId],
      },
    ]),
    statements: [
      db
        .prepare('UPDATE users SET role=? WHERE household_id=? AND id=?')
        .bind(body.role, session.householdId, id),
      hierarchyIncrement(db, session.householdId),
    ],
  });
}
