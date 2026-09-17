import { ALL_LEDGERS_ID, ledgerDescendantIds, ledgerPath } from '../shared/hierarchy';
import { Tooltip } from './Tooltip';
import { SelectField, SelectOption } from './SelectField';
import { DateField } from './DateFields';
import { useId, useState } from 'react';
import { ArrowRight, Check, ChevronDown, Download, SlidersHorizontal, X } from 'lucide-react';
import type { Bootstrap, Transaction } from '../shared/types';
import { accountingPeriod } from '../shared/planning';
import {
  analysisTransactions,
  analysisOptionRows,
  analysisTagName,
  annualTagMatrix,
  annualSeries,
  dailySeries,
  groupedAnalysis,
  householdSavings,
  ledgerAnalysis,
  paymentAnalysis,
  transactionsCsv,
} from '../shared/analytics';
import { totals } from '../shared/selectors';
import { Dialog, Empty, Stat, ownerName, won } from './components';
import { TagBadge } from './TagBadge';
import './management.css';
import './analytics-ux.css';

const UNASSIGNED_PAYMENT = '__unassigned_payment__';

export function downloadFile(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function AnalyticsView({
  data,
  ledgerId,
  setLedgerId,
  month,
  onEdit,
  lockedLedger = false,
}: {
  data: Bootstrap;
  ledgerId: string;
  setLedgerId(id: string): void;
  month: string;
  onEdit?(tx: Transaction): void;
  lockedLedger?: boolean;
}) {
  const flowCaptionId = useId();
  const [section, setSection] = useState<'flow' | 'category' | 'sources' | 'transactions'>('flow');
  const [mode, setMode] = useState('month');
  const [includeDescendants, setIncludeDescendants] = useState(true);
  const [start, setStart] = useState(`${month.slice(0, 4)}-01-01`);
  const [end, setEnd] = useState(`${month.slice(0, 4)}-12-31`);
  const [owner, setOwner] = useState('');
  const [payment, setPayment] = useState('');
  const [asset, setAsset] = useState('');
  const [type, setType] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [group, setGroup] = useState('');
  const [annualMetric, setAnnualMetric] = useState<'income' | 'expense'>('expense');
  const [sourceLedgerId, setSourceLedgerId] = useState('');
  const [detail, setDetail] = useState<{ title: string; rows: Transaction[] } | null>(null);
  const ledger = data.ledgers.find((l) => l.id === ledgerId);
  const descendants = ledgerDescendantIds(data.ledgers, ledgerId);
  const sourceLedgers = data.ledgers.filter(
    (source) => ledgerId === ALL_LEDGERS_ID || descendants.has(source.id),
  );
  const scopeDates = data.transactions
    .filter((tx) => ledgerId === ALL_LEDGERS_ID || descendants.has(tx.ledgerId))
    .map((tx) => tx.date)
    .sort();
  const sourceId = sourceLedgers.some((source) => source.id === sourceLedgerId)
    ? sourceLedgerId
    : '';
  const year = Number(month.slice(0, 4));
  const period =
    mode === 'month'
      ? accountingPeriod(month, ledger?.periodStartDay ?? 1)
      : mode === 'year'
        ? {
            startDate: accountingPeriod(`${year}-01`, ledger?.periodStartDay ?? 1).startDate,
            endDate: accountingPeriod(`${year}-12`, ledger?.periodStartDay ?? 1).endDate,
          }
        : mode === 'period'
          ? {
              startDate: ledger?.startDate ?? scopeDates[0] ?? `${year}-01-01`,
              endDate: ledger?.endDate ?? scopeDates.at(-1) ?? `${year}-12-31`,
            }
          : { startDate: start, endDate: end };
  const filter = {
    ledgerId,
    sourceLedgerId: sourceId,
    includeDescendants: includeDescendants && sourceId !== ledgerId,
    ...period,
    ownerId: owner,
    paymentMethodId: payment === UNASSIGNED_PAYMENT ? null : payment,
    assetId: asset,
    type,
    tagIds: selected,
  };
  const valid =
    period.startDate <= period.endDate &&
    Number.isFinite(Date.parse(period.startDate)) &&
    Number.isFinite(Date.parse(period.endDate)) &&
    Date.parse(period.endDate) - Date.parse(period.startDate) <= 3660 * 86400000;
  const rows = valid ? analysisTransactions(data, filter) : [];
  const sum = totals(rows);
  const groups = data.tagGroups.filter((g) => g.appliesTo === 'transaction');
  const groupId = groups.some((item) => item.id === group) ? group : groups[0]?.id || '';
  const breakdown = groupedAnalysis(data, rows, groupId);
  const daily = valid ? dailySeries(data, rows, period.startDate, period.endDate, ledgerId) : [];
  const annual = annualSeries(data, filter, year);
  const flowMetrics = [
    { key: 'income', label: '수입' },
    { key: 'expense', label: '지출' },
    { key: 'savings', label: '가구 순저축' },
  ] as const;
  const flowHasNegative = annual.some((row) => row.savings < 0);
  const flowBand = flowHasNegative ? 90 : 150;
  const flowHeight = flowHasNegative ? flowBand * 2 : flowBand;
  const flowMax = Math.max(
    1,
    ...annual.flatMap((row) => flowMetrics.map((item) => Math.abs(row[item.key]))),
  );
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const matrix = annualTagMatrix(data, filter, year, groupId, today);
  const metric = type === 'income' || type === 'expense' ? type : annualMetric;
  const metricName = metric === 'income' ? '수입' : '지출';
  const payments = paymentAnalysis(data, rows);
  const ledgerBreakdown = ledgerAnalysis(data, rows, ledgerId);
  const savings = valid ? householdSavings(data, period.startDate, period.endDate) : 0;
  const householdIncome = totals(
    data.transactions.filter((t) => t.date >= period.startDate && t.date <= period.endDate),
  ).income;
  const activeFilters: Array<{ id: string; label: string; tagId?: string; remove(): void }> = [
    ...(sourceId
      ? [
          {
            id: 'source',
            label: `출처 ${sourceLedgers.find((item) => item.id === sourceId)?.name ?? sourceId}`,
            remove: () => setSourceLedgerId(''),
          },
        ]
      : []),
    ...(owner
      ? [{ id: 'owner', label: `귀속 ${ownerName(owner)}`, remove: () => setOwner('') }]
      : []),
    ...(payment
      ? [
          {
            id: 'payment',
            label:
              payment === UNASSIGNED_PAYMENT
                ? '결제수단 미지정'
                : (data.paymentMethods.find((item) => item.id === payment)?.name ?? '결제수단'),
            remove: () => setPayment(''),
          },
        ]
      : []),
    ...(asset
      ? [
          {
            id: 'asset',
            label: data.assets.find((item) => item.id === asset)?.name ?? '연결 자산',
            remove: () => setAsset(''),
          },
        ]
      : []),
    ...(type
      ? [{ id: 'type', label: type === 'income' ? '수입만' : '지출만', remove: () => setType('') }]
      : []),
    ...selected.map((id) => ({
      id: `tag:${id}`,
      tagId: id,
      label: `# ${analysisTagName(data, id)}`,
      remove: () => setSelected((current) => current.filter((value) => value !== id)),
    })),
  ];
  function resetFilters() {
    setMode('month');
    setIncludeDescendants(true);
    setStart(`${month.slice(0, 4)}-01-01`);
    setEnd(`${month.slice(0, 4)}-12-31`);
    setSourceLedgerId('');
    setOwner('');
    setPayment('');
    setAsset('');
    setType('');
    setSelected([]);
  }
  const periodLabel =
    mode === 'month'
      ? `${month} 선택 월`
      : mode === 'year'
        ? `${year}년 선택 연도`
        : mode === 'period'
          ? '가계부 설정 기간'
          : '직접 지정한 기간';
  const scopeLabel = sourceId
    ? `${sourceLedgers.find((item) => item.id === sourceId)?.name ?? sourceId}${sourceId === ledgerId ? ' · 직접 기록' : ' · 하위 가계부 포함'}`
    : ledgerId === ALL_LEDGERS_ID
      ? '모든 가계부의 원본 기록'
      : includeDescendants
        ? '이 가계부와 하위 가계부의 기록'
        : '이 가계부의 직접 기록';
  const filtersChanged = mode !== 'month' || !includeDescendants || activeFilters.length > 0;
  function amountButton(value: number, title: string, transactions: Transaction[]) {
    return (
      <button
        type="button"
        className="text-button analysis-amount"
        aria-label={`${title} ${won(value)}원 거래 보기`}
        onClick={() => setDetail({ title, rows: transactions })}
      >
        {won(value)}
      </button>
    );
  }
  function annualCells(optionId: string | null, name: string, result: typeof matrix.overall) {
    const optionRows =
      optionId === null ? matrix.rows : analysisOptionRows(data, matrix.rows, groupId, optionId);
    const metricRows = optionRows.filter((tx) => tx.type === metric);
    return (
      <>
        {result.months.map((cell, index) => (
          <td key={matrix.periods[index].month}>
            {amountButton(
              cell[metric],
              `${matrix.periods[index].month} ${name} ${metricName}`,
              metricRows.filter(
                (tx) =>
                  tx.date >= matrix.periods[index].startDate &&
                  tx.date <= matrix.periods[index].endDate,
              ),
            )}
          </td>
        ))}
        <td className="analysis-total">
          {amountButton(result.total[metric], `${year}년 ${name} ${metricName} 합계`, metricRows)}
        </td>
        <td>{result.average[metric] === null ? '—' : won(Math.round(result.average[metric]))}</td>
      </>
    );
  }
  function tagLabel(id: string, fallback?: string) {
    const tag = data.tags.find((item) => item.id === id);
    return tag ? (
      <TagBadge
        name={analysisTagName(data, id)}
        color={tag.color}
        title={data.tagGroups.find((group) => group.id === tag.groupId)?.name}
      />
    ) : (
      fallback
    );
  }
  function table(list: Transaction[]) {
    if (!list.length)
      return (
        <Empty illustration="search">
          이 조건에 맞는 기록이 없어요. 조회 기간이나 적용한 필터를 확인해 주세요.
        </Empty>
      );
    return (
      <div
        className="management-table analysis-transaction-table"
        tabIndex={0}
        role="region"
        aria-label="조회한 거래 내역 표 · 가로로 이동하여 원본 열기"
      >
        <table>
          <thead>
            <tr>
              <th>날짜 / 출처</th>
              <th>내역</th>
              <th>귀속 / 결제수단</th>
              <th>수입</th>
              <th>지출</th>
              <th>원본</th>
            </tr>
          </thead>
          <tbody>
            {list.map((tx) => (
              <tr key={tx.id}>
                <td className="analysis-record-source">
                  {tx.date}
                  <small>{data.ledgers.find((l) => l.id === tx.ledgerId)?.name}</small>
                </td>
                <td className="analysis-record-description">
                  {tx.description}
                  <span className="tag-badge-list">
                    {tx.tagIds.map((id) => (
                      <span key={id}>{tagLabel(id)}</span>
                    ))}
                  </span>
                </td>
                <td className="analysis-record-payment">
                  {ownerName(tx.ownerId)}
                  <small>
                    {tx.paymentMethodId === null
                      ? '미지정'
                      : (data.paymentMethods.find((p) => p.id === tx.paymentMethodId)?.name ??
                        '알 수 없는 결제수단')}
                  </small>
                </td>
                <td className="analysis-record-amount">
                  {tx.type === 'income' ? won(tx.amount) : '—'}
                </td>
                <td className="analysis-record-amount">
                  {tx.type === 'expense' ? won(tx.amount) : '—'}
                </td>
                <td>
                  {onEdit && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setDetail(null);
                        onEdit(data.transactions.find((t) => t.id === tx.id)!);
                      }}
                    >
                      열기
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="management-stack analysis-page">
      <section className="analysis-overview" aria-label="선택 기간 요약">
        <div className="analysis-overview-heading">
          <div>
            <p className="analysis-eyebrow">
              {ledgerId === ALL_LEDGERS_ID ? '전체 가계부' : ledger?.name} ·{' '}
              {mode === 'month' ? month : mode === 'year' ? `${year}년` : '선택 기간'}
            </p>
            <h2>우리의 돈은 어디로 갔을까요?</h2>
            <p className="analysis-period">
              {period.startDate} ~ {period.endDate}
            </p>
          </div>
          <button
            type="button"
            className="analysis-export"
            aria-label="CSV 내보내기"
            disabled={!valid || rows.length === 0}
            onClick={() =>
              downloadFile(
                `가계부_${period.startDate}_${period.endDate}.csv`,
                transactionsCsv(data, rows),
              )
            }
          >
            <Download size={17} aria-hidden="true" />
            CSV 내보내기
          </button>
        </div>
        <div className={`analysis-summary-cards${asset ? ' has-asset' : ''}`}>
          <Stat
            label="선택한 기록의 지출"
            amount={sum.expense}
            hint="복수 태그도 한 번만 합산"
            accent
          />
          <Stat
            label="선택한 기록의 수입"
            amount={sum.income}
            hint={`${rows.length}건의 고유 기록`}
          />
          <Stat label="가구 전체 순저축" amount={savings} hint="선택 기간의 가구 전체 자산 변동" />
          {asset && (
            <Stat
              label="연결 자산 반영액"
              amount={
                asset
                  ? rows.reduce(
                      (s, t) =>
                        s +
                        t.allocations
                          .filter((a) => a.assetId === asset)
                          .reduce((n, a) => n + (t.type === 'income' ? a.amount : -a.amount), 0),
                      0,
                    )
                  : 0
              }
              hint={asset ? '해당 자산 배분액만 합산' : '자산을 선택하면 표시'}
            />
          )}
        </div>
        <div className="analysis-overview-foot">
          <span>
            가구 저축률{' '}
            <strong>
              {householdIncome ? `${((savings / householdIncome) * 100).toFixed(1)}%` : '수입 없음'}
            </strong>
            <span className="analysis-foot-separator">·</span>
            순저축과 저축률은 가계부·거래 필터와 별도로 가구 전체를 집계해요
          </span>
          <button type="button" onClick={() => setSection('transactions')}>
            선택한 거래 {rows.length}건<ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </section>
      <section className="panel management-panel analysis-controls" aria-label="분석 조회 조건">
        <div className="analysis-controls-heading">
          <div>
            <h2>조회 조건</h2>
            <p>
              {lockedLedger
                ? '이 가계부의 기록을 기간과 조건으로 좁혀 보세요.'
                : '기간과 가계부를 정하고, 필요한 조건만 좁혀 보세요.'}
            </p>
          </div>
          <Tooltip content="현재 가계부의 선택 월로 돌아가고, 모든 추가 조건을 해제해요.">
            <button
              type="button"
              className="text-button analysis-reset"
              disabled={!filtersChanged}
              onClick={resetFilters}
            >
              모두 초기화
            </button>
          </Tooltip>
        </div>
        <div className="management-filters analysis-basic-filters">
          {lockedLedger ? (
            <div className="room-scope-label" aria-label="분석 가계부">
              <span>분석 가계부</span>
              <strong>{ledgerId === ALL_LEDGERS_ID ? '전체 가계부' : ledger?.name}</strong>
            </div>
          ) : (
            <label>
              가계부
              <SelectField
                aria-label="분석할 가계부"
                value={ledgerId}
                onValueChange={(value) => {
                  setSourceLedgerId('');
                  setIncludeDescendants(true);
                  setLedgerId(value);
                }}
              >
                <SelectOption value={ALL_LEDGERS_ID}>전체 가계부</SelectOption>
                {data.ledgers.map((l) => (
                  <SelectOption key={l.id} value={l.id}>
                    {ledgerPath(data.ledgers, l.id)}
                  </SelectOption>
                ))}
              </SelectField>
            </label>
          )}
          <label>
            조회 범위
            <SelectField value={mode} onValueChange={(value) => setMode(value)}>
              <SelectOption value="month">선택 월</SelectOption>
              <SelectOption value="year">선택 연도</SelectOption>
              <SelectOption value="period">가계부 설정 기간</SelectOption>
              <SelectOption value="range">직접 기간</SelectOption>
            </SelectField>
          </label>
          {ledgerId !== ALL_LEDGERS_ID && (
            <label>
              조회 대상
              <SelectField
                value={includeDescendants ? 'descendants' : 'self'}
                onValueChange={(value) => {
                  setIncludeDescendants(value === 'descendants');
                  setSourceLedgerId('');
                }}
              >
                <SelectOption value="descendants">하위 가계부 포함</SelectOption>
                <SelectOption value="self">이 가계부만</SelectOption>
              </SelectField>
            </label>
          )}
          {mode === 'range' && (
            <>
              <label>
                통계 시작일
                <DateField value={start} onValueChange={(value) => setStart(value)} />
              </label>
              <label>
                통계 종료일
                <DateField value={end} onValueChange={(value) => setEnd(value)} />
              </label>
            </>
          )}
        </div>
        <div className="analysis-query-summary" aria-label="적용한 조회 범위">
          <div>
            <strong>{periodLabel}</strong>
            <span>
              {period.startDate} ~ {period.endDate}
            </span>
          </div>
          <p>{scopeLabel}</p>
          <span
            className="analysis-result-count"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {valid ? `조회 결과 ${rows.length}건` : '조회 기간 확인 필요'}
          </span>
        </div>
        {!valid && (
          <p className="analysis-filter-error" role="alert">
            시작일과 종료일을 확인해 주세요. 최대 조회 기간은 10년이에요.
          </p>
        )}
        <details className="analysis-extra-filters">
          <summary>
            <span>
              <SlidersHorizontal size={18} aria-hidden="true" />
              추가 필터{activeFilters.length > 0 && <b>{activeFilters.length}</b>}
            </span>
            <ChevronDown size={18} aria-hidden="true" />
          </summary>
          <p className="analysis-detail-hint">필터를 접어도 선택한 조건은 계속 적용돼요.</p>
          <div className="management-filters analysis-detail-fields">
            {(ledgerId === ALL_LEDGERS_ID || includeDescendants) && (
              <label>
                거래 출처
                <SelectField value={sourceId} onValueChange={(value) => setSourceLedgerId(value)}>
                  <SelectOption value="">조회 대상 전체</SelectOption>
                  {sourceLedgers.map((source) => (
                    <SelectOption key={source.id} value={source.id}>
                      {ledgerPath(data.ledgers, source.id)}
                      {source.id === ledgerId ? ' · 직접 기록' : ' · 하위 포함'}
                      {source.archived ? ' (보관)' : ''}
                    </SelectOption>
                  ))}
                </SelectField>
              </label>
            )}
            <label>
              귀속
              <SelectField value={owner} onValueChange={(value) => setOwner(value)}>
                <SelectOption value="">전체</SelectOption>
                {['u1', 'u2', 'shared'].map((id) => (
                  <SelectOption key={id} value={id}>
                    {ownerName(id)}
                  </SelectOption>
                ))}
              </SelectField>
            </label>
            <label>
              결제수단
              <SelectField value={payment} onValueChange={(value) => setPayment(value)}>
                <SelectOption value="">전체</SelectOption>
                <SelectOption value={UNASSIGNED_PAYMENT}>미지정</SelectOption>
                {data.paymentMethods.map((p) => (
                  <SelectOption key={p.id} value={p.id}>
                    {p.name}
                  </SelectOption>
                ))}
              </SelectField>
            </label>
            <label>
              연결 자산
              <SelectField value={asset} onValueChange={(value) => setAsset(value)}>
                <SelectOption value="">전체</SelectOption>
                {data.assets.map((a) => (
                  <SelectOption key={a.id} value={a.id}>
                    {a.name}
                  </SelectOption>
                ))}
              </SelectField>
            </label>
            <label>
              거래 종류
              <SelectField value={type} onValueChange={(value) => setType(value)}>
                <SelectOption value="">수입과 지출</SelectOption>
                <SelectOption value="income">수입</SelectOption>
                <SelectOption value="expense">지출</SelectOption>
              </SelectField>
            </label>
          </div>
          <div className="management-tags">
            {groups.map((g) => (
              <fieldset key={g.id}>
                <legend>{g.name}</legend>
                <div>
                  {data.tags
                    .filter((t) => t.groupId === g.id)
                    .map((t) => (
                      <button
                        type="button"
                        key={t.id}
                        className={`tag-filter ${selected.includes(t.id) ? 'active' : ''}`}
                        aria-pressed={selected.includes(t.id)}
                        aria-label={`# ${analysisTagName(data, t.id)}${t.archived ? ' (보관)' : ''}`}
                        onClick={() =>
                          setSelected((prev) =>
                            prev.includes(t.id)
                              ? prev.filter((id) => id !== t.id)
                              : [...prev, t.id],
                          )
                        }
                      >
                        <TagBadge
                          name={analysisTagName(data, t.id)}
                          color={t.color}
                          archived={t.archived}
                        />
                        <Check
                          size={16}
                          aria-hidden="true"
                          className={`tag-filter-check ${selected.includes(t.id) ? 'selected' : ''}`}
                        />
                      </button>
                    ))}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="analysis-filter-footer">
            <span>같은 유형은 하나라도, 다른 유형은 모두 일치하는 기록을 찾아요.</span>
            <button type="button" className="text-button" onClick={() => setSelected([])}>
              태그 선택 초기화
            </button>
          </div>
        </details>
        {activeFilters.length > 0 && (
          <div className="analysis-active-filters" aria-label="적용 중인 필터">
            {activeFilters.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={item.remove}
                aria-label={`${item.label} 필터 해제`}
              >
                <span>{item.tagId ? tagLabel(item.tagId, item.label) : item.label}</span>
                <X size={13} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </section>
      {valid && rows.length === 0 && (
        <section className="analysis-empty-result" aria-label="빈 조회 결과">
          <div>
            <strong>선택한 기간과 조건에 맞는 기록이 없어요.</strong>
            <p>
              조회 기간을 바꾸거나 추가 필터를 해제해 보세요. 연간 표는 선택 연도 전체를 보여줘요.
            </p>
          </div>
          {filtersChanged && (
            <button type="button" className="secondary" onClick={resetFilters}>
              조회 조건 초기화
            </button>
          )}
        </section>
      )}
      <div className="analysis-section-nav" role="group" aria-label="분석 보기">
        {(
          [
            { id: 'flow', label: '소비 흐름' },
            { id: 'category', label: '분류별' },
            { id: 'sources', label: '가계부·결제수단' },
            { id: 'transactions', label: '거래 내역' },
          ] as const
        ).map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={section === item.id}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {section === 'flow' && (
        <>
          <section className="panel management-panel">
            <h2>{year}년 월별 흐름</h2>
            <p className="analysis-range-note">
              연간 비교 · 위에서 선택한 기간과 별도로 {year}년의 12개월을 보여줘요. 수입·지출에는
              같은 가계부와 추가 필터를 적용해요.
            </p>
            <p className="small muted">
              {matrix.periods[0].startDate} ~ {matrix.periods[11].endDate} · 현재까지 시작한{' '}
              {matrix.elapsedPeriods}개 집계 기간의 월평균 지출:{' '}
              {matrix.overall.average.expense === null
                ? '—'
                : `${won(Math.round(matrix.overall.average.expense))}원`}
            </p>
            <figure className="analysis-flow" aria-labelledby={flowCaptionId}>
              <figcaption id={flowCaptionId} className="small muted">
                수입·지출은 조회 조건을, 순저축은 가구 전체를 기준으로 해요. 음수는 0선 아래에
                표시해요.
              </figcaption>
              <ul className="analysis-flow-legend" aria-label="차트 범례">
                {flowMetrics.map((item) => (
                  <li key={item.key}>
                    <span className={`analysis-flow-swatch ${item.key}`} aria-hidden="true" />
                    {item.label}
                  </li>
                ))}
              </ul>
              <div
                className="analysis-flow-scroll"
                role="group"
                aria-label={`${year}년 수입 지출 가구 순저축 추이`}
              >
                <div className="analysis-flow-grid">
                  {annual.map((row) => {
                    const summary = `${row.month} 수입 ${won(row.income)}원, 지출 ${won(row.expense)}원, 가구 순저축 ${won(row.savings)}원`;
                    return (
                      <Tooltip content={summary} key={row.month}>
                        <button
                          type="button"
                          className="analysis-flow-month"
                          aria-label={`${summary}. 이 기간 거래 보기`}
                          onClick={() =>
                            setDetail({
                              title: row.month,
                              rows: analysisTransactions(data, {
                                ...filter,
                                startDate: row.startDate,
                                endDate: row.endDate,
                              }),
                            })
                          }
                        >
                          <span
                            className="analysis-flow-bars"
                            style={{ height: flowHeight }}
                            aria-hidden="true"
                          >
                            <span className="analysis-flow-axis" style={{ top: flowBand }} />
                            {flowMetrics.map((item, index) => {
                              const value = row[item.key],
                                height = (Math.abs(value) / flowMax) * flowBand;
                              return (
                                <span
                                  key={item.key}
                                  className={`analysis-flow-bar ${item.key}${value < 0 ? ' negative' : ''}`}
                                  data-metric={item.key}
                                  data-value={value}
                                  style={{
                                    height,
                                    top: value < 0 ? flowBand : flowBand - height,
                                    left: `${10 + index * 28}%`,
                                  }}
                                />
                              );
                            })}
                          </span>
                          <small>{Number(row.month.slice(5))}월</small>
                        </button>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
              <p className="small muted">
                월을 누르면 거래를 볼 수 있어요. 좁은 화면에서는 옆으로 움직여 보세요.
              </p>
            </figure>
            <details className="analysis-expander-inline">
              <summary>
                월별 금액 자세히 보기
                <ChevronDown size={18} aria-hidden="true" />
              </summary>
              <div
                className="management-table"
                tabIndex={0}
                role="region"
                aria-label="월별 금액 상세표"
              >
                <table>
                  <thead>
                    <tr>
                      <th>월</th>
                      <th>수입</th>
                      <th>지출</th>
                      <th>수입−지출</th>
                      <th>가구 순저축</th>
                      <th>가구 저축률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {annual.map((r) => (
                      <tr key={r.month}>
                        <td>
                          {r.month}
                          <small>
                            {r.startDate} ~ {r.endDate}
                          </small>
                        </td>
                        <td>{won(r.income)}</td>
                        <td>{won(r.expense)}</td>
                        <td>{won(r.income - r.expense)}</td>
                        <td>{won(r.savings)}</td>
                        <td>
                          {r.savingsRate === null ? '—' : `${(r.savingsRate * 100).toFixed(1)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          <section className="panel management-panel">
            <h2>하루하루 소비 기록</h2>
            <p className="analysis-range-note">
              선택 기간 · {period.startDate} ~ {period.endDate}
            </p>
            <p className="small muted">
              가계부 설정의 고정지출 기준 태그를 제외해요. 미래 날짜는 무지출로 세지 않아요. 조회
              조건 적용 후 {daily.filter((d) => d.date <= today && d.variableExpense === 0).length}
              일 무지출.
            </p>
            {daily.length <= 62 ? (
              <div className="management-calendar">
                {daily.map((d) => (
                  <button
                    className={d.variableExpense === 0 && d.date <= today ? 'no-spend' : ''}
                    key={d.date}
                    onClick={() =>
                      setDetail({ title: d.date, rows: rows.filter((t) => t.date === d.date) })
                    }
                  >
                    <strong>{d.date.slice(5)}</strong>
                    <span>
                      {d.expense ? `${won(d.expense)}원` : d.date > today ? '예정' : '무지출'}
                    </span>
                    <small>누적 {won(d.cumulative)}</small>
                  </button>
                ))}
              </div>
            ) : (
              <p>월별로 조회하면 일별 달력이 보여요.</p>
            )}
          </section>
        </>
      )}
      {section === 'category' && (
        <>
          <section className="panel management-panel">
            <div className="section-heading">
              <div>
                <span className="analysis-eyebrow">선택한 기간</span>
                <h2>어디에 얼마나 썼을까요?</h2>
              </div>
              <label>
                집계할 태그 유형
                <SelectField value={groupId} onValueChange={(value) => setGroup(value)}>
                  {groups.map((g) => (
                    <SelectOption key={g.id} value={g.id}>
                      {g.name}
                    </SelectOption>
                  ))}
                </SelectField>
              </label>
            </div>
            <p className="small muted">
              금액을 누르면 해당 거래를 볼 수 있어요. 여러 옵션이 붙은 거래는 각 항목에 표시해요.
            </p>
            <div
              className="management-table analysis-category-table"
              tabIndex={0}
              role="region"
              aria-label="선택 기간 분류별 금액 표"
            >
              <table>
                <thead>
                  <tr>
                    <th>항목</th>
                    <th>건수</th>
                    <th>수입</th>
                    <th>지출</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((r) => (
                    <tr key={r.id}>
                      <td>{tagLabel(r.id, r.name)}</td>
                      <td>{r.count}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() =>
                            setDetail({
                              title: `${r.name} 수입`,
                              rows: rows.filter(
                                (t) =>
                                  t.type === 'income' &&
                                  (r.id
                                    ? t.tagIds.includes(r.id)
                                    : !data.tags.some(
                                        (tag) =>
                                          tag.groupId === groupId && t.tagIds.includes(tag.id),
                                      )),
                              ),
                            })
                          }
                        >
                          {won(r.income)}
                        </button>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() =>
                            setDetail({
                              title: `${r.name} 지출`,
                              rows: rows.filter(
                                (t) =>
                                  t.type === 'expense' &&
                                  (r.id
                                    ? t.tagIds.includes(r.id)
                                    : !data.tags.some(
                                        (tag) =>
                                          tag.groupId === groupId && t.tagIds.includes(tag.id),
                                      )),
                              ),
                            })
                          }
                        >
                          {won(r.expense)}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <details className="panel management-panel analysis-expander">
            <summary>
              <span>
                <strong>{year}년 월별 상세표</strong>
                <small>12개월 합계와 경과월 평균을 한눈에</small>
              </span>
              <ChevronDown size={20} aria-hidden="true" />
            </summary>
            <div className="analysis-expander-content">
              <div className="section-heading">
                <h3>{year}년 분류별 월간 상세</h3>
                <label>
                  연간 상세 금액
                  <SelectField
                    value={metric}
                    disabled={Boolean(type)}
                    onValueChange={(value) => setAnnualMetric(value as 'income' | 'expense')}
                  >
                    <SelectOption value="expense">지출</SelectOption>
                    <SelectOption value="income">수입</SelectOption>
                  </SelectField>
                </label>
              </div>
              <p className="small muted">
                {groups.find((item) => item.id === groupId)?.name || '미분류'} ·{' '}
                {matrix.periods[0].startDate} ~ {matrix.periods[11].endDate}. 위의 조회 범위와
                별도로 선택 연도 전체를 비교하며 나머지 조회 조건은 동일하게 적용해요.
              </p>
              <p className="small muted">
                한 거래에 복수 옵션이 있으면 각 옵션에 표시해요. 마지막 전체 합계에서는 한 번만
                계산해요. 경과월 평균은 {today}까지의 금액을 시작한 {matrix.elapsedPeriods}개
                회계기간으로 나누며 진행 중인 기간도 포함해요.
              </p>
              <div
                className="management-table analysis-matrix"
                tabIndex={0}
                role="region"
                aria-label={`${year}년 분류별 ${metricName} 월간 상세표`}
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">항목 · {metricName}</th>
                      {matrix.periods.map((column) => (
                        <th scope="col" key={column.month}>
                          <Tooltip content={`${column.startDate} ~ ${column.endDate}`}>
                            <span>{Number(column.month.slice(5))}월</span>
                          </Tooltip>
                        </th>
                      ))}
                      <th scope="col">연간 합계</th>
                      <th scope="col">경과월 평균</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.groups.map((row) => (
                      <tr key={row.id}>
                        <th scope="row">{tagLabel(row.id, row.name)}</th>
                        {annualCells(row.id, row.name, row)}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">전체 고유 거래</th>
                      {annualCells(null, '전체', matrix.overall)}
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="small muted">
                표를 가로로 움직이면 12개월 전체와 연간 합계·경과월 평균을 볼 수 있어요.
              </p>
            </div>
          </details>
        </>
      )}
      {section === 'sources' && (
        <>
          <section className="panel management-panel">
            <h2>가계부별 사용액과 비중</h2>
            <p className="small muted">
              {period.startDate} ~ {period.endDate} · 선택한 기록의 원본 가계부별 지출 비중이에요.
              연결된 보관 가계부도 포함해요.
            </p>
            <div
              className="management-table analysis-ledgers"
              tabIndex={0}
              role="region"
              aria-label="가계부별 사용액 표"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">원본 가계부</th>
                    <th scope="col">건수</th>
                    <th scope="col">수입</th>
                    <th scope="col">지출</th>
                    <th scope="col">지출 비중</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerBreakdown.map((item) => {
                    const matching = rows.filter((tx) => tx.ledgerId === item.id);
                    return (
                      <tr key={item.id}>
                        <th scope="row">{item.name}</th>
                        <td>{item.count}건</td>
                        <td>
                          {amountButton(
                            item.income,
                            `${item.name} 수입`,
                            matching.filter((tx) => tx.type === 'income'),
                          )}
                        </td>
                        <td>
                          {amountButton(
                            item.expense,
                            `${item.name} 지출`,
                            matching.filter((tx) => tx.type === 'expense'),
                          )}
                        </td>
                        <td>
                          {item.expenseShare === null ? (
                            '—'
                          ) : (
                            <>
                              <span>{(item.expenseShare * 100).toFixed(1)}%</span>
                              <span className="analysis-share-track" aria-hidden="true">
                                <span style={{ width: `${item.expenseShare * 100}%` }} />
                              </span>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">전체 고유 거래</th>
                    <td>{rows.length}건</td>
                    <td>{won(sum.income)}</td>
                    <td>{won(sum.expense)}</td>
                    <td>{sum.expense ? '100.0%' : '—'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
          <section className="panel management-panel">
            <h2>결제수단별 내역</h2>
            <p className="small muted">
              {period.startDate} ~ {period.endDate} · 선택한 조회 조건을 적용해요. 금액과 건수를
              누르면 거래를 확인할 수 있어요.
            </p>
            <div
              className="management-table analysis-payments"
              tabIndex={0}
              role="region"
              aria-label="결제수단별 사용액 표"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">결제수단</th>
                    <th scope="col">건수</th>
                    <th scope="col">수입</th>
                    <th scope="col">지출</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((paymentRow) => {
                    const matching = rows.filter((tx) => tx.paymentMethodId === paymentRow.id);
                    return (
                      <tr key={paymentRow.id ?? UNASSIGNED_PAYMENT}>
                        <th scope="row">{paymentRow.name}</th>
                        <td>
                          <button
                            type="button"
                            className="text-button analysis-amount"
                            aria-label={`${paymentRow.name} ${paymentRow.count}건 거래 보기`}
                            onClick={() =>
                              setDetail({ title: `${paymentRow.name} 전체 거래`, rows: matching })
                            }
                          >
                            {paymentRow.count}건
                          </button>
                        </td>
                        <td>
                          {amountButton(
                            paymentRow.income,
                            `${paymentRow.name} 수입`,
                            matching.filter((tx) => tx.type === 'income'),
                          )}
                        </td>
                        <td>
                          {amountButton(
                            paymentRow.expense,
                            `${paymentRow.name} 지출`,
                            matching.filter((tx) => tx.type === 'expense'),
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">전체 고유 거래</th>
                    <td>{rows.length}건</td>
                    <td>{won(sum.income)}</td>
                    <td>{won(sum.expense)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}
      {section === 'transactions' && (
        <section className="panel management-panel">
          <div className="section-heading">
            <h2>선택한 거래 {rows.length}건</h2>
            <span className="analysis-eyebrow">
              {period.startDate} ~ {period.endDate}
            </span>
          </div>
          {table(rows)}
        </section>
      )}
      {detail && (
        <Dialog title={detail.title} onClose={() => setDetail(null)}>
          <div className="form-body analysis-detail-body">
            <p className="analysis-detail-caption">
              {detail.rows.length}건 · 좁은 화면에서는 표를 가로로 움직여 원본을 열 수 있어요.
            </p>
            {table(detail.rows)}
          </div>
        </Dialog>
      )}
    </div>
  );
}
