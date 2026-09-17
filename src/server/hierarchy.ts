import type { Session } from './auth';
import { ApiError, requireValue } from './errors';
import type { Guard } from './storage';

/** Read the current role rather than trusting a role supplied by a client or old session. */
export async function requireAdmin(db: D1Database, session: Session): Promise<void> {
  const role = await db
    .prepare('SELECT role FROM users WHERE household_id=? AND id=?')
    .bind(session.householdId, session.user.id)
    .first<string>('role');
  if (role !== 'admin')
    throw new ApiError(
      403,
      'ADMIN_REQUIRED',
      '가계부 계층과 구성원 권한은 관리자만 변경할 수 있습니다.',
    );
}

export function hierarchyVersion(value: unknown): number {
  requireValue(
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0,
    '현재 가계부 계층 버전이 필요합니다. 새로고침 후 다시 시도해 주세요.',
  );
  return value;
}

export async function getHierarchyVersion(db: D1Database, householdId: string): Promise<number> {
  return (
    (await db
      .prepare('SELECT hierarchy_version FROM households WHERE id=?')
      .bind(householdId)
      .first<number>('hierarchy_version')) ?? 0
  );
}

/** Include this guard in the SAME D1 batch as every structure or role mutation. */
export function adminHierarchyGuard(session: Session, expected: number): Guard {
  return {
    sql: "EXISTS(SELECT 1 FROM households h JOIN users u ON u.household_id=h.id WHERE h.id=? AND h.hierarchy_version=? AND u.id=? AND u.role='admin')",
    bindings: [session.householdId, expected, session.user.id],
  };
}

export function hierarchyIncrement(db: D1Database, householdId: string): D1PreparedStatement {
  return db
    .prepare('UPDATE households SET hierarchy_version=hierarchy_version+1 WHERE id=?')
    .bind(householdId);
}

export async function hierarchyConflict(db: D1Database, session: Session): Promise<never> {
  await requireAdmin(db, session);
  throw new ApiError(
    409,
    'HIERARCHY_CONFLICT',
    '다른 관리자가 가계부 계층 또는 권한을 변경했습니다. 최신 구조를 확인한 뒤 다시 변경해 주세요.',
    { hierarchyVersion: await getHierarchyVersion(db, session.householdId) },
  );
}

export async function checkHierarchyVersion(
  db: D1Database,
  session: Session,
  expected: number,
): Promise<void> {
  await requireAdmin(db, session);
  if ((await getHierarchyVersion(db, session.householdId)) !== expected)
    await hierarchyConflict(db, session);
}
