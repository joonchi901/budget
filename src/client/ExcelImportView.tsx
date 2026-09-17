import { SelectField, SelectOption, SelectGroup } from './SelectField';
import { FileField } from './FileField';
import { useRef, useState } from 'react';
import { UgaIcon } from './brand/Uga';
import type { Bootstrap } from '../shared/types';
import type { BudgetBackup, RestorePreview } from '../shared/data';
import { originalTransactions, readXlsx, cellValue, type Workbook } from '../shared/xlsx';
import { extractWorkbookManagement } from '../shared/xlsx-management';
import {
  buildWorkbookImport,
  type WorkbookImportOptions,
  type WorkbookImportResult,
} from '../shared/xlsx-import';
import { RequestError, request } from './api';
import { useUnsavedGuard, won } from './components';

interface Props {
  data: Bootstrap;
  onChanged(): Promise<void>;
  onNotice(message: string): void;
}
export default function ExcelImportView({ data, onChanged, onNotice }: Props) {
  const isAdmin = data.user.role === 'admin';
  const [book, setBook] = useState<Workbook | null>(null),
    [fileName, setFileName] = useState('');
  const [sourceId, setSourceId] = useState(''),
    [ledgerId, setLedgerId] = useState(data.ledgers.find((l) => !l.archived)?.id ?? '');
  const [newLedgerName, setNewLedgerName] = useState('엑셀 가계부');
  const [payments, setPayments] = useState<NonNullable<WorkbookImportOptions['payments']>>({});
  const [corrections, setCorrections] = useState<NonNullable<WorkbookImportOptions['corrections']>>(
    {},
  );
  const [savings, setSavings] = useState<NonNullable<WorkbookImportOptions['savings']>>({});
  const [reserve, setReserve] = useState<NonNullable<WorkbookImportOptions['reserveExpenses']>>({});
  const [preview, setPreview] = useState<{
    local: WorkbookImportResult;
    server: RestorePreview;
  } | null>(null);
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [uncertain, setUncertain] = useState(false);
  const pending = useRef<Record<string, unknown> | null>(null);
  useUnsavedGuard(busy || uncertain);
  const rows = book ? originalTransactions(book) : [];
  const effectiveRows = rows.map((row) => ({ ...row, ...corrections[row.rowId] }));
  const management = book ? extractWorkbookManagement(book) : null;
  const names = [
    ...new Set([
      ...rows.map((r) => r.payment),
      ...Array.from({ length: 10 }, (_, i) =>
        book ? String(cellValue(book, '설정', `${String.fromCharCode(67 + i)}2`) ?? '').trim() : '',
      ).filter(Boolean),
    ]),
  ];
  const savingNames = [
    ...new Set(effectiveRows.filter((r) => r.major.trim() === '저축').map((r) => r.minor.trim())),
  ];
  const invalidRows = rows.filter((r) => r.errors.length || !r.description);
  const assets = data.assets.filter((a) => a.kind === 'asset' && !a.archived);
  const clearPreview = () => {
    setPreview(null);
    setConfirmed(false);
    setError('');
  };
  async function load(file?: File) {
    if (!file) return;
    clearPreview();
    setBook(null);
    setBusy(true);
    try {
      const value = readXlsx(new Uint8Array(await file.arrayBuffer()));
      if (!value.sheets.some((s) => s.name === '설정'))
        throw new Error('기존 가계부와 같은 형식의 XLSX를 선택해 주세요.');
      setBook(value);
      setFileName(file.name);
      setSourceId(file.name);
      setPayments({});
      setCorrections({});
      setSavings({});
      setReserve({});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function inspect() {
    if (!book || !isAdmin) return;
    setBusy(true);
    clearPreview();
    try {
      const current = await request<BudgetBackup>('/api/data/backup');
      const local = await buildWorkbookImport(book, current, {
        sourceId,
        ledgerId,
        newLedgerName: ledgerId === '@new' ? newLedgerName : undefined,
        actorId: data.user.id,
        payments,
        corrections,
        savings,
        reserveExpenses: reserve,
      });
      const server = await request<RestorePreview>('/api/data/restore/preview', 'POST', {
        backup: local.backup,
        baseRevision: local.backup.sourceRevision,
        mode: 'replace',
        memberMap: Object.fromEntries(current.members.map((m) => [m.id, m.id])),
      });
      setPreview({ local, server });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (busy || !isAdmin) return;
    if (!pending.current && preview && confirmed && !preview.server.issues.length)
      pending.current = {
        mutationId: crypto.randomUUID(),
        backup: preview.local.backup,
        mode: 'replace',
        confirmReplace: true,
        memberMap: Object.fromEntries(preview.local.backup.members.map((m) => [m.id, m.id])),
        expectedRevision: preview.server.revision,
        baseRevision: preview.local.backup.sourceRevision,
        digest: preview.server.digest,
      };
    if (!pending.current) return;
    setBusy(true);
    setError('');
    try {
      await request('/api/data/restore', 'POST', pending.current);
      pending.current = null;
      setUncertain(false);
      setPreview(null);
      setConfirmed(false);
      await onChanged();
      onNotice('엑셀 자료를 반영했어요. 확인이 필요한 원문은 아래 검토함에 보존했어요.');
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof RequestError && e.status > 0 && e.status < 500) {
        pending.current = null;
        setUncertain(false);
        clearPreview();
        setError((e as Error).message);
        if (e.status === 403 || e.status === 409) await onChanged();
      } else setUncertain(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel data-panel" aria-label="엑셀 가져오기">
      <h2>
        <UgaIcon name="data" size={24} /> 기존 엑셀 가져오기
      </h2>
      <p className="muted small">
        월별 거래·계획·카드·통장·자산·분류를 함께 읽어요. 원본 수식은 실행하지 않고 저장된 값과
        메모를 사용해요. 의료비 전용 정산 시트는 제외해요.
      </p>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {uncertain && (
        <div className="alert">
          반영 결과를 아직 확인하지 못했어요.{' '}
          <button disabled={busy} onClick={() => void apply()}>
            같은 요청으로 결과 확인
          </button>
        </div>
      )}
      {!isAdmin && (
        <p className="small muted">
          가계부와 관리 항목을 함께 구성하는 엑셀 가져오기는 관리자만 할 수 있어요. 기존 가계부에
          거래를 추가하려면 CSV 가져오기를 이용해 주세요.
        </p>
      )}
      <fieldset disabled={busy || uncertain || !isAdmin}>
        <label>
          원본 가계부 XLSX
          <FileField accept=".xlsx" onChange={(e) => void load(e.target.files?.[0])} />
        </label>
        {book && (
          <>
            <p>
              <strong>{fileName}</strong> · {book.sheets.length}개 시트 · 월별 금액 기록{' '}
              {rows.length}행
            </p>
            <div className="data-column-mapping">
              <label>
                원본 식별자
                <input
                  value={sourceId}
                  maxLength={160}
                  onChange={(e) => {
                    setSourceId(e.target.value);
                    clearPreview();
                  }}
                />
                <small>
                  같은 원본을 다시 가져올 때 이 값을 유지하면 원본 위치로 중복을 확인해요.
                </small>
              </label>
              <label>
                가져올 가계부
                <SelectField
                  value={ledgerId}
                  onValueChange={(value) => {
                    setLedgerId(value);
                    clearPreview();
                  }}
                >
                  <SelectOption value="@new">새 독립 가계부</SelectOption>
                  {data.ledgers
                    .filter((l) => !l.archived)
                    .map((l) => (
                      <SelectOption key={l.id} value={l.id}>
                        {l.name}
                      </SelectOption>
                    ))}
                </SelectField>
              </label>
              {ledgerId === '@new' && (
                <label>
                  새 가계부 이름
                  <input
                    value={newLedgerName}
                    maxLength={80}
                    onChange={(e) => {
                      setNewLedgerName(e.target.value);
                      clearPreview();
                    }}
                  />
                </label>
              )}
            </div>
            <details open>
              <summary>결제수단 연결 ({names.length})</summary>
              <p className="small muted">
                원본 카드 관리와 이름이 정확히 일치하면 연결해요. 다른 이름은 기존 항목 또는 새
                항목의 종류를 선택해 주세요. 미지정 거래는 검토함에 보관해요.
              </p>
              <div className="data-column-mapping">
                {names.map((name) => (
                  <label key={name}>
                    원본: {name || '(미기록)'}
                    <SelectField
                      aria-label={`엑셀 결제수단 ${name || '미기록'}`}
                      value={payments[name] ?? ''}
                      onValueChange={(value) => {
                        setPayments((old) => ({ ...old, [name]: value }));
                        clearPreview();
                      }}
                    >
                      <SelectOption value="">
                        {management?.payments.filter((p) => p.name === name).length === 1
                          ? '원본 관리 항목에 연결'
                          : '미지정 · 검토함에 보관'}
                      </SelectOption>
                      <SelectGroup label="현재 결제수단">
                        {data.paymentMethods
                          .filter((p) => !p.archived)
                          .map((p) => (
                            <SelectOption key={p.id} value={p.id}>
                              {p.name}
                            </SelectOption>
                          ))}
                      </SelectGroup>
                      <SelectGroup label="원본 관리 항목">
                        {management?.payments.map((p) => (
                          <SelectOption key={p.key} value={`@source:${p.key}`}>
                            {p.name} · {p.source}
                          </SelectOption>
                        ))}
                      </SelectGroup>
                      <SelectGroup label="원본 이름으로 새로 등록">
                        <SelectOption value="@new:card">카드</SelectOption>
                        <SelectOption value="@new:account">통장</SelectOption>
                        <SelectOption value="@new:cash">현금</SelectOption>
                      </SelectGroup>
                    </SelectField>
                  </label>
                ))}
              </div>
            </details>
            {invalidRows.length > 0 && (
              <details>
                <summary>불완전한 월별 기록 보완 ({invalidRows.length})</summary>
                <p className="small muted">
                  원문은 그대로 보관하며 아래에서 지정한 값을 사용해요. 미입력 행도 검토함에 남아요.
                </p>
                <div className="data-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>원본</th>
                        <th>금액</th>
                        <th>날짜</th>
                        <th>내역</th>
                        <th>분류</th>
                        <th>내역 분류</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invalidRows.map((raw) => {
                        const row = { ...raw, ...corrections[raw.rowId] };
                        return (
                          <tr key={raw.rowId}>
                            <td>{raw.rowId}</td>
                            <td>{won(row.amount)}원</td>
                            {(['date', 'description', 'major', 'minor'] as const).map((key) => (
                              <td key={key}>
                                <input
                                  aria-label={`${raw.rowId} ${key}`}
                                  type={key === 'date' ? 'date' : 'text'}
                                  value={row[key]}
                                  onChange={(e) => {
                                    setCorrections((old) => ({
                                      ...old,
                                      [raw.rowId]: { ...old[raw.rowId], [key]: e.target.value },
                                    }));
                                    clearPreview();
                                  }}
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
            {savingNames.length > 0 && (
              <details>
                <summary>
                  저축 기록의 자산 이동 연결 (
                  {effectiveRows.filter((r) => r.major.trim() === '저축').length}행)
                </summary>
                <p className="small muted">
                  입출금 자산을 지정한 기록만 자산 이동으로 반영해요. 자산의 저축 집계 설정을 따르며
                  수입·지출을 만들지 않아요. 원본 관측일 이전 잔액은 임의로 추정하지 않아요.
                </p>
                {savingNames.map((name) => (
                  <div className="data-column-mapping" key={name}>
                    <strong>{name}</strong>
                    {(['fromAssetId', 'toAssetId'] as const).map((key) => (
                      <label key={key}>
                        {key === 'fromAssetId' ? '출금 자산' : '입금 자산'}
                        <SelectField
                          aria-label={`저축 ${name} ${key}`}
                          value={savings[name]?.[key] ?? ''}
                          onValueChange={(value) => {
                            setSavings((old) => ({
                              ...old,
                              [name]: {
                                ...(old[name] ?? { fromAssetId: '', toAssetId: '' }),
                                [key]: value,
                              },
                            }));
                            clearPreview();
                          }}
                        >
                          <SelectOption value="">미지정 · 검토함에 보관</SelectOption>
                          {assets.map((a) => (
                            <SelectOption key={a.id} value={a.id}>
                              {a.name} · 기준일 {a.openingDate ?? '미확인'}
                            </SelectOption>
                          ))}
                        </SelectField>
                      </label>
                    ))}
                  </div>
                ))}
              </details>
            )}
            {!!management?.reserveRows.length && (
              <details>
                <summary>예비금 원본과 지출 중복 확인 ({management.reserveRows.length}행)</summary>
                <p className="small muted">
                  월별 원장에 이미 기록한 지출은 아래에서 추가하지 않고, 이관 후 해당 거래에 자산
                  배분을 지정해 주세요. 별도 지출이 확실한 행만 자산과 결제수단을 선택해요. 입금의
                  성격은 검토함에서 확인할 수 있어요.
                </p>
                <div className="data-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>원본</th>
                        <th>종류·날짜</th>
                        <th>내역</th>
                        <th>금액</th>
                        <th>차감 자산</th>
                        <th>결제수단</th>
                      </tr>
                    </thead>
                    <tbody>
                      {management.reserveRows.map((r) => (
                        <tr key={r.key}>
                          <td>{r.source}</td>
                          <td>
                            {r.kind === 'deposit' ? '유입' : '사용'}
                            <br />
                            {r.date ?? '일자 미확인'}
                          </td>
                          <td>{r.description}</td>
                          <td>{won(r.amount)}</td>
                          <td>
                            {r.kind === 'expense' && (
                              <SelectField
                                aria-label={`${r.key} 차감 자산`}
                                value={reserve[r.key]?.assetId ?? ''}
                                onValueChange={(value) => {
                                  setReserve((old) => ({
                                    ...old,
                                    [r.key]: {
                                      ...(old[r.key] ?? { paymentMethodId: '', assetId: '' }),
                                      assetId: value,
                                    },
                                  }));
                                  clearPreview();
                                }}
                              >
                                <SelectOption value="">추가하지 않음</SelectOption>
                                {assets.map((a) => (
                                  <SelectOption key={a.id} value={a.id}>
                                    {a.name}
                                  </SelectOption>
                                ))}
                              </SelectField>
                            )}
                          </td>
                          <td>
                            {r.kind === 'expense' && (
                              <SelectField
                                aria-label={`${r.key} 결제수단`}
                                value={reserve[r.key]?.paymentMethodId ?? ''}
                                onValueChange={(value) => {
                                  setReserve((old) => ({
                                    ...old,
                                    [r.key]: {
                                      ...(old[r.key] ?? { assetId: '', paymentMethodId: '' }),
                                      paymentMethodId: value,
                                    },
                                  }));
                                  clearPreview();
                                }}
                              >
                                <SelectOption value="">선택해 주세요</SelectOption>
                                {data.paymentMethods
                                  .filter((p) => !p.archived)
                                  .map((p) => (
                                    <SelectOption key={p.id} value={p.id}>
                                      {p.name}
                                    </SelectOption>
                                  ))}
                              </SelectField>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
            <div className="data-actions">
              <button
                className="secondary"
                disabled={!sourceId.trim() || (ledgerId === '@new' && !newLedgerName.trim())}
                onClick={() => void inspect()}
              >
                {busy ? '대조 중…' : '엑셀 반영 미리보기'}
              </button>
            </div>
          </>
        )}
      </fieldset>
      {preview && (
        <div className="data-preview">
          <h3>반영할 내용</h3>
          <p>
            거래 {preview.local.transactions.count}건 · 수입{' '}
            {won(preview.local.transactions.income)}원 · 지출{' '}
            {won(preview.local.transactions.expense)}원<br />
            자산 {preview.local.counts.assets}개 · 카드·통장 {preview.local.counts.payment_methods}
            개 · 계획 {preview.local.counts.planning_records}개 · 기존 원본{' '}
            {preview.local.duplicates}건 유지
          </p>
          <p className="small muted">
            현재 기록에 새 자료를 추가해요. 거래의 기본 귀속은 공동이며, 수입·지출의 자산 배분은
            별도로 지정해요. 월말 관측 잔액은 저축 실적이 되지 않아요.
          </p>
          <p>
            자산 이동 {preview.local.assetOperations.filter((op) => op.type === 'transfer').length}
            건 · 이동 금액{' '}
            {won(
              preview.local.assetOperations
                .filter((op) => op.type === 'transfer')
                .reduce((sum, op) => sum + Number(op.amount), 0),
            )}
            원 · 월말 관측 조정{' '}
            {preview.local.assetOperations.filter((op) => op.type === 'adjustment').length}건
          </p>
          {preview.local.assetBalances.length > 0 && (
            <details>
              <summary>새 자산의 기준 잔액과 관측 결과</summary>
              <div className="data-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>자산</th>
                      <th>첫 관측일</th>
                      <th>기준 잔액</th>
                      <th>반영 후 잔액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.local.assetBalances.map((a, i) => (
                      <tr key={i}>
                        <td>{a.name}</td>
                        <td>{a.openingDate ?? '미확인'}</td>
                        <td>{a.openingDate ? won(a.openingBalance) : '미확인'}</td>
                        <td>{a.openingDate ? won(a.balance) : '미확인'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          {preview.local.assetOperations.length > 0 && (
            <details>
              <summary>자산 변동 상세 확인</summary>
              <div className="data-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>종류</th>
                      <th>출금 → 입금 / 관측 자산</th>
                      <th>이동 금액 / 조정 차액</th>
                      <th>목표 잔액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.local.assetOperations.map((op) => {
                      const assetName = (id: string | number | null) =>
                        preview.local.backup.tables.assets.find((a) => a.id === id)?.name ??
                        '미확인';
                      return (
                        <tr key={String(op.id)}>
                          <td>{op.date}</td>
                          <td>{op.type === 'transfer' ? '자산 이동' : '관측 조정'}</td>
                          <td>
                            {op.type === 'transfer'
                              ? `${assetName(op.from_asset_id)} → ${assetName(op.to_asset_id)}`
                              : assetName(op.asset_id)}
                          </td>
                          <td>{won(Number(op.amount))}</td>
                          <td>
                            {op.target_balance === null ? '—' : won(Number(op.target_balance))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          <div className="data-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>거래 월</th>
                  <th>건수</th>
                  <th>수입</th>
                  <th>지출</th>
                </tr>
              </thead>
              <tbody>
                {preview.local.monthly.map((m) => (
                  <tr key={m.month}>
                    <td>{m.month}</td>
                    <td>{m.count}</td>
                    <td>{won(m.income)}</td>
                    <td>{won(m.expense)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.server.issues.length > 0 && (
            <ul className="data-errors">
              {preview.server.issues.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
          )}
          <details>
            <summary>검토함에 보존할 자료 {preview.local.pending.length}건</summary>
            <ul className="data-errors">
              {preview.local.pending.map((v, i) => (
                <li key={i}>
                  <strong>{v.source}</strong> · {v.message}
                </li>
              ))}
            </ul>
          </details>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || uncertain}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            금액·연결과 미확정 자료의 검토함 보존을 확인했어요.
          </label>
          <button
            className="primary"
            disabled={busy || uncertain || !confirmed || preview.server.issues.length > 0}
            onClick={() => void apply()}
          >
            엑셀 자료 반영
          </button>
        </div>
      )}
    </section>
  );
}
