import { Tooltip } from './Tooltip';
import { UgaIcon } from './brand/Uga';
import { SelectField, SelectOption } from './SelectField';
import { TagBadge } from './TagBadge';
import { DateField } from './DateFields';
import { ColorField } from './ColorField';
import { useRef, useState, type FormEvent } from 'react';
import { ArrowRightLeft, History, Plus, Settings2 } from 'lucide-react';
import type { Asset, AssetOperation, Bootstrap } from '../shared/types';
import { savingsSummary } from '../shared/selectors';
import {
  assetBalanceAt,
  assetSummaryAt,
  assetTagSubtotals,
  assetYearHistory,
  monthEndDate,
  type AssetDetails,
} from '../shared/assets';
import { request, RequestError } from './api';
import { Dialog, Empty, Stat, ownerName, useUnsavedGuard, won } from './components';
import { TagFields } from './TagFields';
import './assets.css';

type Editor =
  | { type: 'asset'; asset?: Asset }
  | { type: 'transfer' }
  | { type: 'adjustment'; asset: Asset }
  | { type: 'void'; operation: AssetOperation };
interface Props {
  data: Bootstrap;
  month: string;
  onChanged(): Promise<void>;
  onNotice(message: string): void;
}
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export default function AssetsView({ data, month, onChanged, onNotice }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [assetFilter, setAssetFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [tagGroupId, setTagGroupId] = useState('');
  const asOf = monthEndDate(month);
  const summary = assetSummaryAt(data, asOf);
  const assets = data.assets.filter((a) => a.kind === 'asset' && !a.archived);
  const yearHistory = assetYearHistory(data, month.slice(0, 4));
  const chartMax = Math.max(1, ...yearHistory.map((row) => Math.abs(row.net ?? 0)));
  const assetGroups = data.tagGroups.filter((group) => group.appliesTo === 'asset');
  const selectedGroup = assetGroups.find((group) => group.id === tagGroupId) ?? assetGroups[0];
  const tagTotals = selectedGroup ? assetTagSubtotals(data, selectedGroup.id, asOf) : [];
  const displayMoney = (amount: number | null) =>
    amount === null ? '과거 잔액 미확인' : `${won(amount)}원`;
  const savings = savingsSummary(data, month);
  const operations = data.assetOperations.filter(
    (op) =>
      op.date.startsWith(month) &&
      (assetFilter === 'all' || [op.assetId, op.fromAssetId, op.toAssetId].includes(assetFilter)),
  );
  const movements = data.assetMovements.filter(
    (m) =>
      m.transactionId &&
      m.date.startsWith(month) &&
      (assetFilter === 'all' || m.assetId === assetFilter),
  );
  const transactionIds = [...new Set(movements.map((m) => m.transactionId!))];
  const history = [
    ...operations.map((op) => ({
      id: op.id,
      date: op.date,
      description: op.description,
      operation: op,
      transactionId: null as string | null,
    })),
    ...transactionIds.map((id) => {
      const row = movements.find((m) => m.transactionId === id)!;
      return {
        id,
        date: row.date,
        description: row.description,
        operation: null,
        transactionId: id,
      };
    }),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return (
    <div className="assets-workspace">
      <div className="asset-hero">
        <div>
          <span className="asset-as-of">{asOf} 기준</span>
          <h2>우리의 순자산</h2>
          <strong>
            {summary.net === null ? '—' : won(summary.net)}
            {summary.net !== null && <small>원</small>}
          </strong>
          <p>전체 자산에서 부채를 뺀 금액이에요.</p>
        </div>
        <div className="asset-hero-detail">
          <span>
            전체 자산 <strong>{displayMoney(summary.assets)}</strong>
          </span>
          <span>
            전체 부채 <strong>{displayMoney(summary.debt)}</strong>
          </span>
          <div className="asset-stack">
            {summary.rows
              .filter((row) => row.asset.kind === 'asset' && row.balance !== null)
              .map(({ asset: a, balance }) => (
                <span
                  key={a.id}
                  style={{
                    width: `${summary.knownAssets > 0 ? (Math.max(0, balance!) / summary.knownAssets) * 100 : 0}%`,
                    background: a.color,
                  }}
                />
              ))}
          </div>
        </div>
      </div>
      {summary.unknown.length > 0 && (
        <div className="alert">
          자산 {summary.unknown.length}개의 과거 잔액이 미확인이에요. 기준일이 없거나 처음 확인한
          잔액보다 앞선 기간이라 합계를 확정할 수 없어요. 각 자산 설정에서 기준일을 확인해 주세요.
        </div>
      )}
      <div className="section-heading">
        <div>
          <h2>자산과 부채</h2>
          <span className="muted small">예비금·투자금·전세금 등 원하는 항목으로 관리해요.</span>
        </div>
        <div className="asset-actions">
          <label className="checkbox asset-archived-toggle">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            보관 항목 보기
          </label>
          <button
            className="secondary"
            onClick={() => setEditor({ type: 'transfer' })}
            disabled={assets.length < 2}
          >
            <ArrowRightLeft size={16} />
            자산 이동
          </button>
          <button className="primary" onClick={() => setEditor({ type: 'asset' })}>
            <Plus size={16} />
            자산 추가
          </button>
        </div>
      </div>
      <div className="asset-grid">
        {data.assets
          .filter((a) => showArchived || !a.archived)
          .map((a) => {
            const balance = assetBalanceAt(a, data.assetMovements, asOf);
            return (
              <section className="panel asset-card" key={a.id}>
                <div className="asset-card-heading">
                  <div className="asset-card-identity">
                    <span
                      className="asset-icon"
                      style={{ background: `${a.color}18`, color: a.color }}
                    >
                      <UgaIcon name="assets" size={28} />
                    </span>
                    <div>
                      <h3>
                        {a.name} {a.kind === 'liability' && <span className="badge">부채</span>}
                        {a.archived && <span className="badge">보관됨</span>}
                      </h3>
                      <p className="small muted">
                        {ownerName(a.details?.ownerId ?? 'shared')}
                        {a.details?.institution ? ` · ${a.details.institution}` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    className="secondary asset-settings"
                    aria-label={`${a.name} 설정`}
                    onClick={() => setEditor({ type: 'asset', asset: a })}
                  >
                    <Settings2 size={16} />
                    <span>설정</span>
                  </button>
                </div>
                <strong className="asset-balance" data-testid={`asset-${a.id}`}>
                  {balance === null ? '—' : won(balance)}
                  {balance !== null && <small>원</small>}
                </strong>
                <p className="small muted">
                  {balance === null
                    ? a.openingDate
                      ? `${a.openingDate} 첫 관측 이전 · 과거 잔액 미확인`
                      : `기준일 미확인 · 현재 기록 잔액 ${won(a.balance)}원`
                    : `${asOf} 기준`}
                </p>
                <div className="row-tags">
                  {a.trackSavings && <span className="savings-badge">저축 집계</span>}
                  {a.tagIds.map((id) => {
                    const t = data.tags.find((t) => t.id === id);
                    return (
                      t && <TagBadge key={id} name={t.name} color={t.color} archived={t.archived} />
                    );
                  })}
                </div>
                <details className="asset-details">
                  <summary>관리 정보 보기</summary>
                  <div className="asset-detail">
                    <span>
                      {a.details?.openingKind === 'observation'
                        ? '처음 확인한 잔액'
                        : '최초 발생 잔액'}
                    </span>
                    <span>
                      {won(a.openingBalance)}원<br />
                      <small>{a.openingDate || '기준일 미확인'}</small>
                    </span>
                  </div>
                  <div className="asset-detail">
                    <span>선택 월말까지 변동</span>
                    <span>
                      {balance === null
                        ? '—'
                        : `${balance - (a.openingDate! <= asOf ? a.openingBalance : 0) > 0 ? '+' : ''}${won(balance - (a.openingDate! <= asOf ? a.openingBalance : 0))}원`}
                    </span>
                  </div>

                  <AssetDetailsList asset={a} />
                </details>
                <button
                  className="secondary asset-adjust"
                  onClick={() => setEditor({ type: 'adjustment', asset: a })}
                  disabled={a.archived}
                >
                  현재 잔액 맞추기
                </button>
              </section>
            );
          })}
      </div>
      {!data.assets.some((a) => showArchived || !a.archived) && (
        <Empty>아직 등록된 자산이 없어요. 통장 잔액부터 추가해 보세요.</Empty>
      )}
      <div className="section-heading">
        <h2>이번 달 저축</h2>
        <span className="muted small">{month} · 저축 집계로 지정한 자산의 실제 변동</span>
      </div>
      <section className="stats-grid three">
        <Stat label="저축 유입" amount={savings.inflow} hint="저축 자산에 새로 들어온 금액" />
        <Stat label="저축 인출" amount={savings.outflow} hint="저축 자산에서 나간 금액" />
        <Stat label="순저축" amount={savings.net} hint="유입 − 인출" accent />
      </section>
      <p className="small muted">
        저축 자산끼리의 이동, 최초 잔액, 잔액 조정은 저축 실적에 포함하지 않아요. 저축 집계 설정을
        바꾸면 이후 새 변동부터 적용돼요.
      </p>
      <section className="panel asset-months">
        <div className="panel-title">
          <h2>{month.slice(0, 4)}년 월말 자산</h2>
          <span className="small muted">보관한 자산도 합계에 포함</span>
        </div>
        <div
          className="asset-trend"
          role="img"
          aria-label={`${month.slice(0, 4)}년 월별 순자산 추이. 아래 표에서 정확한 금액을 확인할 수 있습니다.`}
        >
          {yearHistory.map((row) => (
            <Tooltip content={`${row.month}: ${displayMoney(row.net)}`} key={row.month}>
              <div className={row.month === month ? 'selected' : ''}>
                <div className="asset-trend-column">
                  <span
                    className={(row.net ?? 0) < 0 ? 'negative' : ''}
                    style={{
                      height:
                        row.net === null
                          ? '0%'
                          : `${Math.max(2, (Math.abs(row.net) / chartMax) * 100)}%`,
                    }}
                  />
                </div>
                <small>{Number(row.month.slice(5))}월</small>
              </div>
            </Tooltip>
          ))}
        </div>
        <details className="asset-table-details">
          <summary>월별 금액 자세히 보기</summary>
          <div className="table-scroll">
            <table className="asset-summary-table">
              <thead>
                <tr>
                  <th>월말</th>
                  <th>총자산</th>
                  <th>총부채</th>
                  <th>순자산</th>
                </tr>
              </thead>
              <tbody>
                {yearHistory.map((row) => (
                  <tr key={row.month} className={row.month === month ? 'selected' : ''}>
                    <th>{row.month}</th>
                    <td>{displayMoney(row.assets)}</td>
                    <td>{displayMoney(row.debt)}</td>
                    <td>{displayMoney(row.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <p className="small muted">
          기준일 잔액과 해당 월말까지의 유효한 변동을 합산해요. 미래 월은 등록된 내역만 반영한
          예상값이며, 과거 거래를 수정하면 해당 월 이후도 다시 계산해요. 처음 확인한 잔액의 기준일
          이전 기간은 미확인으로 남겨요.
        </p>
      </section>
      <section className="panel asset-months">
        <div className="panel-title">
          <h2>자산 분류별 소계</h2>
          {selectedGroup && (
            <SelectField
              aria-label="자산 집계 태그 유형"
              value={selectedGroup.id}
              onValueChange={(value) => setTagGroupId(value)}
            >
              {assetGroups.map((group) => (
                <SelectOption key={group.id} value={group.id}>
                  {group.name}
                  {group.archived ? ' · 보관됨' : ''}
                </SelectOption>
              ))}
            </SelectField>
          )}
        </div>
        {tagTotals.length ? (
          <>
            <div className="table-scroll">
              <table className="asset-summary-table">
                <thead>
                  <tr>
                    <th>분류</th>
                    <th>항목 수</th>
                    <th>자산</th>
                    <th>부채</th>
                    <th>순자산</th>
                  </tr>
                </thead>
                <tbody>
                  {tagTotals
                    .filter((row) => row.count)
                    .map((row) => (
                      <tr key={row.id}>
                        <th>
                          {data.tags.some((tag) => tag.id === row.id) ? (
                            <TagBadge
                              name={row.name}
                              color={data.tags.find((tag) => tag.id === row.id)!.color}
                              archived={data.tags.find((tag) => tag.id === row.id)!.archived}
                            />
                          ) : (
                            row.name
                          )}
                        </th>
                        <td>{row.count}</td>
                        <td>{displayMoney(row.assets)}</td>
                        <td>{displayMoney(row.debt)}</td>
                        <td>{displayMoney(row.net)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="small muted">
              {asOf} 기준. 복수 선택한 항목은 각 옵션 소계에 포함돼요. 전체 순자산에서는 각 자산을
              한 번만 합산해요.
            </p>
          </>
        ) : (
          <Empty>태그 설정에서 자산용 유형과 옵션을 만들면 분류별로 볼 수 있어요.</Empty>
        )}
      </section>
      <section className="panel asset-history">
        <div className="panel-title">
          <h2>
            <History size={18} /> 자산 변동 내역
          </h2>
          <SelectField
            aria-label="변동 내역 자산"
            value={assetFilter}
            onValueChange={(value) => setAssetFilter(value)}
          >
            <SelectOption value="all">전체 자산</SelectOption>
            {data.assets.map((a) => (
              <SelectOption key={a.id} value={a.id}>
                {a.name}
              </SelectOption>
            ))}
          </SelectField>
        </div>
        {history.map((row) => {
          const op = row.operation;
          const effects = data.assetMovements
            .filter((m) => (op ? m.operationId === op.id : m.transactionId === row.transactionId))
            .filter((m) => assetFilter === 'all' || m.assetId === assetFilter);
          return (
            <div className={`history-row ${op?.deletedAt ? 'voided' : ''}`} key={row.id}>
              <div>
                <span className="small muted">
                  {row.date} ·{' '}
                  {op ? (op.type === 'transfer' ? '자산 이동' : '잔액 조정') : '수입·지출 연결'}{' '}
                  {op?.deletedAt ? '· 취소됨' : ''}
                </span>
                <strong>{row.description}</strong>
                <div className="history-effects">
                  {effects.map((m) => (
                    <span key={m.id}>
                      {data.assets.find((a) => a.id === m.assetId)?.name}{' '}
                      <b>
                        {m.amount > 0 ? '+' : ''}
                        {won(m.amount)}원
                      </b>
                    </span>
                  ))}
                  {op?.deletedAt && <span>잔액 반영이 취소되었어요.</span>}
                </div>
                <span className="small muted">
                  {ownerName(op?.createdBy ?? effects[0]?.actorId ?? 'shared')} 기록
                </span>
              </div>
              {op && !op.deletedAt ? (
                <button
                  className="text-button"
                  aria-label={`${op.description} 취소`}
                  onClick={() => setEditor({ type: 'void', operation: op })}
                >
                  취소
                </button>
              ) : !op ? (
                <span className="small muted">원본 가계부에서 수정</span>
              ) : null}
            </div>
          );
        })}
        {!history.length && <Empty>이 달의 자산 변동이 없어요.</Empty>}
      </section>
      {editor && (
        <AssetEditor
          key={
            editor.type +
            ('asset' in editor
              ? (editor.asset?.id ?? 'new')
              : 'operation' in editor
                ? editor.operation.id
                : '')
          }
          data={data}
          editor={editor}
          onClose={() => setEditor(null)}
          onChanged={onChanged}
          onSaved={async () => {
            setEditor(null);
            onNotice('자산에 반영했어요.');
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

function AssetDetailsList({ asset }: { asset: Asset }) {
  const d = asset.details ?? {};
  const rows: [string, string][] = [
    ['메모', d.notes || ''],
    ...(asset.kind === 'liability'
      ? ([
          ['최초 원금', d.principal == null ? '' : `${won(d.principal)}원`],
          ['금리', d.rate == null ? '' : `${d.rate}% ${d.rateType || ''}`],
          ['납입일', d.paymentDay == null ? '' : `${d.paymentDay}일`],
          ['월 납입액', d.monthlyPayment == null ? '' : `${won(d.monthlyPayment)}원`],
          ['기간', d.term || ''],
          ['만기일', d.endDate || ''],
          ['상환 방식', d.repaymentMethod || ''],
          ['조건', d.conditions || ''],
          ['수수료', d.fees || ''],
          ['혜택', d.benefits || ''],
        ] as [string, string][])
      : []),
  ];
  return (
    <dl>
      {rows
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      {!rows.some(([, value]) => value) && (
        <p className="small muted">설정에서 관리 정보를 추가해 주세요.</p>
      )}
    </dl>
  );
}

function AssetEditor({
  data,
  editor,
  onClose,
  onChanged,
  onSaved,
}: {
  data: Bootstrap;
  editor: Editor;
  onClose(): void;
  onChanged(): Promise<void>;
  onSaved(): Promise<void>;
}) {
  const asset = 'asset' in editor ? editor.asset : undefined;
  const [name, setName] = useState(asset?.name ?? '');
  const [kind, setKind] = useState<'asset' | 'liability'>(asset?.kind ?? 'asset');
  const [color, setColor] = useState(asset?.color ?? '#5b4636');
  const [tagIds, setTagIds] = useState(asset?.tagIds ?? []);
  const [tracking, setTracking] = useState(asset?.trackSavings ?? false);
  const [openingDate, setOpeningDate] = useState(asset ? (asset.openingDate ?? '') : localDate());
  const [archived, setArchived] = useState(Boolean(asset?.archived));
  const [details, setDetails] = useState<AssetDetails>(
    asset?.details ?? (asset ? {} : { ownerId: 'shared', openingKind: 'observation' }),
  );
  const [historyData, setHistoryData] = useState(data);
  const [amount, setAmount] = useState(
    editor.type === 'adjustment'
      ? (assetBalanceAt(editor.asset, data.assetMovements, localDate()) ?? editor.asset.balance)
      : 0,
  );
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [date, setDate] = useState(localDate);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [tagPending, setTagPending] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const pending = useRef<{ url: string; method: string; body: unknown } | null>(null);
  const [versions, setVersions] = useState(
    Object.fromEntries(data.assets.map((a) => [a.id, a.version])),
  );
  const [operationVersion, setOperationVersion] = useState(
    editor.type === 'void' ? editor.operation.version : undefined,
  );
  const balances = Object.fromEntries(
    historyData.assets.map((a) => [a.id, assetBalanceAt(a, historyData.assetMovements, date)]),
  );
  const [assetVersion, setAssetVersion] = useState(asset?.version);
  const latestAsset = historyData.assets.find((a) => a.id === asset?.id) ?? asset;
  const baseBalance = latestAsset
    ? assetBalanceAt(latestAsset, historyData.assetMovements, date)
    : null;
  const snapshot = JSON.stringify({
    name,
    kind,
    color,
    tagIds,
    tracking,
    amount,
    from,
    to,
    date,
    description,
    openingDate,
    archived,
    details,
  });
  const initial = useRef(snapshot);
  useUnsavedGuard(busy || uncertain || tagPending || snapshot !== initial.current);
  const locked = busy || uncertain || tagPending;
  const title =
    editor.type === 'asset'
      ? asset
        ? '자산 설정'
        : '자산 추가'
      : editor.type === 'transfer'
        ? '자산 이동'
        : editor.type === 'void'
          ? '자산 변동 취소'
          : '현재 잔액 맞추기';
  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (busy || tagPending || conflict) return;
    if (!pending.current) {
      const mutationId = crypto.randomUUID();
      if (editor.type === 'asset')
        pending.current = {
          url: asset ? `/api/assets/${asset.id}` : '/api/assets',
          method: asset ? 'PATCH' : 'POST',
          body: {
            mutationId,
            expectedVersion: assetVersion,
            name,
            color,
            tagIds,
            openingDate,
            archived,
            details,
            trackSavings: kind === 'asset' && tracking,
            ...(!asset ? { kind, openingBalance: amount } : {}),
          },
        };
      else if (editor.type === 'void')
        pending.current = {
          url: `/api/asset-operations/${editor.operation.id}`,
          method: 'DELETE',
          body: { mutationId, expectedVersion: operationVersion },
        };
      else
        pending.current = {
          url: '/api/asset-operations',
          method: 'POST',
          body: {
            mutationId,
            type: editor.type,
            date,
            description,
            ...(editor.type === 'transfer'
              ? {
                  fromAssetId: from,
                  toAssetId: to,
                  amount,
                  expectedAssetVersions: { [from]: versions[from], [to]: versions[to] },
                }
              : {
                  assetId: editor.asset.id,
                  targetBalance: amount,
                  expectedAssetVersions: { [editor.asset.id]: versions[editor.asset.id] },
                }),
          },
        };
    }
    setBusy(true);
    setError('');
    try {
      const op = pending.current;
      await request(op.url, op.method, op.body);
      pending.current = null;
      setUncertain(false);
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof RequestError && e.status > 0 && e.status < 500) {
        pending.current = null;
        setUncertain(false);
        if (e.status === 409 || (e.status === 404 && editor.type === 'void')) {
          setConflict(true);
          await onChanged();
        }
      } else setUncertain(true);
    } finally {
      setBusy(false);
    }
  }
  async function reloadLatest() {
    setBusy(true);
    setError('');
    try {
      const fresh = await request<Bootstrap>('/api/bootstrap');
      setHistoryData(fresh);
      setVersions(Object.fromEntries(fresh.assets.map((a) => [a.id, a.version])));
      if (editor.type === 'void') {
        const currentOperation = fresh.assetOperations.find((op) => op.id === editor.operation.id);
        if (!currentOperation || currentOperation.deletedAt) {
          await onChanged();
          onClose();
          return;
        }
        setOperationVersion(currentOperation.version);
      }
      const current = fresh.assets.find((a) => a.id === asset?.id);
      if (current) {
        setAssetVersion(current.version);
        if (editor.type === 'asset') {
          setName(current.name);
          setColor(current.color);
          setTagIds(current.tagIds);
          setTracking(current.trackSavings);
          setOpeningDate(current.openingDate ?? '');
          setArchived(Boolean(current.archived));
          setDetails(current.details ?? {});
        } else if (editor.type === 'adjustment')
          setAmount(assetBalanceAt(current, fresh.assetMovements, date) ?? current.balance);
      }
      setConflict(false);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={title} subtitle={asset?.name} onClose={onClose} locked={locked}>
      <form className="asset-editor" onSubmit={(e) => void submit(e)}>
        <div className="form-body">
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {uncertain && (
            <div className="alert">
              저장 결과를 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.
            </div>
          )}
          {conflict && (
            <div className="conflict">
              <strong>다른 변경이 먼저 반영되었어요.</strong>
              <p>최신 잔액과 설정을 불러온 다음 다시 확인해 주세요.</p>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void reloadLatest()}
              >
                최신 자산 불러오기
              </button>
            </div>
          )}
          <fieldset disabled={busy || uncertain || conflict}>
            {editor.type === 'asset' ? (
              <>
                <section className="asset-form-section">
                  <h3>기본 정보</h3>
                  <label>
                    자산 이름
                    <input
                      required
                      maxLength={80}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoFocus
                    />
                  </label>
                  <div className="form-grid">
                    {!asset && (
                      <label>
                        종류
                        <SelectField
                          value={kind}
                          onValueChange={(value) => setKind(value as typeof kind)}
                        >
                          <SelectOption value="asset">자산</SelectOption>
                          <SelectOption value="liability">부채</SelectOption>
                        </SelectField>
                      </label>
                    )}
                    <label>
                      표시 색상
                      <ColorField value={color} onValueChange={(value) => setColor(value)} />
                    </label>
                  </div>
                  <div className="form-grid">
                    <label>
                      소유자
                      <SelectField
                        value={details.ownerId ?? 'shared'}
                        onValueChange={(value) =>
                          setDetails({
                            ...details,
                            ownerId: value as AssetDetails['ownerId'],
                          })
                        }
                      >
                        <SelectOption value="shared">공동</SelectOption>
                        <SelectOption value="u1">나</SelectOption>
                        <SelectOption value="u2">와이프</SelectOption>
                      </SelectField>
                    </label>
                    <label>
                      금융기관
                      <input
                        maxLength={2000}
                        value={details.institution ?? ''}
                        onChange={(e) => setDetails({ ...details, institution: e.target.value })}
                        placeholder="은행·증권사 등"
                      />
                    </label>
                  </div>
                </section>
                <section className="asset-form-section">
                  <h3>기준 잔액</h3>
                  <label>
                    기준 잔액 종류
                    <SelectField
                      value={details.openingKind ?? 'initial'}
                      onValueChange={(value) =>
                        setDetails({
                          ...details,
                          openingKind: value as AssetDetails['openingKind'],
                        })
                      }
                    >
                      <SelectOption value="observation">처음 확인한 잔액</SelectOption>
                      <SelectOption value="initial">자산·부채 최초 발생 잔액</SelectOption>
                    </SelectField>
                    <span className="small muted">
                      {details.openingKind === 'observation'
                        ? '기존 통장이나 엑셀 월말 잔액처럼 그날 확인한 금액이에요. 앞선 기간의 잔액은 미확인으로 표시해요.'
                        : '그날 자산이나 부채가 처음 생겼다는 뜻이에요. 앞선 기간의 잔액은 0원으로 표시해요.'}
                      {asset && ' 종류를 바꾸면 기준일 이전의 통계도 다시 계산해요.'}
                    </span>
                  </label>
                  <label>
                    최초 잔액 기준일
                    <DateField
                      required
                      value={openingDate}
                      onValueChange={(value) => setOpeningDate(value)}
                    />
                    <span className="small muted">
                      선택한 종류에 따라 자산이 발생한 날짜 또는 잔액을 처음 확인한 날짜예요. 이미
                      기록한 변동보다 늦게 지정할 수 없어요.
                    </span>
                  </label>
                  {!asset && (
                    <label>
                      최초 잔액
                      <input
                        type="number"
                        inputMode="numeric"
                        min={kind === 'liability' ? 0 : undefined}
                        max="1000000000000"
                        step="1"
                        required
                        value={amount}
                        onChange={(e) => setAmount(Number(e.target.value))}
                      />
                      <span className="small muted">
                        최초 잔액은 수입이나 저축 실적에 포함하지 않아요.
                      </span>
                    </label>
                  )}
                </section>
                {kind === 'liability' && (
                  <section className="asset-debt-fields asset-form-section">
                    <h3>대출 상세 정보</h3>
                    <div className="form-grid">
                      <label>
                        최초 원금
                        <input
                          type="number"
                          min="0"
                          max="1000000000000"
                          step="1"
                          value={details.principal ?? ''}
                          onChange={(e) =>
                            setDetails({
                              ...details,
                              principal: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        금리 (%)
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.0001"
                          value={details.rate ?? ''}
                          onChange={(e) =>
                            setDetails({
                              ...details,
                              rate: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        금리 종류
                        <input
                          maxLength={2000}
                          placeholder="고정·변동·혼합 등"
                          value={details.rateType ?? ''}
                          onChange={(e) => setDetails({ ...details, rateType: e.target.value })}
                        />
                      </label>
                      <label>
                        매월 납입일
                        <input
                          type="number"
                          min="1"
                          max="31"
                          step="1"
                          value={details.paymentDay ?? ''}
                          onChange={(e) =>
                            setDetails({
                              ...details,
                              paymentDay: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        월 납입액
                        <input
                          type="number"
                          min="0"
                          max="1000000000000"
                          step="1"
                          value={details.monthlyPayment ?? ''}
                          onChange={(e) =>
                            setDetails({
                              ...details,
                              monthlyPayment: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        대출 기간
                        <input
                          maxLength={2000}
                          placeholder="예: 24개월"
                          value={details.term ?? ''}
                          onChange={(e) => setDetails({ ...details, term: e.target.value })}
                        />
                      </label>
                      <label>
                        만기일
                        <DateField
                          value={details.endDate ?? ''}
                          onValueChange={(value) =>
                            setDetails({ ...details, endDate: value || null })
                          }
                        />
                      </label>
                      <label>
                        상환 방식
                        <input
                          maxLength={2000}
                          placeholder="예: 원리금 균등"
                          value={details.repaymentMethod ?? ''}
                          onChange={(e) =>
                            setDetails({ ...details, repaymentMethod: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    {(
                      [
                        ['conditions', '대출 조건'],
                        ['fees', '수수료'],
                        ['benefits', '혜택'],
                      ] as const
                    ).map(([field, label]) => (
                      <label key={field}>
                        {label}
                        <textarea
                          maxLength={2000}
                          rows={2}
                          value={details[field] ?? ''}
                          onChange={(e) => setDetails({ ...details, [field]: e.target.value })}
                        />
                      </label>
                    ))}
                    <p className="small muted">
                      실제 부채가 바뀌면 ‘현재 잔액 맞추기’에서 반영해 주세요.
                    </p>
                  </section>
                )}
                <section className="asset-form-section">
                  <h3>분류와 관리</h3>
                  <label>
                    관리 메모
                    <textarea
                      maxLength={2000}
                      rows={3}
                      value={details.notes ?? ''}
                      onChange={(e) => setDetails({ ...details, notes: e.target.value })}
                    />
                  </label>
                  {kind === 'asset' && (
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={tracking}
                        onChange={(e) => setTracking(e.target.checked)}
                      />
                      이 자산의 유입·인출을 저축으로 집계
                    </label>
                  )}
                  <p className="small muted">
                    저축 집계 설정은 이후 새 변동부터 적용해요. 자산 이름이나 태그를 바꿔도 과거
                    집계는 바뀌지 않아요.
                  </p>
                  <TagFields
                    data={data}
                    value={tagIds}
                    onChange={setTagIds}
                    appliesTo="asset"
                    onChanged={onChanged}
                    onPendingChange={setTagPending}
                    disabled={busy || uncertain}
                  />
                  {asset && (
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={archived}
                        onChange={(e) => setArchived(e.target.checked)}
                      />
                      보관하기 · 과거 기록과 잔액은 유지돼요
                    </label>
                  )}
                </section>
              </>
            ) : editor.type === 'void' ? (
              <div className="effect-preview">
                <span>
                  <strong>{editor.operation.description}</strong>
                  <br />이 변동의 잔액 반영을 되돌려요. 기록은 취소 상태로 남고 수입·지출 합계는
                  바뀌지 않아요.
                </span>
              </div>
            ) : (
              <>
                {editor.type === 'transfer' && (
                  <div className="form-grid">
                    <label>
                      보내는 자산
                      <SelectField required value={from} onValueChange={(value) => setFrom(value)}>
                        <SelectOption value="">선택해 주세요</SelectOption>
                        {data.assets
                          .filter((a) => a.kind === 'asset' && !a.archived)
                          .map((a) => (
                            <SelectOption key={a.id} value={a.id} disabled={a.id === to}>
                              {a.name}
                            </SelectOption>
                          ))}
                      </SelectField>
                    </label>
                    <label>
                      받는 자산
                      <SelectField required value={to} onValueChange={(value) => setTo(value)}>
                        <SelectOption value="">선택해 주세요</SelectOption>
                        {data.assets
                          .filter((a) => a.kind === 'asset' && !a.archived)
                          .map((a) => (
                            <SelectOption key={a.id} value={a.id} disabled={a.id === from}>
                              {a.name}
                            </SelectOption>
                          ))}
                      </SelectField>
                    </label>
                  </div>
                )}
                <label>
                  {editor.type === 'transfer' ? '이동 금액' : '맞출 잔액'}
                  <input
                    type="number"
                    inputMode="numeric"
                    required
                    min={
                      editor.type === 'transfer'
                        ? 1
                        : editor.asset.kind === 'liability'
                          ? 0
                          : undefined
                    }
                    max="1000000000000"
                    step="1"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                  />
                </label>
                {editor.type === 'transfer' && from && to && (
                  <div className="effect-preview">
                    <span>
                      {date} 기준
                      <br />
                      {data.assets.find((a) => a.id === from)?.name}:{' '}
                      {balances[from] == null
                        ? '기준일 확인 필요'
                        : `${won(balances[from])}원 → ${won(balances[from] - amount)}원`}
                      <br />
                      {data.assets.find((a) => a.id === to)?.name}:{' '}
                      {balances[to] == null
                        ? '기준일 확인 필요'
                        : `${won(balances[to])}원 → ${won(balances[to] + amount)}원`}
                    </span>
                  </div>
                )}
                {editor.type === 'adjustment' && (
                  <div className="effect-preview">
                    <span>
                      {date} 기준{' '}
                      {baseBalance === null ? '기준일 확인 필요' : `${won(baseBalance)}원`} → 확인한
                      잔액 {won(amount)}원<br />
                      <strong>
                        조정액{' '}
                        {baseBalance === null
                          ? '—'
                          : `${amount - baseBalance > 0 ? '+' : ''}${won(amount - baseBalance)}원`}
                      </strong>
                      <br />
                      해당 날짜의 잔액과 차액을 기록해요. 이후 변동은 유지하고 수입·지출·저축
                      실적에는 포함하지 않아요.
                    </span>
                  </div>
                )}
                <label>
                  날짜
                  <DateField required value={date} onValueChange={(value) => setDate(value)} />
                </label>
                <label>
                  {editor.type === 'transfer' ? '이동 내용' : '조정 사유'}
                  <input
                    required
                    maxLength={240}
                    placeholder={
                      editor.type === 'transfer' ? '예: 적금 납입' : '예: 월말 실제 잔액 확인'
                    }
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
                {editor.type === 'transfer' && (
                  <p className="small muted">
                    두 자산 사이에서 금액을 옮겨요. 가계부 수입·지출에는 추가하지 않아요.
                  </p>
                )}
              </>
            )}
          </fieldset>
        </div>
        <div className="form-footer">
          <div className="footer-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={locked}>
              닫기
            </button>
            <button className="primary" type="submit" disabled={busy || tagPending || conflict}>
              {busy
                ? '반영 중…'
                : uncertain
                  ? '저장 결과 다시 확인'
                  : editor.type === 'void'
                    ? '변동 취소 확인'
                    : '저장'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
