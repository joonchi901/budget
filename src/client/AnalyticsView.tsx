import { useId, useState } from 'react';
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
import './management.css';

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
}: {
  data: Bootstrap;
  ledgerId: string;
  setLedgerId(id: string): void;
  month: string;
  onEdit?(tx: Transaction): void;
}) {
  const flowCaptionId = useId();
  const [mode, setMode] = useState('month');
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
  const sourceLedgers = data.ledgers.filter(
    (source) => source.id === ledgerId || (ledger?.kind === 'main' && source.parentId === ledgerId),
  );
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
        : { startDate: start, endDate: end };
  const filter = {
    ledgerId,
    sourceLedgerId: sourceId,
    ...period,
    ownerId: owner,
    paymentMethodId: payment,
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
  function table(list: Transaction[]) {
    return (
      <div className="management-table">
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
                <td>
                  {tx.date}
                  <small>{data.ledgers.find((l) => l.id === tx.ledgerId)?.name}</small>
                </td>
                <td>
                  {tx.description}
                  <small>{tx.tagIds.map((id) => analysisTagName(data, id)).join(' · ')}</small>
                </td>
                <td>
                  {ownerName(tx.ownerId)}
                  <small>
                    {data.paymentMethods.find((p) => p.id === tx.paymentMethodId)?.name}
                  </small>
                </td>
                <td>{tx.type === 'income' ? won(tx.amount) : '—'}</td>
                <td>{tx.type === 'expense' ? won(tx.amount) : '—'}</td>
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
        {!list.length && <Empty>조건에 맞는 기록이 없어요.</Empty>}
      </div>
    );
  }
  return (
    <div className="management-stack">
      <section className="panel management-panel">
        <h2>보고 싶은 기록을 골라보세요</h2>
        <div className="management-filters">
          <label>
            가계부
            <select
              aria-label="분석할 가계부"
              value={ledgerId}
              onChange={(e) => {
                setSourceLedgerId('');
                setLedgerId(e.target.value);
              }}
            >
              {data.ledgers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          {ledger?.kind === 'main' && (
            <label>
              거래 출처
              <select value={sourceId} onChange={(event) => setSourceLedgerId(event.target.value)}>
                <option value="">메인과 연결 가계부 전체</option>
                {sourceLedgers.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                    {source.id === ledgerId ? ' · 직접 기록' : ''}
                    {source.archived ? ' (보관)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            조회 범위
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="month">선택 월</option>
              <option value="year">선택 연도</option>
              <option value="range">직접 기간</option>
            </select>
          </label>
          {mode === 'range' && (
            <>
              <label>
                통계 시작일
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label>
                통계 종료일
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
            </>
          )}
          <label>
            귀속
            <select value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">전체</option>
              {['u1', 'u2', 'shared'].map((id) => (
                <option key={id} value={id}>
                  {ownerName(id)}
                </option>
              ))}
            </select>
          </label>
          <label>
            결제수단
            <select value={payment} onChange={(e) => setPayment(e.target.value)}>
              <option value="">전체</option>
              {data.paymentMethods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            연결 자산
            <select value={asset} onChange={(e) => setAsset(e.target.value)}>
              <option value="">전체</option>
              {data.assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            거래 종류
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">수입과 지출</option>
              <option value="income">수입</option>
              <option value="expense">지출</option>
            </select>
          </label>
        </div>
        <p className="small muted">
          {period.startDate} ~ {period.endDate} · 같은 유형은 OR, 서로 다른 유형은 AND로 조회해요.
        </p>
        {!valid && (
          <p role="alert">시작일과 종료일을 확인해 주세요. 최대 조회 기간은 10년이에요.</p>
        )}
        <div className="management-tags">
          {groups.map((g) => (
            <fieldset key={g.id}>
              <legend>{g.name}</legend>
              {data.tags
                .filter((t) => t.groupId === g.id)
                .map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    className={`tag-filter ${selected.includes(t.id) ? 'active' : ''}`}
                    aria-pressed={selected.includes(t.id)}
                    onClick={() =>
                      setSelected((prev) =>
                        prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id],
                      )
                    }
                  >
                    # {t.name}
                    {t.archived ? ' (보관)' : ''}
                  </button>
                ))}
            </fieldset>
          ))}
        </div>
        <button className="text-button" onClick={() => setSelected([])}>
          태그 선택 초기화
        </button>
      </section>
      <section className="stats-grid">
        <Stat
          label="선택한 기록의 수입"
          amount={sum.income}
          hint={`${rows.length}건의 고유 기록`}
        />
        <Stat
          label="선택한 기록의 지출"
          amount={sum.expense}
          hint="복수 태그도 한 번만 합산"
          accent
        />
        <Stat label="기간 순저축" amount={savings} hint="가구 전체 자산 변동 기준" />
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
      </section>
      <p className="small muted">
        가구 전체 저축률:{' '}
        {householdIncome
          ? `${((savings / householdIncome) * 100).toFixed(1)}%`
          : '수입이 없어 계산하지 않음'}{' '}
        · 저축 통계는 거래 필터와 별도로 가구 전체를 집계해요.
      </p>
      <section className="panel management-panel">
        <div className="section-heading">
          <h2>유형별 전체 내역</h2>
          <label>
            집계할 태그 유형
            <select value={groupId} onChange={(e) => setGroup(e.target.value)}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="small muted">
          복수 옵션의 행별 합은 고유 거래 합계보다 클 수 있어요. 금액을 누르면 거래를 확인할 수
          있어요.
        </p>
        <div className="management-table">
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
                  <td>{r.name}</td>
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
                                    (tag) => tag.groupId === groupId && t.tagIds.includes(tag.id),
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
                                    (tag) => tag.groupId === groupId && t.tagIds.includes(tag.id),
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
      <section className="panel management-panel">
        <h2>가계부별 사용액과 비중</h2>
        <p className="small muted">
          {period.startDate} ~ {period.endDate} · 선택한 기록의 원본 가계부별 지출 비중이에요.
          연결된 보관 가계부도 포함해요.
        </p>
        <div className="management-table analysis-ledgers">
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
          {period.startDate} ~ {period.endDate} · 선택한 조회 조건을 적용해요. 금액과 건수를 누르면
          거래를 확인할 수 있어요.
        </p>
        <div className="management-table analysis-payments">
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
                  <tr key={paymentRow.id}>
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
      <section className="panel management-panel">
        <div className="section-heading">
          <h2>{year}년 분류별 월간 상세</h2>
          <label>
            연간 상세 금액
            <select
              value={metric}
              disabled={Boolean(type)}
              onChange={(event) => setAnnualMetric(event.target.value as 'income' | 'expense')}
            >
              <option value="expense">지출</option>
              <option value="income">수입</option>
            </select>
          </label>
        </div>
        <p className="small muted">
          {groups.find((item) => item.id === groupId)?.name || '미분류'} ·{' '}
          {matrix.periods[0].startDate} ~ {matrix.periods[11].endDate}. 위의 조회 범위와 별도로 선택
          연도 전체를 비교하며 나머지 조회 조건은 동일하게 적용해요.
        </p>
        <p className="small muted">
          한 거래에 복수 옵션이 있으면 각 옵션에 표시해요. 마지막 전체 합계에서는 한 번만 계산해요.
          경과월 평균은 {today}까지의 금액을 시작한 {matrix.elapsedPeriods}개 회계기간으로 나누며
          진행 중인 기간도 포함해요.
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
                  <th
                    scope="col"
                    key={column.month}
                    title={`${column.startDate} ~ ${column.endDate}`}
                  >
                    {Number(column.month.slice(5))}월
                  </th>
                ))}
                <th scope="col">연간 합계</th>
                <th scope="col">경과월 평균</th>
              </tr>
            </thead>
            <tbody>
              {matrix.groups.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.name}</th>
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
      </section>
      <section className="panel management-panel">
        <h2>{year}년 월별 흐름</h2>
        <p className="small muted">
          {matrix.periods[0].startDate} ~ {matrix.periods[11].endDate} · 현재까지 시작한{' '}
          {matrix.elapsedPeriods}개 집계 기간의 월평균 지출:{' '}
          {matrix.overall.average.expense === null
            ? '—'
            : `${won(Math.round(matrix.overall.average.expense))}원`}
        </p>
        <figure className="analysis-flow" aria-labelledby={flowCaptionId}>
          <figcaption id={flowCaptionId} className="small muted">
            수입·지출은 선택한 가계부와 조회 조건을 적용해요. 가구 순저축은 거래 필터와 별도로 공동
            자산 전체를 집계하며 인출이 더 많으면 0선 아래에 표시해요. 같은 높이는 같은 금액이에요.
            월을 누르면 해당 기간의 수입·지출 거래가 열려요.
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
                  <button
                    type="button"
                    key={row.month}
                    className="analysis-flow-month"
                    aria-label={`${summary}. 이 기간 거래 보기`}
                    title={summary}
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
                );
              })}
            </div>
          </div>
          <p className="small muted">
            각 월의 정확한 금액은 아래 표에서 확인할 수 있어요. 좁은 화면에서는 차트를 가로로 움직여
            보세요.
          </p>
        </figure>
        <div className="management-table">
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
                  <td>{r.savingsRate === null ? '—' : `${(r.savingsRate * 100).toFixed(1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel management-panel">
        <h2>일별 지출과 무지출 기록</h2>
        <p className="small muted">
          가계부 설정의 고정지출 기준 태그를 제외해요. 미래 날짜는 무지출로 세지 않아요. 조회 조건
          적용 후 {daily.filter((d) => d.date <= today && d.variableExpense === 0).length}일 무지출.
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
      <section className="panel management-panel">
        <div className="section-heading">
          <h2>선택한 거래 {rows.length}건</h2>
          <button
            className="secondary"
            onClick={() =>
              downloadFile(
                `가계부_${period.startDate}_${period.endDate}.csv`,
                transactionsCsv(data, rows),
              )
            }
          >
            CSV 내보내기
          </button>
        </div>
        {table(rows)}
      </section>
      {detail && (
        <Dialog title={detail.title} onClose={() => setDetail(null)}>
          <div className="form-body">{table(detail.rows)}</div>
        </Dialog>
      )}
    </div>
  );
}
