import type { MutationResult } from '../shared/types';
import type { Session } from './auth';
import { ApiError, requireValue } from './errors';
import { combineGuards, commit, existsGuard, ledgerById } from './storage';
import {
  adminHierarchyGuard,
  checkHierarchyVersion,
  hierarchyIncrement,
  hierarchyVersion,
  requireAdmin,
} from './hierarchy';
import { identity, text, date, money, version, type ObjectBody } from './validation';
import type { Ledger } from '../shared/types';

async function settings(db: D1Database, h: string, body: ObjectBody, current?: Ledger) {
  const day = body.periodStartDay ?? current?.periodStartDay ?? 1;
  requireValue(
    Number.isInteger(day) && Number(day) >= 1 && Number(day) <= 31,
    '월 시작일은 1~31일입니다.',
  );
  const fixed = body.fixedExpenseTagIds ?? current?.fixedExpenseTagIds ?? [];
  requireValue(
    Array.isArray(fixed) && fixed.length <= 100 && fixed.every((x) => typeof x === 'string'),
    '고정지출 기준 태그를 확인해 주세요.',
  );
  const mappings = body.tagMappings ?? current?.tagMappings ?? {};
  requireValue(
    mappings &&
      typeof mappings === 'object' &&
      !Array.isArray(mappings) &&
      Object.keys(mappings).length <= 100,
    '분류 대응을 확인해 주세요.',
  );
  const map = mappings as Record<string, unknown>;
  requireValue(
    Object.values(map).every((v) => typeof v === 'string'),
    '분류 대응에는 태그를 선택해 주세요.',
  );
  const ids = [...new Set([...fixed, ...Object.keys(map), ...Object.values(map)])];
  if (ids.length) {
    const rows = await db
      .prepare(
        "SELECT t.id FROM tags t JOIN tag_groups g ON g.id=t.group_id AND g.household_id=t.household_id WHERE t.household_id=? AND g.applies_to='transaction' AND t.id IN (SELECT value FROM json_each(?))",
      )
      .bind(h, JSON.stringify(ids))
      .all();
    requireValue(rows.results.length === ids.length, '같은 가구의 거래 태그를 선택해 주세요.');
  }
  return {
    day: Number(day),
    fixed: JSON.stringify([...new Set(fixed)]),
    mappings: JSON.stringify(map),
  };
}

interface Node {
  id: string;
  parent_id: string | null;
  sort_order: number;
}

async function tree(db: D1Database, householdId: string): Promise<Node[]> {
  return (
    await db
      .prepare(
        'SELECT id,parent_id,sort_order FROM ledgers WHERE household_id=? ORDER BY sort_order,id',
      )
      .bind(householdId)
      .all<Node>()
  ).results;
}

function parentValue(value: unknown): string | null {
  return value == null ? null : text(value, '상위 가계부');
}

function validateParent(nodes: Node[], id: string, parentId: string | null) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  requireValue(parentId === null || byId.has(parentId), '같은 가구의 가계부를 선택해 주세요.');
  const visited = new Set<string>([id]);
  let ancestor = parentId;
  while (ancestor) {
    requireValue(!visited.has(ancestor), '자기 자신이나 하위 가계부 안으로 이동할 수 없습니다.');
    visited.add(ancestor);
    ancestor = byId.get(ancestor)?.parent_id ?? null;
  }
}

function placement(nodes: Node[], id: string, parentId: string | null, before: unknown) {
  const siblings = nodes
    .filter((node) => node.parent_id === parentId && node.id !== id)
    .map((node) => node.id);
  const beforeId = before == null ? null : text(before, '순서 기준 가계부');
  requireValue(
    beforeId === null || siblings.includes(beforeId),
    '같은 상위 가계부에 속한 다른 가계부를 순서 기준으로 선택해 주세요.',
  );
  const at = beforeId === null ? siblings.length : siblings.indexOf(beforeId);
  siblings.splice(at, 0, id);
  return { ids: siblings, sortOrder: at };
}

function normalizeOrder(db: D1Database, householdId: string, ids: string[]) {
  const order = JSON.stringify(ids);
  return db
    .prepare(
      `UPDATE ledgers SET sort_order=CAST((SELECT key FROM json_each(?) WHERE value=ledgers.id) AS INTEGER),version=version+1
    WHERE household_id=? AND id IN (SELECT value FROM json_each(?)) AND sort_order!=CAST((SELECT key FROM json_each(?) WHERE value=ledgers.id) AS INTEGER)`,
    )
    .bind(order, householdId, order, order);
}

export async function createLedger(
  db: D1Database,
  session: Session,
  body: ObjectBody,
): Promise<MutationResult> {
  const op = await identity(db, session, body, 'ledger.create');
  if (op.previous) return op.previous;
  await requireAdmin(db, session);
  const expectedHierarchyVersion = hierarchyVersion(body.expectedHierarchyVersion);
  await checkHierarchyVersion(db, session, expectedHierarchyVersion);
  const name = text(body.name, '가계부 이름', 60);
  const icon = body.icon ? text(body.icon, '아이콘', 16) : '📒';
  const budget = money(body.budget, true);
  const start = body.startDate ? date(body.startDate, '시작일') : null;
  const end = body.endDate ? date(body.endDate, '종료일') : null;
  requireValue(!start || !end || start <= end, '종료일은 시작일보다 빠를 수 없습니다.');
  const parentId = parentValue(body.parentId);
  const id = crypto.randomUUID();
  const nodes = await tree(db, session.householdId);
  validateParent(nodes, id, parentId);
  const order = placement(nodes, id, parentId, body.beforeId);
  const config = await settings(db, session.householdId, body);
  return commit(db, session, {
    ...op,
    entityId: id,
    entityType: 'ledger',
    ledgerId: id,
    expectedHierarchyVersion,
    ...combineGuards([adminHierarchyGuard(session, expectedHierarchyVersion)]),
    statements: [
      db
        .prepare(
          `INSERT INTO ledgers (id, household_id, name, icon, kind, parent_id, budget, start_date, end_date,period_start_day,fixed_expense_tag_ids,tag_mappings,sort_order)
        VALUES (?, ?, ?, ?, 'purpose', ?, ?, ?, ?,?,?,?,?)`,
        )
        .bind(
          id,
          session.householdId,
          name,
          icon,
          parentId,
          budget,
          start,
          end,
          config.day,
          config.fixed,
          config.mappings,
          order.sortOrder,
        ),
      normalizeOrder(db, session.householdId, order.ids),
      hierarchyIncrement(db, session.householdId),
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
  const structural = ['parentId', 'beforeId', 'sortOrder', 'archived'].some((key) =>
    Object.hasOwn(body, key),
  );
  let expectedHierarchyVersion: number | undefined;
  if (structural) {
    await requireAdmin(db, session);
    expectedHierarchyVersion = hierarchyVersion(body.expectedHierarchyVersion);
    await checkHierarchyVersion(db, session, expectedHierarchyVersion);
  }
  requireValue(
    !Object.hasOwn(body, 'sortOrder'),
    '순서는 이동할 위치의 가계부를 기준으로 변경해 주세요.',
  );
  const expected = version(body.expectedVersion);
  const current = await ledgerById(db, session.householdId, id);
  if (!current) throw new ApiError(404, 'NOT_FOUND', '가계부를 찾을 수 없습니다.');
  requireValue(
    [
      'parentId',
      'beforeId',
      'archived',
      'budget',
      'name',
      'icon',
      'startDate',
      'endDate',
      'periodStartDay',
      'fixedExpenseTagIds',
      'tagMappings',
    ].some((key) => Object.hasOwn(body, key)),
    '변경할 내용을 입력해 주세요.',
  );
  const parentId = Object.hasOwn(body, 'parentId') ? parentValue(body.parentId) : current.parentId;
  const parentChanged = parentId !== current.parentId;
  let sortOrder = current.sortOrder ?? 0;
  const orderStatements: D1PreparedStatement[] = [];
  if (parentChanged || Object.hasOwn(body, 'beforeId')) {
    const nodes = await tree(db, session.householdId);
    validateParent(nodes, id, parentId);
    const order = placement(nodes, id, parentId, body.beforeId);
    sortOrder = order.sortOrder;
    if (parentChanged) {
      const oldSiblings = nodes
        .filter((node) => node.parent_id === current.parentId && node.id !== id)
        .map((node) => node.id);
      orderStatements.push(normalizeOrder(db, session.householdId, oldSiblings));
    }
    orderStatements.push(normalizeOrder(db, session.householdId, order.ids));
  }
  const budget = Object.hasOwn(body, 'budget') ? money(body.budget, true) : current.budget;
  if (Object.hasOwn(body, 'archived'))
    requireValue(typeof body.archived === 'boolean', '보관 여부가 올바르지 않습니다.');
  const archived = Object.hasOwn(body, 'archived') ? Boolean(body.archived) : current.archived;
  const name = body.name === undefined ? current.name : text(body.name, '가계부 이름', 60);
  const icon = body.icon === undefined ? current.icon : text(body.icon, '아이콘', 16);
  const start =
    body.startDate === undefined
      ? current.startDate
      : body.startDate
        ? date(body.startDate, '시작일')
        : null;
  const end =
    body.endDate === undefined
      ? current.endDate
      : body.endDate
        ? date(body.endDate, '종료일')
        : null;
  requireValue(!start || !end || start <= end, '종료일은 시작일보다 빠를 수 없습니다.');
  // Mappings describe this node's immediate parent, so they must never follow a move.
  const config = await settings(
    db,
    session.householdId,
    parentChanged ? { ...body, tagMappings: {} } : body,
    current,
  );
  return commit(db, session, {
    ...op,
    entityId: id,
    entityType: 'ledger',
    ledgerId: id,
    expectedHierarchyVersion,
    ...combineGuards([
      existsGuard('ledgers', session.householdId, id, expected),
      ...(expectedHierarchyVersion === undefined
        ? []
        : [adminHierarchyGuard(session, expectedHierarchyVersion)]),
    ]),
    statements: [
      db
        .prepare(
          'UPDATE ledgers SET parent_id=?,kind=?,sort_order=?,budget=?,archived=?,name=?,icon=?,start_date=?,end_date=?,period_start_day=?,fixed_expense_tag_ids=?,tag_mappings=?,version=version+1 WHERE household_id=? AND id=?',
        )
        .bind(
          parentId,
          parentId !== null ? 'purpose' : current.kind,
          sortOrder,
          budget,
          Number(archived),
          name,
          icon,
          start,
          end,
          config.day,
          config.fixed,
          config.mappings,
          session.householdId,
          id,
        ),
      ...orderStatements,
      ...(expectedHierarchyVersion === undefined
        ? []
        : [hierarchyIncrement(db, session.householdId)]),
    ],
  });
}
