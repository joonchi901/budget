import { ALL_LEDGERS_ID, ledgerDescendantIds, ledgerPath } from '../shared/hierarchy';
import { Button, Field, SummaryGrid, Input, Panel, SegmentedControl, TableScroll } from './ui';
import { UgaIllustration, UgaLedgerIcon } from './brand/Uga';
import { SelectField, SelectOption } from './SelectField';
import { useEffect, useState } from 'react';
import { ArrowUpRight, ChevronRight, Search, Sparkles, X } from 'lucide-react';
import type { Bootstrap, Ledger, Transaction, TransactionType, Presence } from '../shared/types';
import { categoryNames, tagGroupBreakdown, totals } from '../shared/selectors';
import { Empty, Stat, fieldName, labels, ownerName, won } from './components';
import { TagBadge } from './TagBadge';
import { budgetSummary } from '../shared/planning';
import { transactionForLedger } from '../shared/classification';
import { UGA_CHART_COLORS } from './brand/Uga';
const colors = UGA_CHART_COLORS;
const monthLabel = (month: string) => `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`;

export default function LedgerView({
  data,
  ledger,
  entries,
  month,
  peers,
  onEdit,
  onNavigate,
  period,
  includeDescendants,
}: {
  data: Bootstrap;
  ledger: Ledger;
  entries: Transaction[];
  month: string;
  peers: Presence[];
  onEdit(tx: Transaction): void;
  onNavigate(id: string): void;
  period: 'month' | 'year' | 'period';
  includeDescendants: boolean;
}) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [summaryGroupId, setSummaryGroupId] = useState('');
  const [sourceScope, setSourceScope] = useState('all');
  const [sort, setSort] = useState('date-desc');
  const sourceLedgers = data.ledgers.filter(
    (item) =>
      item.id !== ledger.id &&
      (ledger.id === ALL_LEDGERS_ID || ledgerDescendantIds(data.ledgers, ledger.id).has(item.id)),
  );
  const canFilterSource =
    (ledger.id === ALL_LEDGERS_ID || includeDescendants) && sourceLedgers.length > 0;
  // A hidden source filter must not keep excluding records after a scope change or hierarchy move.
  const activeSource =
    canFilterSource &&
    (sourceScope === ledger.id || sourceLedgers.some((item) => item.id === sourceScope))
      ? sourceScope
      : 'all';
  useEffect(() => {
    if (sourceScope !== activeSource) setSourceScope(activeSource);
  }, [sourceScope, activeSource]);
  const query = search.trim().toLocaleLowerCase();
  const hasFilters = !!query || type !== 'all' || activeSource !== 'all';
  const resetFilters = () => {
    setSearch('');
    setType('all');
    setSourceScope('all');
  };
  const sum = totals(entries);
  const budgetState = budgetSummary(data, ledger.id, month, { includeDescendants, period });
  const budgetExpense = budgetState.expense;
  const budget = budgetState.amount;
  const remaining = budget - budgetExpense;
  const percent = budget > 0 ? Math.round((budgetExpense / budget) * 100) : 0;
  const summaryGroups = data.tagGroups.filter(
    (g) =>
      g.appliesTo === 'transaction' &&
      (!g.archived ||
        entries.some((t) =>
          t.tagIds.some((id) => data.tags.some((tag) => tag.id === id && tag.groupId === g.id)),
        )),
  );
  const usedGroups = summaryGroups.filter((g) =>
    entries.some((t) =>
      t.tagIds.some((id) => data.tags.some((tag) => tag.id === id && tag.groupId === g.id)),
    ),
  );
  const categoryGroup =
    summaryGroups.find((g) => g.id === summaryGroupId) ??
    usedGroups.find((g) => g.role === 'category') ??
    usedGroups[0] ??
    summaryGroups[0];
  const groups = categoryGroup
    ? tagGroupBreakdown(
        data,
        entries.map((tx) => transactionForLedger(data.ledgers, ledger.id, tx)),
        categoryGroup.id,
      )
        .filter((row) => row.count > 0)
        .sort((a, b) => b.amount - a.amount)
    : [];
  const filtered = entries
    .filter(
      (tx) =>
        (activeSource === 'all' || tx.ledgerId === activeSource) &&
        (type === 'all' || tx.type === type) &&
        `${tx.description} ${categoryNames(data, tx).join(' ')} ${tx.tagIds.map((id) => data.tags.find((t) => t.id === id)?.name).join(' ')}`
          .toLocaleLowerCase()
          .includes(query),
    )
    .sort((a, b) => {
      const order =
        sort === 'amount-desc'
          ? b.amount - a.amount
          : sort === 'amount-asc'
            ? a.amount - b.amount
            : sort === 'date-asc'
              ? a.date.localeCompare(b.date)
              : b.date.localeCompare(a.date);
      return order || b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt);
    });
  const filteredSum = totals(filtered);
  return (
    <>
      <p className="ledger-period small muted">
        집계 기간 {budgetState.periodStart ?? '전체'} ~ {budgetState.periodEnd ?? '전체'} ·{' '}
        {ledger.id === ALL_LEDGERS_ID
          ? '모든 원본 가계부'
          : includeDescendants
            ? '모든 하위 가계부 포함'
            : '현재 가계부만'}
      </p>
      <SummaryGrid columns={4} gap={0} aria-label="조회 기간 요약">
        <Stat
          label={period === 'month' ? '이번 달 지출' : '조회 기간 지출'}
          amount={sum.expense}
          hint={
            ledger.id === ALL_LEDGERS_ID
              ? '모든 원본 기록을 한 번씩 집계'
              : includeDescendants
                ? '모든 하위 가계부 포함'
                : '현재 가계부만'
          }
          accent
        />
        <Stat
          label={period === 'month' ? '이번 달 수입' : '조회 기간 수입'}
          amount={sum.income}
          hint={
            period === 'month'
              ? `${monthLabel(month)} 기록 기준`
              : period === 'year'
                ? `${month.slice(0, 4)}년 기록 기준`
                : '선택한 가계부 기간 기준'
          }
        />
        <Stat
          label="수입 − 지출"
          amount={sum.income - sum.expense}
          hint="자산 이동·잔액 조정은 포함하지 않아요"
        />
        {ledger.id === ALL_LEDGERS_ID ? (
          <div className="stat">
            <span className="stat-label">원본 가계부</span>
            <strong>{new Set(entries.map((entry) => entry.ledgerId)).size}개</strong>
            <p>예산은 각 가계부에서 독립적으로 관리해요.</p>
          </div>
        ) : !budgetState.hasBudget ? (
          <div className="stat">
            <span className="stat-label">조회 기간 예산</span>
            <strong>미설정</strong>
            <p>계획에서 이 기간의 예산을 설정해 주세요.</p>
          </div>
        ) : (
          <Stat
            label="남은 예산"
            amount={remaining}
            hint={`예산 ${won(budget)}원 · ${budgetState.periodStart === '0001-01-01' && budgetState.periodEnd === '9999-12-31' ? '전체 기간' : `${budgetState.periodStart ?? '전체'} ~ ${budgetState.periodEnd ?? '전체'}`}`}
          />
        )}
      </SummaryGrid>
      <div className="ledger-body-grid">
        <Panel className="transactions-panel">
          <div className="transactions-heading">
            <div>
              <h2>
                거래 내역 <span className="count">{filtered.length}</span>
              </h2>
              <p>
                {includeDescendants
                  ? '하위 기록은 원본 가계부에서 수정해요.'
                  : '이 가계부에서 작성한 내역이에요.'}
              </p>
            </div>
            <Field className="search">
              <Search size={16} />
              <Input
                aria-label="내역 검색"
                type="search"
                placeholder="내용, 분류, 태그 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <Button
                  variant="plain"
                  type="button"
                  className="search-clear"
                  aria-label="검색어 지우기"
                  onClick={() => setSearch('')}
                >
                  <X size={16} />
                </Button>
              )}
            </Field>
          </div>
          {canFilterSource && (
            <Field className="ledger-scope-select small muted">
              거래 목록의 가계부 범위
              <SelectField
                aria-label="거래 목록의 가계부 범위"
                value={activeSource}
                onValueChange={(value) => setSourceScope(value)}
              >
                <SelectOption value="all">조회 대상 전체</SelectOption>
                {ledger.id !== ALL_LEDGERS_ID && (
                  <SelectOption value={ledger.id}>이 가계부에 직접 기록한 내역</SelectOption>
                )}
                {sourceLedgers.map((l) => (
                  <SelectOption key={l.id} value={l.id}>
                    {ledgerPath(data.ledgers, l.id)}
                  </SelectOption>
                ))}
              </SelectField>
            </Field>
          )}
          <div className="transaction-list-tools">
            <SegmentedControl
              appearance="plain"
              className="transaction-tabs"
              aria-label="내역 종류 필터"
              value={type}
              onValueChange={setType}
              options={['all', ...Object.keys(labels)].map((value) => ({
                value,
                label: value === 'all' ? '전체' : labels[value as TransactionType],
              }))}
            />
            <SelectField
              aria-label="내역 정렬"
              value={sort}
              onValueChange={setSort}
              className="transaction-sort"
            >
              <SelectOption value="date-desc">최신순</SelectOption>
              <SelectOption value="date-asc">오래된순</SelectOption>
              <SelectOption value="amount-desc">금액 높은순</SelectOption>
              <SelectOption value="amount-asc">금액 낮은순</SelectOption>
            </SelectField>
          </div>
          {hasFilters && (
            <div className="transaction-filter-summary">
              <p role="status" aria-label="목록 조회 결과">
                전체 {entries.length}건 중 <strong>{filtered.length}건</strong>
                {query && <span>검색 “{search.trim()}”</span>}
                {type !== 'all' && <span>{labels[type as TransactionType]}</span>}
                {activeSource !== 'all' && (
                  <span>{data.ledgers.find((item) => item.id === activeSource)?.name}</span>
                )}
              </p>
              <Button variant="text" type="button" onClick={resetFilters}>
                조회 조건 초기화
              </Button>
            </div>
          )}
          <TableScroll aria-label="거래 내역 목록">
            <table className="transactions">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>내용</th>
                  <th>분류 · 태그</th>
                  <th>결제수단</th>
                  <th>귀속</th>
                  <th className="money-cell">금액</th>
                  <th>
                    <span className="sr-only">관리</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx) => {
                  const source = data.ledgers.find((l) => l.id === tx.ledgerId);
                  const indirect = tx.ledgerId !== ledger.id;
                  const editing = peers.find((p) => p.transactionId === tx.id);
                  return (
                    <tr
                      key={tx.id}
                      data-testid={`transaction-${tx.id}`}
                      className={editing ? 'peer-editing' : ''}
                    >
                      <td className="date-cell">
                        {Number(tx.date.slice(5, 7))}.{tx.date.slice(8)}
                      </td>
                      <td className="description-cell">
                        <strong className="transaction-name">{tx.description}</strong>
                        <div className="transaction-sub">
                          {indirect && (
                            <span className="source-label">
                              <UgaLedgerIcon value={source?.icon} size={16} /> {source?.name}
                            </span>
                          )}
                          {editing && (
                            <span className="peer-label">
                              {editing.name} · {fieldName(editing.field)} 편집 중
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="tags-cell">
                        <div className="row-tags transaction-tag-badges">
                          {categoryNames(data, tx).length === 0 && (
                            <span className="category-name">미분류</span>
                          )}
                          {tx.tagIds.map((id) => {
                            const tag = data.tags.find((t) => t.id === id);
                            return (
                              tag && (
                                <TagBadge
                                  key={id}
                                  name={tag.name}
                                  color={tag.color}
                                  title={data.tagGroups.find((g) => g.id === tag.groupId)?.name}
                                />
                              )
                            );
                          })}
                        </div>
                      </td>
                      <td className="payment-cell">
                        {tx.paymentMethodId === null
                          ? '미지정'
                          : (data.paymentMethods.find((p) => p.id === tx.paymentMethodId)?.name ??
                            '알 수 없는 결제수단')}
                      </td>
                      <td className="owner-cell">
                        <span className={`owner-badge ${tx.ownerId}`}>{ownerName(tx.ownerId)}</span>
                      </td>
                      <td className={`money-cell ${tx.type}`}>
                        <strong>
                          {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}
                          {won(tx.amount)}
                        </strong>
                        <small>{labels[tx.type]}</small>
                      </td>
                      <td className="action-cell">
                        {indirect ? (
                          <Button
                            variant="plain"
                            className="row-action"
                            aria-label={`${tx.description} 원본 가계부 열기`}
                            onClick={() => onNavigate(tx.ledgerId)}
                          >
                            원본
                            <ArrowUpRight size={14} />
                          </Button>
                        ) : (
                          <Button
                            variant="plain"
                            className="row-action"
                            aria-label={`${tx.description} 수정`}
                            onClick={() => onEdit(tx)}
                          >
                            수정
                            <ChevronRight size={14} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
          {!filtered.length && (
            <Empty illustration={entries.length ? 'search' : 'empty'}>
              {entries.length
                ? '조건에 맞는 내역이 없어요. 검색어나 필터를 바꿔보세요.'
                : '아직 내역이 없어요. 첫 기록을 남겨보세요.'}
            </Empty>
          )}
          <div className="table-summary">
            <span>현재 목록 기준</span>
            <span>
              수입 <b>{won(filteredSum.income)}원</b>
              <i />
              지출 <b>{won(filteredSum.expense)}원</b>
            </span>
          </div>
        </Panel>
        <div className="overview-grid">
          <aside className="brand-welcome" aria-label="우가의 한마디">
            <UgaIllustration name="card-header" size={132} />
            <div>
              <strong>오늘도 우가우가!</strong>
              <p>작은 기록이 큰 변화를 만들어요.</p>
            </div>
          </aside>
          {ledger.id !== ALL_LEDGERS_ID && (
            <Panel className="budget-panel">
              <div className="panel-title">
                <h2>예산 현황</h2>
                <span className="pill">
                  {period === 'month'
                    ? `${Number(month.slice(5))}월`
                    : period === 'year'
                      ? `${month.slice(0, 4)}년`
                      : '설정 기간'}
                </span>
              </div>
              <div className="budget-summary">
                <div>
                  <span className="muted small">예산 대비 지출</span>
                  <strong>
                    {budget ? percent : '—'}
                    <small>{budget ? '%' : ''}</small>
                  </strong>
                </div>
                <span className={`budget-message ${remaining < 0 ? 'over' : ''}`}>
                  {!budgetState.hasBudget
                    ? '예산이 설정되지 않았어요'
                    : remaining < 0
                      ? `${won(-remaining)}원 초과했어요`
                      : `${won(remaining)}원 더 사용할 수 있어요`}
                </span>
              </div>
              <div className="progress-track">
                <div style={{ width: `${Math.min(percent, 100)}%` }} />
              </div>
              <div className="progress-labels">
                <span>사용 {won(budgetExpense)}원</span>
                <span>예산 {won(budget)}원</span>
              </div>
              {includeDescendants ? (
                <div className="linked-ledgers">
                  {data.ledgers
                    .filter(
                      (l) =>
                        l.id !== ledger.id &&
                        (ledger.id === ALL_LEDGERS_ID ||
                          ledgerDescendantIds(data.ledgers, ledger.id).has(l.id)),
                    )
                    .map((l) => (
                      <Button variant="plain" key={l.id} onClick={() => onNavigate(l.id)}>
                        <UgaLedgerIcon value={l.icon} size={24} />
                        <span>{l.name}</span>
                        <span className="muted">연결됨</span>
                        <ChevronRight size={15} />
                      </Button>
                    ))}
                  {!data.ledgers.some((l) => l.parentId === ledger.id) && (
                    <p className="small muted">하위 가계부를 추가하면 이곳에 함께 보여요.</p>
                  )}
                </div>
              ) : (
                <div className="budget-note">
                  <Sparkles size={16} />
                  <span>이 예산은 가계부의 소비 기준이에요. 자산과 독립적으로 관리돼요.</span>
                </div>
              )}
            </Panel>
          )}
          <Panel className="categories-panel">
            <div className="panel-title">
              <h2>많이 쓴 곳</h2>
              <span className="muted small">조회 기간 지출</span>
            </div>
            <Field className="ledger-category-select small muted">
              요약할 태그 유형
              <SelectField
                aria-label="요약할 태그 유형"
                value={categoryGroup?.id ?? ''}
                onValueChange={(value) => setSummaryGroupId(value)}
              >
                {summaryGroups.map((g) => (
                  <SelectOption key={g.id} value={g.id}>
                    {g.name}
                  </SelectOption>
                ))}
              </SelectField>
            </Field>
            <CategoryBars groups={groups} total={sum.expense} />
            {categoryGroup?.selectionMode === 'multiple' && (
              <p className="small muted">한 내역에 여러 옵션이 있으면 각 옵션에 포함돼요.</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

function CategoryBars({
  groups,
  total,
}: {
  groups: ReturnType<typeof tagGroupBreakdown>;
  total: number;
}) {
  return groups.length ? (
    <div className="category-bars">
      {groups.slice(0, 5).map(({ tagId, name, color, amount }, index) => (
        <div className="category-bar" key={`${index}-${name}`}>
          <div>
            <span>
              <i style={{ background: colors[index % colors.length] }} />
              {tagId ? <TagBadge name={name} color={color} /> : name}
            </span>
            <strong>
              {won(amount)}
              <small>원</small>
            </strong>
          </div>
          <div className="mini-track">
            <span
              style={{
                width: `${total ? (amount / total) * 100 : 0}%`,
                background: colors[index % colors.length],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  ) : (
    <Empty>지출을 기록하면 흐름이 보여요.</Empty>
  );
}
