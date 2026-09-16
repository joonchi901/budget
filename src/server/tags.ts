import type { TagGroup } from '../shared/types';
import type { Session } from './auth';
import { ApiError, requireValue } from './errors';
import { commit, combineGuards, entityById, existsGuard, type Guard } from './storage';
import {
  checkVersion,
  bool,
  color,
  identity,
  sortOrder,
  text,
  type ObjectBody,
} from './validation';

export function tagIds(value: unknown): string[] {
  requireValue(
    Array.isArray(value) &&
      value.length <= 100 &&
      value.every((id) => typeof id === 'string' && id.length <= 600),
    '태그 목록을 확인해 주세요.',
  );
  requireValue(new Set(value).size === value.length, '중복 태그를 선택할 수 없습니다.');
  return value as string[];
}
// Retained selections can remain after archival or scope changes. New attachments must
// satisfy current configuration. Version guards close the validation/commit race.
export async function validateTags(
  db: D1Database,
  h: string,
  ids: string[],
  appliesTo: 'transaction' | 'asset',
  ledgerId: string | null,
  previous: string[] = [],
): Promise<Guard[]> {
  if (!ids.length) return [];
  const rows = await db
    .prepare(
      `SELECT t.id,t.version,t.archived,t.group_id,t.parent_id,g.version AS group_version,g.archived AS group_archived,g.applies_to,g.ledger_ids,g.selection_mode FROM tags t JOIN tag_groups g ON g.id=t.group_id AND g.household_id=t.household_id WHERE t.household_id=? AND t.id IN (SELECT value FROM json_each(?))`,
    )
    .bind(h, JSON.stringify(ids))
    .all<Record<string, unknown>>();
  requireValue(rows.results.length === ids.length, '사용할 수 없는 태그가 포함돼 있습니다.');
  const counts = new Map<string, number>();
  for (const row of rows.results) {
    requireValue(row.applies_to === appliesTo, '이 항목에 사용할 수 없는 태그 유형입니다.');
    requireValue(
      !row.parent_id || ids.includes(String(row.parent_id)),
      '소분류의 상위 태그도 함께 선택해 주세요.',
    );
    const retained = previous.includes(String(row.id));
    const scope = row.ledger_ids == null ? null : (JSON.parse(String(row.ledger_ids)) as string[]);
    requireValue(
      retained ||
        (!row.archived &&
          !row.group_archived &&
          (!scope || (!!ledgerId && scope.includes(ledgerId)))),
      '보관됐거나 가계부 범위 밖인 태그를 새로 선택할 수 없습니다.',
    );
    const n = (counts.get(String(row.group_id)) ?? 0) + 1;
    counts.set(String(row.group_id), n);
    requireValue(
      row.selection_mode !== 'single' || n <= 1,
      '단일 선택 유형에는 태그를 하나만 선택해 주세요.',
    );
  }
  return [
    {
      sql: `NOT EXISTS(SELECT 1 FROM json_each(?) v LEFT JOIN tags t ON t.id=json_extract(v.value,'$.id') AND t.household_id=? LEFT JOIN tag_groups g ON g.id=t.group_id AND g.household_id=t.household_id WHERE t.id IS NULL OR g.id IS NULL OR t.version<>json_extract(v.value,'$.version') OR g.version<>json_extract(v.value,'$.groupVersion'))`,
      bindings: [
        JSON.stringify(
          rows.results.map((r) => ({
            id: r.id,
            version: r.version,
            groupVersion: r.group_version,
          })),
        ),
        h,
      ],
    },
  ];
}
async function parentRelation(
  db: D1Database,
  h: string,
  id: string,
  group: TagGroup,
  value: unknown,
) {
  const parentId = value == null || value === '' ? null : text(value, '상위 옵션', 600);
  const guards: Guard[] = [];
  const visited = new Set([id]);
  let next = parentId;
  while (next) {
    requireValue(!visited.has(next), '태그 관계가 순환할 수 없습니다.');
    visited.add(next);
    const parent = await entityById(db, h, 'tag', next);
    requireValue(
      parent && !parent.archived && parent.groupId !== group.id,
      '다른 유형의 사용 가능한 상위 옵션을 선택해 주세요.',
    );
    const pg = await entityById(db, h, 'tagGroup', parent.groupId);
    requireValue(
      pg && !pg.archived && pg.appliesTo === group.appliesTo,
      '같은 적용 대상의 상위 옵션을 선택해 주세요.',
    );
    guards.push(
      existsGuard('tags', h, parent.id, parent.version),
      existsGuard('tag_groups', h, pg.id, pg.version),
    );
    next = parent.parentId ?? null;
  }
  if (parentId) {
    const table = group.appliesTo === 'asset' ? 'assets' : 'transactions';
    const active =
      group.appliesTo === 'asset'
        ? ''
        : " AND e.deleted_at IS NULL AND e.type IN ('income','expense')";
    const guard = {
      sql: `NOT EXISTS(SELECT 1 FROM ${table} e WHERE e.household_id=?${active} AND EXISTS(SELECT 1 FROM json_each(e.tag_ids) WHERE value=?) AND NOT EXISTS(SELECT 1 FROM json_each(e.tag_ids) WHERE value=?))`,
      bindings: [h, id, parentId],
    };
    const valid = await db
      .prepare(`SELECT ${guard.sql} AS valid`)
      .bind(...guard.bindings)
      .first<number>('valid');
    requireValue(valid === 1, '기존 기록에서 상위 옵션을 먼저 선택한 뒤 관계를 설정해 주세요.');
    guards.push(guard);
  }
  return { parentId, guards };
}
async function scope(
  db: D1Database,
  h: string,
  value: unknown,
  appliesTo: string,
): Promise<string[] | null> {
  if (value === null) return null;
  requireValue(appliesTo === 'transaction', '자산 태그 유형은 가구 전체에 적용됩니다.');
  requireValue(
    Array.isArray(value) && value.length <= 100 && value.every((v) => typeof v === 'string'),
    '적용 가계부 목록을 확인해 주세요.',
  );
  const ids = [...new Set(value as string[])];
  if (ids.length) {
    const result = await db
      .prepare(
        `SELECT id FROM ledgers WHERE household_id=? AND id IN (SELECT value FROM json_each(?))`,
      )
      .bind(h, JSON.stringify(ids))
      .all();
    requireValue(result.results.length === ids.length, '같은 가구의 가계부만 선택할 수 있습니다.');
  }
  return ids;
}
function mode(value: unknown): TagGroup['selectionMode'] {
  requireValue(value === 'single' || value === 'multiple', '태그 선택 방식을 확인해 주세요.');
  return value;
}
function cardinalityGuard(h: string, id: string, appliesTo: string): Guard {
  const table = appliesTo === 'asset' ? 'assets' : 'transactions';
  // Tombstones and migrated legacy transfers keep their original tag references,
  // but only editable records participate in current selection cardinality.
  const active =
    appliesTo === 'transaction'
      ? " AND e.deleted_at IS NULL AND e.type IN ('income','expense')"
      : '';
  return {
    sql: `NOT EXISTS(SELECT 1 FROM ${table} e JOIN json_each(e.tag_ids) j JOIN tags t ON t.id=j.value AND t.household_id=e.household_id WHERE e.household_id=? AND t.group_id=?${active} GROUP BY e.id HAVING COUNT(*)>1)`,
    bindings: [h, id],
  };
}
export async function createTagGroup(db: D1Database, session: Session, body: ObjectBody) {
  const op = await identity(db, session, body, 'tagGroup.create');
  if (op.previous) return op.previous;
  requireValue(
    body.appliesTo === 'transaction' || body.appliesTo === 'asset',
    '태그 적용 대상을 확인해 주세요.',
  );
  const h = session.householdId,
    id = crypto.randomUUID(),
    name = text(body.name, '태그 유형 이름', 80),
    selectionMode = mode(body.selectionMode);
  const ledgerIds = await scope(db, h, body.ledgerIds ?? null, body.appliesTo);
  const order = body.sortOrder === undefined ? 0 : sortOrder(body.sortOrder);
  return commit(db, session, {
    ...op,
    entityType: 'tagGroup',
    entityId: id,
    ledgerId: null,
    ...combineGuards([]),
    statements: [
      db
        .prepare(
          'INSERT INTO tag_groups(id,household_id,name,selection_mode,applies_to,ledger_ids,sort_order) VALUES(?,?,?,?,?,?,?)',
        )
        .bind(
          id,
          h,
          name,
          selectionMode,
          body.appliesTo,
          ledgerIds === null ? null : JSON.stringify(ledgerIds),
          order,
        ),
    ],
  });
}
export async function patchTagGroup(
  db: D1Database,
  session: Session,
  id: string,
  body: ObjectBody,
) {
  const op = await identity(db, session, body, `tagGroup.patch:${id}`);
  if (op.previous) return op.previous;
  const h = session.householdId,
    current = await entityById(db, h, 'tagGroup', id);
  if (!current) throw new ApiError(404, 'NOT_FOUND', '태그 유형을 찾을 수 없습니다.');
  const expected = checkVersion(current, body.expectedVersion),
    name = body.name === undefined ? current.name : text(body.name, '태그 유형 이름', 80);
  const selectionMode =
    body.selectionMode === undefined ? current.selectionMode : mode(body.selectionMode);
  const ledgerIds =
    body.ledgerIds === undefined
      ? current.ledgerIds
      : await scope(db, h, body.ledgerIds, current.appliesTo);
  const archived = body.archived === undefined ? current.archived : bool(body.archived),
    order = body.sortOrder === undefined ? current.sortOrder : sortOrder(body.sortOrder);
  const guards = [existsGuard('tag_groups', h, id, expected)];
  if (selectionMode === 'single') {
    const guard = cardinalityGuard(h, id, current.appliesTo);
    const valid = await db
      .prepare(`SELECT ${guard.sql} AS valid`)
      .bind(...guard.bindings)
      .first<number>('valid');
    requireValue(valid === 1, '기존 기록에 복수 선택이 남아 있어 단일 선택으로 바꿀 수 없습니다.');
    guards.push(guard);
  }
  return commit(db, session, {
    ...op,
    entityType: 'tagGroup',
    entityId: id,
    ledgerId: null,
    ...combineGuards(guards),
    statements: [
      db
        .prepare(
          'UPDATE tag_groups SET name=?,selection_mode=?,ledger_ids=?,sort_order=?,archived=?,version=version+1 WHERE household_id=? AND id=?',
        )
        .bind(
          name,
          selectionMode,
          ledgerIds === null ? null : JSON.stringify(ledgerIds),
          order,
          Number(archived),
          h,
          id,
        ),
    ],
  });
}
export async function createTag(db: D1Database, session: Session, body: ObjectBody) {
  const op = await identity(db, session, body, 'tag.create');
  if (op.previous) return op.previous;
  const h = session.householdId,
    id = crypto.randomUUID(),
    groupId = text(body.groupId, '태그 유형'),
    group = await entityById(db, h, 'tagGroup', groupId);
  requireValue(group && !group.archived, '사용할 수 있는 태그 유형을 선택해 주세요.');
  const name = text(body.name, '태그 이름', 80),
    shade = color(body.color),
    order = body.sortOrder === undefined ? 0 : sortOrder(body.sortOrder);
  const relation = await parentRelation(db, h, id, group, body.parentId);
  return commit(db, session, {
    ...op,
    entityType: 'tag',
    entityId: id,
    ledgerId: null,
    ...combineGuards([existsGuard('tag_groups', h, groupId, group.version), ...relation.guards]),
    statements: [
      db
        .prepare(
          'INSERT INTO tags(id,household_id,group_id,name,color,sort_order,parent_id) VALUES(?,?,?,?,?,?,?)',
        )
        .bind(id, h, groupId, name, shade, order, relation.parentId),
    ],
  });
}
export async function patchTag(db: D1Database, session: Session, id: string, body: ObjectBody) {
  const op = await identity(db, session, body, `tag.patch:${id}`);
  if (op.previous) return op.previous;
  const h = session.householdId,
    current = await entityById(db, h, 'tag', id);
  if (!current) throw new ApiError(404, 'NOT_FOUND', '태그를 찾을 수 없습니다.');
  const name = body.name === undefined ? current.name : text(body.name, '태그 이름', 80),
    shade = body.color === undefined ? current.color : color(body.color);
  const order = body.sortOrder === undefined ? current.sortOrder : sortOrder(body.sortOrder),
    archived = body.archived === undefined ? current.archived : bool(body.archived);
  const group = await entityById(db, h, 'tagGroup', current.groupId);
  const relation =
    Object.hasOwn(body, 'parentId') && body.parentId !== current.parentId
      ? await parentRelation(db, h, id, group!, body.parentId)
      : { parentId: current.parentId ?? null, guards: [] };
  return commit(db, session, {
    ...op,
    entityType: 'tag',
    entityId: id,
    ledgerId: null,
    ...combineGuards([
      existsGuard('tags', h, id, checkVersion(current, body.expectedVersion)),
      ...relation.guards,
    ]),
    statements: [
      db
        .prepare(
          'UPDATE tags SET name=?,color=?,sort_order=?,archived=?,parent_id=?,version=version+1 WHERE household_id=? AND id=?',
        )
        .bind(name, shade, order, Number(archived), relation.parentId, h, id),
    ],
  });
}
