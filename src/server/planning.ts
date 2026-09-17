import type { Plan, PlanInput, PayrollLine, Rounding, SchedulePayment } from '../shared/planning';
import { payrollSummary, scheduleOccurrences } from '../shared/planning';
import type { Session } from './auth';
import { ApiError, requireValue } from './errors';
import { commit, combineGuards, existsGuard, ledgerById, type Guard } from './storage';
import { bool, checkVersion, date, identity, money, text, type ObjectBody } from './validation';

export const planDefinition = {
  table: 'planning_records',
  json: "json_set(json(t.payload_json),'$.id',t.id,'$.kind',t.kind,'$.ledgerId',t.ledger_id,'$.version',t.version,'$.archived',json(CASE t.archived WHEN 1 THEN 'true' ELSE 'false' END))",
};
export async function planById(
  db: D1Database,
  householdId: string,
  id: string,
): Promise<Plan | null> {
  const row = await db
    .prepare(
      `SELECT ${planDefinition.json} AS payload FROM planning_records t WHERE t.household_id=? AND t.id=?`,
    )
    .bind(householdId, id)
    .first<{ payload: string }>();
  return row ? JSON.parse(row.payload) : null;
}
function optionalText(value: unknown, name: string, max = 2000) {
  if (value == null || value === '') return '';
  return text(value, name, max);
}
function nullableId(value: unknown, name: string) {
  return value == null || value === '' ? null : text(value, name, 100);
}
function rounding(value: unknown): Rounding {
  requireValue(
    ['none', 'floor10000', 'ceil10000'].includes(String(value)),
    '금액 반올림 방식을 확인해 주세요.',
  );
  return value as Rounding;
}
function object(value: unknown): ObjectBody {
  requireValue(
    value && typeof value === 'object' && !Array.isArray(value),
    '계획 항목을 확인해 주세요.',
  );
  return value as ObjectBody;
}
async function validatePlan(
  db: D1Database,
  h: string,
  body: ObjectBody,
  previous?: Plan,
): Promise<{ plan: PlanInput; guards: Guard[] }> {
  const kind = body.kind;
  requireValue(
    ['budget', 'goal', 'payroll', 'event', 'schedule'].includes(String(kind)),
    '계획 종류를 확인해 주세요.',
  );
  requireValue(
    !previous || previous.kind === kind,
    '계획 종류는 변경할 수 없습니다. 새 계획으로 등록해 주세요.',
  );
  const ledgerId = text(body.ledgerId, '가계부'),
    ledger = await ledgerById(db, h, ledgerId);
  requireValue(
    ledger && (!ledger.archived || previous?.ledgerId === ledgerId),
    '사용 가능한 가계부를 선택해 주세요.',
  );
  const guards = [existsGuard('ledgers', h, ledgerId, ledger.version)];
  const startDate = date(body.startDate, '시작일'),
    endDate = date(body.endDate, '종료일');
  requireValue(startDate <= endDate, '종료일은 시작일 이후여야 합니다.');
  requireValue(startDate >= '0001-01-01' && endDate <= '9998-12-31', '계획 연도는 1~9998년입니다.');
  requireValue(
    new Date(endDate).getTime() - new Date(startDate).getTime() <= 3660 * 86400000,
    '계획 기간은 10년 이내로 입력해 주세요.',
  );
  const ownerId = body.ownerId == null ? null : body.ownerId;
  requireValue(
    ownerId === null || ['u1', 'u2', 'shared'].includes(String(ownerId)),
    '귀속을 확인해 주세요.',
  );
  if (ownerId && ownerId !== 'shared') {
    const owner = await db
      .prepare('SELECT id FROM users WHERE household_id=? AND id=?')
      .bind(h, ownerId)
      .first();
    requireValue(owner, '같은 가구의 구성원만 선택할 수 있습니다.');
  }
  const paymentMethodId = nullableId(body.paymentMethodId, '결제수단');
  if (paymentMethodId) {
    const row = await db
      .prepare('SELECT * FROM payment_methods WHERE household_id=? AND id=?')
      .bind(h, paymentMethodId)
      .first<Record<string, unknown>>();
    requireValue(
      row && (!row.archived || previous?.paymentMethodId === paymentMethodId),
      '사용 가능한 결제수단을 선택해 주세요.',
    );
    guards.push(
      typeof row.version === 'number'
        ? existsGuard('payment_methods', h, paymentMethodId, row.version)
        : {
            sql: 'EXISTS(SELECT 1 FROM payment_methods WHERE household_id=? AND id=?)',
            bindings: [h, paymentMethodId],
          },
    );
  }
  requireValue(
    Array.isArray(body.tagIds) &&
      body.tagIds.length <= 100 &&
      body.tagIds.every((v) => typeof v === 'string' && v.length <= 100),
    '태그 조건을 확인해 주세요.',
  );
  const tagIds = [...new Set(body.tagIds as string[])].sort();
  requireValue(tagIds.length === body.tagIds.length, '태그 조건을 중복 선택할 수 없습니다.');
  if (tagIds.length) {
    const rows = await db
      .prepare(
        'SELECT t.id,t.version,t.archived,g.id AS group_id,g.version AS group_version,g.archived AS group_archived,g.applies_to,g.ledger_ids FROM tags t JOIN tag_groups g ON g.id=t.group_id AND g.household_id=t.household_id WHERE t.household_id=? AND t.id IN (SELECT value FROM json_each(?))',
      )
      .bind(h, JSON.stringify(tagIds))
      .all<Record<string, unknown>>();
    requireValue(rows.results.length === tagIds.length, '같은 가구의 태그만 사용할 수 있습니다.');
    for (const row of rows.results) {
      const retained = previous?.ledgerId === ledgerId && previous.tagIds.includes(String(row.id));
      const scope =
        row.ledger_ids == null ? null : (JSON.parse(String(row.ledger_ids)) as string[]);
      requireValue(
        row.applies_to === 'transaction' &&
          (retained ||
            (!row.archived && !row.group_archived && (!scope || scope.includes(ledgerId)))),
        '이 가계부에서 사용할 수 있는 거래 태그를 선택해 주세요.',
      );
      guards.push(
        existsGuard('tags', h, String(row.id), Number(row.version)),
        existsGuard('tag_groups', h, String(row.group_id), Number(row.group_version)),
      );
    }
  }
  const base = {
    ledgerId,
    title: text(body.title, '계획 이름', 120),
    startDate,
    endDate,
    amount: money(body.amount, true),
    tagIds,
    paymentMethodId,
    ownerId: ownerId as Plan['ownerId'],
    includeLinked: body.includeLinked === undefined ? true : bool(body.includeLinked),
    notes: optionalText(body.notes, '메모'),
    archived: body.archived === undefined ? false : bool(body.archived),
  };
  const assetIds: string[] = [];
  let plan: PlanInput;
  if (kind === 'budget') {
    requireValue(
      ['month', 'week', 'period'].includes(String(body.cadence)),
      '예산 기간 유형을 선택해 주세요.',
    );
    requireValue(
      body.budgetScope === 'total' || body.budgetScope === 'category',
      '전체/항목 예산을 선택해 주세요.',
    );
    requireValue(
      body.budgetScope !== 'category' || tagIds.length > 0,
      '항목별 예산에는 태그 조건이 필요합니다.',
    );
    requireValue(
      body.budgetScope !== 'total' || tagIds.length === 0,
      '전체 예산에는 태그 조건을 설정할 수 없습니다.',
    );
    requireValue(
      body.cadence !== 'week' ||
        new Date(endDate).getTime() - new Date(startDate).getTime() <= 6 * 86400000,
      '주간 예산은 최대 7일입니다.',
    );
    plan = {
      ...base,
      kind,
      cadence: body.cadence as 'month' | 'week' | 'period',
      budgetScope: body.budgetScope,
    };
    if (!base.archived && plan.budgetScope === 'total') {
      const guard: Guard = {
        sql: "NOT EXISTS(SELECT 1 FROM planning_records WHERE household_id=? AND ledger_id=? AND kind='budget' AND archived=0 AND id<>? AND json_extract(payload_json,'$.budgetScope')='total' AND json_extract(payload_json,'$.cadence')=? AND json_extract(payload_json,'$.startDate')<=? AND json_extract(payload_json,'$.endDate')>=? AND COALESCE(json_extract(payload_json,'$.ownerId'),'')=? AND COALESCE(json_extract(payload_json,'$.paymentMethodId'),'')=?)",
        bindings: [
          h,
          ledgerId,
          previous?.id ?? '',
          plan.cadence,
          endDate,
          startDate,
          base.ownerId ?? '',
          paymentMethodId ?? '',
        ],
      };
      const valid = await db
        .prepare(`SELECT ${guard.sql} AS valid`)
        .bind(...guard.bindings)
        .first<number>('valid');
      requireValue(
        valid === 1,
        '기간과 조건이 겹치는 전체 예산이 있습니다. 기존 예산을 수정해 주세요.',
      );
      guards.push(guard);
    }
  } else if (kind === 'goal') {
    requireValue(
      ['income', 'expense', 'savings'].includes(String(body.metric)),
      '목표 집계 대상을 선택해 주세요.',
    );
    requireValue(
      body.direction === 'atLeast' || body.direction === 'atMost',
      '목표 달성 기준을 선택해 주세요.',
    );
    const assetId = nullableId(body.assetId, '저축 자산');
    requireValue(body.metric === 'savings' || !assetId, '자산은 저축 목표에만 선택할 수 있습니다.');
    requireValue(
      body.metric !== 'savings' || (!tagIds.length && !paymentMethodId && !ownerId),
      '저축 목표는 가계부 계위와 관계없이 가구 전체 또는 선택 자산의 순저축으로 계산합니다.',
    );
    if (assetId) assetIds.push(assetId);
    plan = {
      ...base,
      kind,
      metric: body.metric as 'income' | 'expense' | 'savings',
      direction: body.direction,
      assetId,
    };
  } else if (kind === 'payroll') {
    requireValue(
      Array.isArray(body.lines) && body.lines.length <= 100,
      '배분 항목은 최대 100개입니다.',
    );
    const lines: PayrollLine[] = body.lines.map((value) => {
      const line = object(value),
        assetId = nullableId(line.assetId, '배분 자산');
      if (assetId) assetIds.push(assetId);
      requireValue(
        ['expense', 'savings', 'other'].includes(String(line.purpose)),
        '배분 목적을 선택해 주세요.',
      );
      return {
        id: text(line.id, '항목 번호'),
        title: text(line.title, '배분 항목', 120),
        amount: money(line.amount, true),
        rounding: rounding(line.rounding),
        purpose: line.purpose as PayrollLine['purpose'],
        assetId,
      };
    });
    requireValue(
      new Set(lines.map((l) => l.id)).size === lines.length,
      '배분 항목 번호가 중복되었습니다.',
    );
    plan = { ...base, kind, rounding: rounding(body.rounding), lines };
    requireValue(
      Number.isSafeInteger(payrollSummary({ ...plan, id: '', version: 1 }).allocated),
      '배분 총액이 허용 범위를 초과했습니다.',
    );
  } else if (kind === 'event') {
    requireValue(
      body.actualMode === 'transactions' || body.actualMode === 'manual',
      '행사 실적 계산 방식을 선택해 주세요.',
    );
    plan = {
      ...base,
      kind,
      actualMode: body.actualMode,
      actualAmount: body.actualMode === 'manual' ? money(body.actualAmount, true) : null,
      evaluation: optionalText(body.evaluation, '결산 메모'),
    };
  } else {
    requireValue(
      body.repeat === 'once' || body.repeat === 'monthly',
      '결제 반복 주기를 선택해 주세요.',
    );
    requireValue(
      body.repeat !== 'once' || startDate === endDate,
      '일회성 결제는 시작일과 종료일을 결제일로 맞춰 주세요.',
    );
    requireValue(
      Array.isArray(body.payments) && body.payments.length <= 132,
      '납부 확인 내역은 최대 132개입니다.',
    );
    const payments: SchedulePayment[] = body.payments.map((value) => {
      const p = object(value);
      return {
        date: date(p.date, '예정 결제일'),
        paidDate: date(p.paidDate, '실제 납부일'),
        amount: money(p.amount, true),
        note: optionalText(p.note, '납부 메모', 500),
      };
    });
    requireValue(
      new Set(payments.map((p) => p.date)).size === payments.length,
      '같은 결제일의 납부 확인이 중복되었습니다.',
    );
    plan = { ...base, kind: 'schedule', repeat: body.repeat, payments };
    const dueDates = new Set(
      scheduleOccurrences({ ...plan, id: '', version: 1 }).map((o) => o.date),
    );
    requireValue(
      payments.every((p) => dueDates.has(p.date)),
      '납부 확인 날짜가 결제 일정에 포함되지 않습니다.',
    );
  }
  for (const assetId of new Set(assetIds)) {
    const asset = await db
      .prepare('SELECT * FROM assets WHERE household_id=? AND id=?')
      .bind(h, assetId)
      .first<{ id: string; version: number; kind: string; archived: number }>();
    const retained =
      previous?.kind === 'goal'
        ? previous.assetId === assetId
        : previous?.kind === 'payroll' && previous.lines.some((line) => line.assetId === assetId);
    requireValue(
      asset && asset.kind === 'asset' && (!asset.archived || retained),
      '같은 가구의 사용 가능한 자산 항목을 선택해 주세요.',
    );
    guards.push(existsGuard('assets', h, assetId, asset.version));
  }
  return { plan, guards };
}
export async function createPlan(db: D1Database, session: Session, body: ObjectBody) {
  const op = await identity(db, session, body, 'plan.create');
  if (op.previous) return op.previous;
  const { plan, guards } = await validatePlan(db, session.householdId, body),
    id = crypto.randomUUID();
  return commit(db, session, {
    ...op,
    entityType: 'plan',
    entityId: id,
    ledgerId: plan.ledgerId,
    ...combineGuards(guards),
    statements: [
      db
        .prepare(
          'INSERT INTO planning_records(id,household_id,ledger_id,kind,payload_json,archived) VALUES(?,?,?,?,?,?)',
        )
        .bind(
          id,
          session.householdId,
          plan.ledgerId,
          plan.kind,
          JSON.stringify(plan),
          Number(plan.archived),
        ),
    ],
  });
}
export async function patchPlan(db: D1Database, session: Session, id: string, body: ObjectBody) {
  const op = await identity(db, session, body, `plan.patch:${id}`);
  if (op.previous) return op.previous;
  const current = await planById(db, session.householdId, id);
  if (!current) throw new ApiError(404, 'NOT_FOUND', '계획을 찾을 수 없습니다.');
  const expected = checkVersion(current, body.expectedVersion);
  const { plan, guards } = await validatePlan(
    db,
    session.householdId,
    { ...current, ...body },
    current,
  );
  guards.push(existsGuard('planning_records', session.householdId, id, expected));
  return commit(db, session, {
    ...op,
    entityType: 'plan',
    entityId: id,
    ledgerId: plan.ledgerId,
    ...combineGuards(guards),
    statements: [
      db
        .prepare(
          'UPDATE planning_records SET ledger_id=?,payload_json=?,archived=?,version=version+1 WHERE household_id=? AND id=?',
        )
        .bind(plan.ledgerId, JSON.stringify(plan), Number(plan.archived), session.householdId, id),
    ],
  });
}
