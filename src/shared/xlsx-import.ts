import { cellValue, originalTransactions, type ExcelTransactionRow, type Workbook } from './xlsx';
import { extractWorkbookManagement } from './xlsx-management';
import { extractWorkbookPlans } from './xlsx-plans';
import type { BudgetBackup, DataRow, BackupTable } from './data';

export interface WorkbookImportOptions {
  sourceId: string;
  ledgerId: string;
  actorId: string;
  newLedgerName?: string;
  /** Monthly mode creates a new root plus one child for each original numbered sheet. */
  ledgerMode?: 'single' | 'monthly';
  payments?: Record<string, string>;
  corrections?: Record<
    string,
    Partial<Pick<ExcelTransactionRow, 'date' | 'description' | 'major' | 'minor' | 'payment'>>
  >;
  savings?: Record<string, { fromAssetId: string; toAssetId: string }>;
  reserveExpenses?: Record<string, { assetId: string; paymentMethodId: string }>;
}
export interface WorkbookImportResult {
  backup: BudgetBackup;
  ledgerId: string;
  monthlyLedgerIds?: Record<string, string>;
  counts: Record<BackupTable, number>;
  transactions: { income: number; expense: number; count: number };
  monthly: { month: string; count: number; income: number; expense: number }[];
  pending: { source: string; message: string }[];
  duplicates: number;
  assetOperations: DataRow[];
  assetBalances: {
    name: string;
    openingDate: string | null;
    openingBalance: number;
    balance: number;
  }[];
}
const validDate = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(`${v}T00:00:00Z`)) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(bytes), (v) => v.toString(16).padStart(2, '0')).join('');
}

/** Additive candidate. The server independently validates and atomically commits the full candidate at its source revision. */
export async function buildWorkbookImport(
  book: Workbook,
  current: BudgetBackup,
  options: WorkbookImportOptions,
): Promise<WorkbookImportResult> {
  if (!options.sourceId.trim() || options.sourceId.length > 160)
    throw new Error('원본 식별자는 1~160자로 입력해 주세요.');
  if (!current.members.some((m) => m.id === options.actorId))
    throw new Error('현재 사용자를 확인해 주세요.');
  const ledgerMode = options.ledgerMode ?? 'single';
  if (!['single', 'monthly'].includes(ledgerMode))
    throw new Error('가져올 가계부 구성을 확인해 주세요.');
  if (ledgerMode === 'monthly' && !options.newLedgerName)
    throw new Error('월별 가계부를 구성하려면 새 상위 가계부 이름을 입력해 주세요.');
  if (
    !book.sheets.some((s) => /^(?:[1-9]|1[0-2])$/.test(s.name)) ||
    !book.sheets.some((s) => s.name === '설정')
  )
    throw new Error('2026 가계부 원본과 같은 시트 구조의 XLSX가 필요해요.');
  const backup = structuredClone(current),
    tables = backup.tables;
  tables.source_records ??= [];
  const prefix = `xlsx:${(await digest([current.sourceHouseholdId, options.sourceId])).slice(0, 20)}`;
  const id = async (type: string, key: string) =>
    `${prefix}:${type}:${(await digest(key)).slice(0, 24)}`;
  const now = new Date().toISOString();
  const counts = Object.fromEntries(Object.keys(tables).map((key) => [key, 0])) as Record<
    BackupTable,
    number
  >;
  const latestPendingNotes = new Map<string, string>();
  let duplicates = 0;
  const add = (table: BackupTable, row: DataRow) => {
    if (tables[table].some((r) => r.id === row.id)) return false;
    tables[table].push(row);
    counts[table]++;
    return true;
  };
  const source = async (
    key: string,
    location: string,
    kind: string,
    payload: unknown,
    note: string,
    status: 'resolved' | 'pending' | 'reference',
  ) => {
    const sourceId = await id('source', key),
      old = tables.source_records.find((r) => r.id === sourceId);
    if (status === 'pending') latestPendingNotes.set(sourceId, note);
    const serialized = JSON.stringify(payload);
    if (old && old.payload_json !== serialized) {
      const changedId = await id('changed', `${key}:${await digest(payload)}`);
      latestPendingNotes.set(
        changedId,
        '이미 가져온 원본이 변경되었어요. 기존 기록을 유지하며 변경 원문을 검토 목록에 보존해요.',
      );
      add('source_records', {
        id: changedId,
        source_id: options.sourceId,
        source_location: location,
        kind,
        payload_json: serialized,
        note: '원본 변경: 기존 항목과 비교 후 직접 수정해 주세요.',
        status: 'pending',
        version: 1,
      });
      return false;
    }
    if (old?.status === 'resolved' || old?.status === 'reference') {
      duplicates++;
      return false;
    }
    if (old) {
      // Preserve the user's review note; append the decision only when it fits the note limit.
      if (old.status !== status) {
        const combinedNote = old.note ? `${old.note}\n${note}` : note;
        if (combinedNote.length <= 5000) old.note = combinedNote;
        old.status = status;
        old.version = Number(old.version) + 1;
      }
    } else
      add('source_records', {
        id: sourceId,
        source_id: options.sourceId,
        source_location: location,
        kind,
        payload_json: serialized,
        note,
        status,
        version: 1,
      });
    return true;
  };
  const existing = tables.ledgers.find((l) => l.id === options.ledgerId);
  const ledgerId = options.newLedgerName ? await id('ledger', 'workbook') : options.ledgerId;
  const monthlyLedgerIds: Record<string, string> | undefined =
    ledgerMode === 'monthly'
      ? Object.fromEntries(
          await Promise.all(
            Array.from({ length: 12 }, async (_, index) => {
              const month = String(index + 1);
              return [month, await id('ledger', `month:${month}`)] as const;
            }),
          ),
        )
      : undefined;
  const priorGroupId = await id('group', 'major');
  const priorGroup = tables.tag_groups.find((g) => g.id === priorGroupId);
  if (priorGroup?.ledger_ids && !JSON.parse(String(priorGroup.ledger_ids)).includes(ledgerId))
    throw new Error(
      '같은 원본은 처음 가져온 가계부를 선택해 주세요. 원본 행의 중복과 분류 연결을 유지해야 해요.',
    );
  if (priorGroup) {
    const previousScope: string[] = JSON.parse(String(priorGroup.ledger_ids ?? '[]'));
    const hadMonthlyLedgers = previousScope.includes(await id('ledger', 'month:1'));
    if (hadMonthlyLedgers !== (ledgerMode === 'monthly'))
      throw new Error(
        '같은 원본은 처음 선택한 가계부 구성을 유지해 주세요. 기존 거래의 가계부를 자동으로 옮기지 않아요.',
      );
  }
  if (!options.newLedgerName && (!existing || existing.archived))
    throw new Error('사용 중인 가계부를 선택해 주세요.');
  if (tables.ledgers.some((l) => l.id === ledgerId && l.archived))
    throw new Error('처음 가져온 가계부가 보관되어 있어요. 보관을 해제한 뒤 다시 가져와 주세요.');
  const startDay = Number(cellValue(book, '설정', 'G3'));
  if (options.newLedgerName)
    add('ledgers', {
      id: ledgerId,
      name: options.newLedgerName.trim().slice(0, 80) || '엑셀 가계부',
      icon: '📒',
      kind: 'purpose',
      parent_id: null,
      sort_order:
        Math.max(
          -1,
          ...tables.ledgers
            .filter((item) => item.parent_id == null)
            .map((item) => Number(item.sort_order ?? 0)),
        ) + 1,
      budget: 0,
      start_date: null,
      end_date: null,
      archived: 0,
      version: 1,
      period_start_day:
        Number.isInteger(startDay) && startDay >= 1 && startDay <= 31 ? startDay : 1,
      fixed_expense_tag_ids: '[]',
      tag_mappings: '{}',
    });
  if (monthlyLedgerIds)
    for (const [month, childId] of Object.entries(monthlyLedgerIds)) {
      if (tables.ledgers.some((l) => l.id === childId && l.archived))
        throw new Error(
          `${month}월 가계부가 보관되어 있어요. 보관을 해제한 뒤 다시 가져와 주세요.`,
        );
      add('ledgers', {
        id: childId,
        name: `${month}월`,
        icon: '📒',
        kind: 'purpose',
        parent_id: ledgerId,
        sort_order: Number(month) - 1,
        budget: 0,
        start_date: null,
        end_date: null,
        archived: 0,
        version: 1,
        period_start_day:
          Number.isInteger(startDay) && startDay >= 1 && startDay <= 31 ? startDay : 1,
        fixed_expense_tag_ids: '[]',
        tag_mappings: '{}',
      });
    }
  const ledgerScope = [ledgerId, ...Object.values(monthlyLedgerIds ?? {})];
  const group = async (key: string, name: string, appliesTo = 'transaction', role = 'regular') => {
    const value = await id('group', key);
    add('tag_groups', {
      id: value,
      name,
      selection_mode: 'single',
      applies_to: appliesTo,
      role,
      ledger_ids: appliesTo === 'transaction' ? JSON.stringify(ledgerScope) : null,
      sort_order: tables.tag_groups.length,
      archived: 0,
      version: 1,
    });
    return value;
  };
  const groups = {
    major: await group(
      'major',
      '분류',
      'transaction',
      tables.tag_groups.some((g) => g.role === 'category') ? 'regular' : 'category',
    ),
    minor: await group('minor', '내역 분류'),
    tag: await group('tag', '추가 태그'),
    fixed: await group('fixed', '지출 구분'),
    asset: await group('asset', '자산 분류', 'asset'),
  };
  const tag = async (groupId: string, name: string, parent: string | null = null) => {
    const tagId = await id('tag', JSON.stringify([groupId, name, parent]));
    add('tags', {
      id: tagId,
      group_id: groupId,
      name,
      color: '#64866f',
      sort_order: tables.tags.filter((t) => t.group_id === groupId).length,
      archived: 0,
      version: 1,
      parent_id: parent,
    });
    return tagId;
  };
  const fixedTag = await tag(groups.fixed, '고정지출'),
    variableTag = await tag(groups.fixed, '비고정지출');
  if (options.newLedgerName) {
    for (const targetId of ledgerScope) {
      const ledger = tables.ledgers.find((l) => l.id === targetId)!;
      const fixedTags: string[] = JSON.parse(String(ledger.fixed_expense_tag_ids));
      if (!fixedTags.includes(fixedTag))
        ledger.fixed_expense_tag_ids = JSON.stringify([...fixedTags, fixedTag]);
    }
  }
  const tagsFor = async (
    names: { major?: string; minor?: string; tag?: string },
    fixed?: boolean,
  ) => {
    const ids: string[] = [];
    const majorId = names.major ? await tag(groups.major, names.major) : null;
    if (majorId) ids.push(majorId);
    if (names.minor) ids.push(await tag(groups.minor, names.minor, majorId));
    if (names.tag)
      ids.push(
        names.tag === '비고정지출'
          ? variableTag
          : names.tag === '고정지출'
            ? fixedTag
            : await tag(groups.tag, names.tag),
      );
    if (fixed !== undefined) ids.push(fixed ? fixedTag : variableTag);
    return [...new Set(ids)];
  };
  // The visible settings table is authoritative. Hidden S:AH cells only check duplicates.
  for (let row = 6; row <= 29; row++) {
    const major = String(cellValue(book, '설정', `B${row}`) ?? '').trim();
    const parent = major ? await tag(groups.major, major) : null;
    for (let col = 67; col <= 81; col++) {
      const minor = String(
        cellValue(book, '설정', `${String.fromCharCode(col)}${row}`) ?? '',
      ).trim();
      if (minor) await tag(groups.minor, minor, parent);
    }
  }
  // Preserve actual source options even when the corresponding transaction needs review.
  for (const sheet of book.sheets.filter((s) => /^(?:[1-9]|1[0-2])$/.test(s.name)))
    for (const row of [
      ...Array.from({ length: 20 }, (_, index) => index + 7),
      ...Array.from({ length: 300 }, (_, index) => index + 30),
    ]) {
      const names = Object.fromEntries(
        [
          ['major', 'W'],
          ['minor', 'X'],
          ['tag', 'Z'],
        ].map(([key, column]) => [key, String(sheet.cells[`${column}${row}`]?.value ?? '').trim()]),
      );
      if (Object.values(names).some(Boolean)) await tagsFor(names);
      const amount = sheet.cells[`V${row}`]?.value;
      if (amount !== null && amount !== undefined && amount !== '' && amount !== 0) continue;
      const cells = Object.fromEntries(
        ['T', 'U', 'V', 'W', 'X', 'Y', 'Z'].map((column) => [
          `${column}${row}`,
          sheet.cells[`${column}${row}`] ?? { value: null },
        ]),
      );
      if (
        !Object.values(cells).some(
          (cell) =>
            (cell.value !== null && cell.value !== undefined && cell.value !== '') || cell.error,
        )
      )
        continue;
      await source(
        `memo:${sheet.name}!${row}`,
        `${sheet.name}!T${row}:Z${row}`,
        'reference',
        { sheet: sheet.name, row, cells },
        row < 27
          ? '금액이 없는 고정 항목 원문입니다. 실제 거래로 반영하지 않았어요.'
          : '추가 메모 행: 금액이 없거나 0원이라 거래로 반영하지 않았어요. 기록 내용과 반영 여부를 확인해 주세요.',
        row < 27 ? 'reference' : 'pending',
      );
    }
  const management = extractWorkbookManagement(book),
    plans = extractWorkbookPlans(book);
  const reserveSheet = book.sheets.find((sheet) => sheet.name === '예비비');
  const reserveNames = new Set<string>();
  if (reserveSheet)
    for (const [column, firstRow, lastRow] of [
      ['B', 10, 23],
      ['D', 26, 310],
      ['N', 10, 310],
    ] as const)
      for (let row = firstRow; row <= lastRow; row++) {
        const name = String(reserveSheet.cells[`${column}${row}`]?.value ?? '').trim();
        if (name) reserveNames.add(name);
      }
  const reserveTags = new Map<string, string>();
  if (reserveNames.size) {
    const reserveGroup = await group('reserve-category', '예비금 항목', 'asset');
    for (const name of reserveNames) reserveTags.set(name, await tag(reserveGroup, name));
  }
  const paymentNames = new Map<string, string[]>();
  const rememberPayment = (name: string, value: string) =>
    paymentNames.set(name, [...new Set([...(paymentNames.get(name) ?? []), value])]);
  for (const p of management.payments) {
    const pId = await id('payment', p.key);
    const details = { ...p.details, notes: (p.details.notes ?? '').slice(0, 2000) };
    if (
      await source(
        `payment:${p.key}`,
        p.source,
        'management',
        p,
        '결제수단 관리 정보로 가져옴. 명의·연결 계좌는 설정에서 확인해 주세요.',
        'resolved',
      )
    )
      add('payment_methods', {
        id: pId,
        name: p.name,
        type: p.type,
        owner_id: 'shared',
        closing_day: p.closingDay,
        payment_day: p.paymentDay,
        details_json: JSON.stringify(details),
        archived: 0,
        version: 1,
      });
    rememberPayment(p.name, pId);
  }
  const paymentFor = async (name: string) => {
    const mapped = options.payments?.[name];
    if (mapped?.startsWith('@source:')) return id('payment', mapped.slice(8));
    if (mapped && !mapped.startsWith('@new:')) {
      if (!tables.payment_methods.some((p) => p.id === mapped && !p.archived))
        throw new Error(`결제수단 “${name}”의 연결을 확인해 주세요.`);
      return mapped;
    }
    const matches = paymentNames.get(name) ?? [];
    if (!mapped && matches.length === 1) return matches[0];
    const type = mapped?.slice(5);
    if (!mapped?.startsWith('@new:') || !['card', 'account', 'cash'].includes(type ?? ''))
      return '';
    // A name alone never establishes the instrument type; new types are chosen in the preview.
    const pId = await id('payment-name', name || '(미기록)');
    add('payment_methods', {
      id: pId,
      name: name || '원본 결제수단 미기록',
      type: type!,
      owner_id: 'shared',
      closing_day: null,
      payment_day: null,
      details_json: JSON.stringify({
        notes: '엑셀 거래에 사용된 이름. 이관 미리보기에서 종류를 지정했습니다.',
      }),
      archived: 0,
      version: 1,
    });
    if (!matches.length) rememberPayment(name, pId);
    return pId;
  };
  for (let col = 67; col <= 76; col++) {
    const name = String(cellValue(book, '설정', `${String.fromCharCode(col)}2`) ?? '').trim();
    if (name) await paymentFor(name);
  }
  for (const a of management.assets) {
    const aId = await id('asset', a.key);
    if (
      !(await source(
        `asset:${a.key}`,
        a.source,
        'management',
        a,
        a.observations.length
          ? '월말 관측 잔액과 이후 잔액 조정으로 가져옴. 관측 이전 잔액은 불명입니다.'
          : '관리 정보만 가져옴. 실제 잔액과 기준일을 자산 설정에서 확인해 주세요.',
        'resolved',
      ))
    )
      continue;
    const observations = [...a.observations].sort((x, y) => x.date.localeCompare(y.date));
    const first = observations[0];
    const assetTags = await Promise.all(
      a.classifications.filter(Boolean).map((name) => tag(groups.asset, name)),
    );
    // Only the original reserve summary establishes an asset; unmatched row labels stay options.
    const reserveTag = a.key.startsWith('예비비!category:') && reserveTags.get(a.name);
    if (reserveTag) assetTags.push(reserveTag);
    // Hierarchical source labels form one path. A multiple group preserves all levels independently.
    tables.tag_groups.find((g) => g.id === groups.asset)!.selection_mode = 'multiple';
    add('assets', {
      id: aId,
      name: a.name,
      kind: a.kind,
      opening_balance: first?.amount ?? 0,
      color: '#64866f',
      tag_ids: JSON.stringify(assetTags),
      track_savings: 0,
      version: 1,
      opening_date: first?.date ?? null,
      archived: 0,
      metadata_json: JSON.stringify({
        ...a.details,
        openingKind: 'observation',
        importedObservationThrough: observations.at(-1)?.date ?? null,
        notes: (a.notes ?? a.details.notes ?? '').slice(0, 2000),
      }),
    });
    let balance = first?.amount ?? 0;
    for (const observation of observations.slice(1)) {
      const operationId = await id('snapshot', `${a.key}:${observation.date}`);
      const description = `엑셀 월말 관측 · ${observation.source}`;
      add('asset_operations', {
        id: operationId,
        type: 'adjustment',
        date: observation.date,
        description,
        from_asset_id: null,
        to_asset_id: null,
        asset_id: aId,
        amount: observation.amount - balance,
        target_balance: observation.amount,
        version: 1,
        created_by: options.actorId,
        created_at: now,
        deleted_at: null,
        legacy_transaction_id: null,
      });
      add('asset_effects', {
        id: await id('effect', operationId),
        transaction_id: null,
        operation_id: operationId,
        asset_id: aId,
        amount: observation.amount - balance,
        savings_amount: 0,
        savings_tracking: 0,
        date: observation.date,
        description,
        actor_id: options.actorId,
      });
      balance = observation.amount;
    }
  }
  const transactions = { income: 0, expense: 0, count: 0 },
    monthly = new Map<string, WorkbookImportResult['monthly'][number]>();
  const addTransaction = async (
    key: string,
    location: string,
    raw: unknown,
    row: ExcelTransactionRow,
    allocation?: { assetId: string; paymentMethodId: string },
    targetLedgerId = ledgerId,
  ) => {
    const errors: string[] = [];
    if (!validDate(row.date)) errors.push('거래일을 확인해 주세요.');
    if (!row.description || row.description.length > 240)
      errors.push('내역은 1~240자로 입력해 주세요.');
    if (!Number.isSafeInteger(row.amount) || row.amount <= 0 || row.amount > 1_000_000_000_000)
      errors.push('양의 정수 원 단위 금액을 확인해 주세요.');
    if (!row.major) errors.push('대분류가 없어 수입·지출·저축 구분을 확인해야 해요.');
    if (errors.length) {
      await source(key, location, 'transaction', raw, errors.join(' '), 'pending');
      return;
    }
    const coveredByObservation = (asset: DataRow) => {
      const through = JSON.parse(String(asset.metadata_json)).importedObservationThrough;
      return typeof through === 'string' && validDate(through) && row.date <= through;
    };
    if (row.kind === 'saving') {
      const mapping = options.savings?.[row.minor];
      const from = tables.assets.find((a) => a.id === mapping?.fromAssetId),
        to = tables.assets.find((a) => a.id === mapping?.toAssetId);
      if (
        !from ||
        !to ||
        from.id === to.id ||
        from.archived ||
        to.archived ||
        from.kind !== 'asset' ||
        to.kind !== 'asset' ||
        !from.opening_date ||
        !to.opening_date ||
        row.date < String(from.opening_date) ||
        row.date < String(to.opening_date)
      ) {
        await source(
          key,
          location,
          'transaction',
          raw,
          '저축 원본: 출금·입금 자산과 해당 날짜의 기준 잔액을 확인해야 자산 이동으로 반영할 수 있어요.',
          'pending',
        );
        return;
      }
      if (coveredByObservation(from) || coveredByObservation(to)) {
        await source(
          key,
          location,
          'transaction',
          raw,
          '이미 가져온 월말 관측 잔액에 포함될 수 있는 과거 변동입니다. 중복 반영을 막기 위해 검토함에 보존해요. 실제 기초 잔액과 기존 반영 범위를 확인해 주세요.',
          'pending',
        );
        return;
      }
      if (
        !(await source(
          key,
          location,
          'transaction',
          raw,
          `자산 이동으로 가져옴: ${from.name} → ${to.name}`,
          'resolved',
        ))
      )
        return;
      const opId = await id('saving', key),
        sameTracking = from.track_savings === to.track_savings;
      add('asset_operations', {
        id: opId,
        type: 'transfer',
        date: row.date,
        description: row.description,
        from_asset_id: from.id,
        to_asset_id: to.id,
        asset_id: null,
        amount: row.amount,
        target_balance: null,
        version: 1,
        created_by: options.actorId,
        created_at: now,
        deleted_at: null,
        legacy_transaction_id: null,
      });
      for (const [asset, amount] of [
        [from, -row.amount],
        [to, row.amount],
      ] as const)
        add('asset_effects', {
          id: await id('effect', `${opId}:${asset.id}`),
          transaction_id: null,
          operation_id: opId,
          asset_id: asset.id,
          amount,
          savings_amount: !sameTracking && asset.track_savings ? amount : 0,
          savings_tracking: asset.track_savings,
          date: row.date,
          description: row.description,
          actor_id: options.actorId,
        });
      return;
    }
    const paymentId = allocation?.paymentMethodId || (await paymentFor(row.payment)) || null;
    const allocations = allocation ? [{ assetId: allocation.assetId, amount: row.amount }] : [];
    if (allocation) {
      const asset = tables.assets.find((a) => a.id === allocation.assetId);
      if (
        !asset ||
        asset.archived ||
        asset.kind !== 'asset' ||
        !asset.opening_date ||
        row.date < String(asset.opening_date) ||
        !tables.payment_methods.some((p) => p.id === paymentId && !p.archived)
      ) {
        await source(
          key,
          location,
          'transaction',
          raw,
          '지출 자산의 기준일과 결제수단을 확인해 주세요.',
          'pending',
        );
        return;
      }
      if (coveredByObservation(asset)) {
        await source(
          key,
          location,
          'transaction',
          raw,
          '이미 가져온 월말 관측 잔액 이전 지출입니다. 원장과 자산에 이미 반영된 범위를 먼저 확인해 주세요.',
          'pending',
        );
        return;
      }
    }
    const tagIds = await tagsFor(row, row.fixed);
    if (
      !(await source(
        key,
        location,
        'transaction',
        raw,
        [
          `거래로 가져옴${options.corrections?.[row.rowId] ? ' (미리보기에서 보완한 값 사용)' : ''}`,
          !paymentId ? `결제수단 미지정(나중에 연결). 원본 표기: ${row.payment || '미기록'}` : '',
          !row.minor ? '소분류 미지정. 원문에 없는 태그는 만들지 않았어요.' : '',
        ]
          .filter(Boolean)
          .join(' '),
        'resolved',
      ))
    )
      return;
    const txId = await id('transaction', key);
    add('transactions', {
      id: txId,
      ledger_id: targetLedgerId,
      date: row.date,
      description: row.description,
      amount: row.amount,
      type: row.kind,
      category: row.major,
      owner_id: 'shared',
      payment_method_id: paymentId,
      tag_ids: JSON.stringify(tagIds),
      asset_id: null,
      to_asset_id: null,
      version: 1,
      updated_at: now,
      updated_by: options.actorId,
      created_by: null,
      created_at: null,
      deleted_at: null,
      allocations_json: JSON.stringify(allocations),
    });
    if (!row.minor)
      await source(
        `review:classification:${key}`,
        location,
        'reference',
        { transactionId: txId, major: row.major, minor: row.minor },
        '거래는 반영했으며 소분류는 비워 두었어요. 필요한 경우 원본 거래에서 태그를 지정해 주세요.',
        'pending',
      );
    if (allocation) {
      const asset = tables.assets.find((a) => a.id === allocation.assetId)!;
      add('asset_effects', {
        id: await id('effect', txId),
        transaction_id: txId,
        operation_id: null,
        asset_id: allocation.assetId,
        amount: -row.amount,
        savings_amount: asset.track_savings ? -row.amount : 0,
        savings_tracking: asset.track_savings,
        date: row.date,
        description: row.description,
        actor_id: options.actorId,
      });
    }
    transactions[row.kind] += row.amount;
    transactions.count++;
    const month = row.date.slice(0, 7),
      totals = monthly.get(month) ?? { month, count: 0, income: 0, expense: 0 };
    totals.count++;
    totals[row.kind] += row.amount;
    monthly.set(month, totals);
  };
  for (const raw of originalTransactions(book)) {
    const row = { ...raw, ...options.corrections?.[raw.rowId] };
    for (const key of ['date', 'major', 'minor', 'description', 'payment'] as const)
      row[key] = row[key].trim();
    row.kind = row.major === '수입' ? 'income' : row.major === '저축' ? 'saving' : 'expense';
    const sourceSheet = book.sheets.find((s) => s.name === raw.sheet)!;
    const evidence = {
      ...raw,
      cells: Object.fromEntries(
        ['T', 'U', 'V', 'W', 'X', 'Y', 'Z'].map((column) => [
          `${column}${raw.row}`,
          sourceSheet.cells[`${column}${raw.row}`] ?? { value: null },
        ]),
      ),
    };
    await addTransaction(
      `transaction:${raw.rowId}`,
      `${raw.sheet}!T${raw.row}:Z${raw.row}`,
      evidence,
      row,
      undefined,
      monthlyLedgerIds?.[raw.sheet] ?? ledgerId,
    );
  }
  for (const row of management.reserveRows) {
    const mapping = options.reserveExpenses?.[row.key];
    if (row.kind !== 'expense' || !mapping) {
      await source(
        `reserve:${row.key}`,
        row.source,
        'transaction',
        row,
        row.kind === 'deposit'
          ? '예비금 유입: 수입·자산 이동 중 어떤 기록인지 확인해 주세요. 기존 월별 원장과 중복 반영하지 않습니다.'
          : '예비금 지출: 기존 월별 원장과 같은 지출인지 확인한 뒤 별도 거래로 반영하거나 기존 거래에 자산 배분을 지정해 주세요.',
        'pending',
      );
      continue;
    }
    await addTransaction(
      `reserve:${row.key}`,
      row.source,
      row,
      {
        rowId: row.key,
        sheet: '예비비',
        row: 0,
        date: row.date ?? '',
        description: row.description,
        amount: row.amount,
        kind: 'expense',
        major: '예비금 사용',
        minor: row.category,
        payment: row.paymentName ?? '',
        tag: row.tag ?? '',
        fixed: false,
        errors: [],
      },
      mapping,
    );
  }
  for (const entry of plans.plans) {
    if (
      !(await source(
        `plan:${entry.key}`,
        entry.source,
        'plan',
        entry,
        '계획으로 가져옴. 실제 거래나 자산 잔액은 변경하지 않아요.',
        'resolved',
      ))
    )
      continue;
    const planId = await id('plan', entry.key),
      planLedgerId = monthlyLedgerIds?.[entry.source.split('!')[0]] ?? ledgerId,
      plan = {
        ...entry.plan,
        ledgerId: planLedgerId,
        includeLinked: true,
        tagIds: await tagsFor(entry.tagNames ?? {}),
      };
    add('planning_records', {
      id: planId,
      ledger_id: planLedgerId,
      kind: plan.kind,
      payload_json: JSON.stringify(plan),
      archived: 0,
      version: 1,
      created_at: now,
    });
  }
  for (const [i, issue] of [...management.issues, ...plans.issues].entries())
    await source(
      `issue:${issue.source}:${await digest(issue.message)}`,
      issue.source,
      'reference',
      issue,
      issue.message,
      'pending',
    );
  for (const entry of management.notes)
    await source(
      `note:${entry.source}`,
      entry.source,
      'reference',
      entry,
      '원본 공통 메모',
      'reference',
    );
  const reserveNote = book.sheets.find((s) => s.name === '예비비')?.cells.A22;
  if (reserveNote && reserveNote.value !== null && reserveNote.value !== '')
    await source(
      'note:예비비!A22',
      '예비비!A22',
      'reference',
      reserveNote,
      '원본 예비금 공통 메모. 수입·지출이나 자산 변동으로 반영하지 않았어요.',
      'reference',
    );
  const settings = book.sheets.find((s) => s.name === '설정');
  if (settings)
    await source(
      'settings',
      '설정',
      'reference',
      settings.cells,
      options.newLedgerName
        ? '원본 시작일을 새 가계부에 반영했어요. 원본 설정과 미사용 옵션을 보존합니다.'
        : `원본 월 시작일 ${startDay}일. 기존 가계부의 기간 설정은 가계부 설정에서 확인해 주세요.`,
      'reference',
    );
  return {
    backup,
    ledgerId,
    ...(monthlyLedgerIds ? { monthlyLedgerIds } : {}),
    counts,
    transactions,
    monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
    pending: tables.source_records
      .filter((row) => row.source_id === options.sourceId && row.status === 'pending')
      .map((row) => {
        const saved = String(row.note),
          latest = latestPendingNotes.get(String(row.id));
        return {
          source: String(row.source_location),
          message:
            latest && !saved.includes(latest) ? [saved, latest].filter(Boolean).join('\n') : saved,
        };
      }),
    duplicates,
    assetOperations: tables.asset_operations.filter(
      (op) => !current.tables.asset_operations.some((old) => old.id === op.id),
    ),
    assetBalances: tables.assets
      .filter((a) => !current.tables.assets.some((old) => old.id === a.id))
      .map((a) => ({
        name: String(a.name),
        openingDate: a.opening_date as string | null,
        openingBalance: Number(a.opening_balance),
        balance:
          Number(a.opening_balance) +
          tables.asset_effects
            .filter((e) => e.asset_id === a.id)
            .reduce((sum, e) => sum + Number(e.amount), 0),
      })),
  };
}
