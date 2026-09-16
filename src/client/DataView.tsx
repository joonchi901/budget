import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, History, Upload } from 'lucide-react';
import type { Bootstrap } from '../shared/types';
import {
  backupTables,
  csvImportRows,
  csvMappingLabels,
  defaultCsvMapping,
  parseCsv,
  transactionsCsv,
  type BudgetBackup,
  type CsvMapping,
  type ImportPreview,
  type ImportRow,
  type RestorePreview,
  type SourceRecord,
  type RecordHistory,
} from '../shared/data';
import { request, RequestError } from './api';
import { Dialog, useUnsavedGuard, won } from './components';
import './data.css';
interface Props {
  data: Bootstrap;
  onChanged(): Promise<void>;
  onNotice(message: string): void;
  excelImport?: ReactNode;
}
const tableNames: Record<string, string> = {
  ledgers: '가계부',
  tag_groups: '태그 유형',
  tags: '태그',
  assets: '자산',
  payment_methods: '카드·통장',
  rules: '기존 규칙',
  transactions: '거래',
  asset_operations: '자산 이동·조정',
  asset_movements: '기존 자산 기록',
  asset_effects: '자산 반영 기록',
  planning_records: '예산·목표·계획',
  import_records: '가져오기 출처',
  source_records: '원본 검토 자료',
  record_history: '수정 전후 이력',
};
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function DataView({ data, onChanged, onNotice, excelImport }: Props) {
  const [backup, setBackup] = useState<BudgetBackup | null>(null),
    [fileName, setFileName] = useState(''),
    [memberMap, setMemberMap] = useState<Record<string, string>>({}),
    [restore, setRestore] = useState<RestorePreview | null>(null),
    [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [csv, setCsv] = useState<string[][]>([]),
    [mapping, setMapping] = useState<CsvMapping>(defaultCsvMapping([])),
    [sourceId, setSourceId] = useState(''),
    [ledgerId, setLedgerId] = useState(data.ledgers.find((l) => !l.archived)?.id ?? ''),
    [importRows, setImportRows] = useState<ImportRow[]>([]),
    [importPreview, setImportPreview] = useState<ImportPreview | null>(null),
    [importConfirmed, setImportConfirmed] = useState(false),
    [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [uncertain, setUncertain] = useState(false);
  const pending = useRef<{ url: string; body: Record<string, unknown> } | null>(null);
  const [history, setHistory] = useState<RecordHistory[]>([]),
    [historyError, setHistoryError] = useState('');
  useUnsavedGuard(busy || uncertain);
  useEffect(() => {
    let cancelled = false;
    void request<typeof history>('/api/data/history')
      .then((rows) => {
        if (!cancelled) {
          setHistory(rows);
          setHistoryError('');
        }
      })
      .catch(() => {
        if (!cancelled) setHistoryError('변경 이력을 불러오지 못했어요.');
      });
    return () => {
      cancelled = true;
    };
  }, [data.revision]);
  async function exportJson() {
    setBusy(true);
    setError('');
    try {
      const result = await request<BudgetBackup>('/api/data/backup');
      download(
        `가계부-백업-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(result, null, 2),
        'application/json',
      );
      onNotice('가계부 백업 파일을 내려받았어요.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadBackup(file?: File) {
    if (!file) return;
    setError('');
    setRestore(null);
    setReplaceConfirmed(false);
    setBackup(null);
    try {
      if (file.size > 12_000_000) throw new Error('파일은 12MB 이하로 선택해 주세요.');
      const value = JSON.parse(await file.text()) as BudgetBackup;
      if (value.format !== 'our-budget' || !Array.isArray(value.members))
        throw new Error('가계부 JSON 백업 파일을 선택해 주세요.');
      setBackup(value);
      setFileName(file.name);
      setMemberMap(
        Object.fromEntries(
          value.members.map((m) => [m.id, data.users.some((u) => u.id === m.id) ? m.id : '']),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function previewJson() {
    if (!backup) return;
    setBusy(true);
    setError('');
    setReplaceConfirmed(false);
    try {
      setRestore(
        await request<RestorePreview>('/api/data/restore/preview', 'POST', {
          backup,
          mode: 'replace',
          memberMap,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadCsv(file?: File) {
    if (!file) return;
    setError('');
    setImportPreview(null);
    setImportConfirmed(false);
    setCsvErrors([]);
    try {
      if (file.size > 12_000_000) throw new Error('파일은 12MB 이하로 선택해 주세요.');
      const rows = parseCsv(await file.text());
      setCsv(rows);
      setMapping(defaultCsvMapping(rows[0] ?? []));
      setSourceId(file.name);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function previewCsv() {
    setBusy(true);
    setError('');
    setImportConfirmed(false);
    setImportPreview(null);
    try {
      const converted = csvImportRows(csv, mapping, ledgerId, data);
      setCsvErrors(converted.errors);
      setImportRows(converted.rows);
      if (converted.errors.length) return;
      setImportPreview(
        await request<ImportPreview>('/api/data/import/preview', 'POST', {
          sourceId,
          rows: converted.rows,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function apply(kind: 'restore' | 'import') {
    if (busy) return;
    if (!pending.current) {
      if (kind === 'restore' && restore && backup && replaceConfirmed)
        pending.current = {
          url: '/api/data/restore',
          body: {
            backup,
            mode: 'replace',
            memberMap,
            digest: restore.digest,
            expectedRevision: restore.revision,
            confirmReplace: true,
            mutationId: crypto.randomUUID(),
          },
        };
      if (kind === 'import' && importPreview && importConfirmed)
        pending.current = {
          url: '/api/data/import',
          body: {
            sourceId,
            rows: importRows,
            digest: importPreview.digest,
            expectedRevision: importPreview.revision,
            confirmImport: true,
            mutationId: crypto.randomUUID(),
          },
        };
    }
    if (!pending.current) return;
    setBusy(true);
    setError('');
    try {
      const op = pending.current;
      const result = await request<{ imported?: number; duplicates?: number }>(
        op.url,
        'POST',
        op.body,
      );
      pending.current = null;
      setUncertain(false);
      setRestore(null);
      setImportPreview(null);
      setBackup(null);
      setCsv([]);
      setReplaceConfirmed(false);
      setImportConfirmed(false);
      await onChanged();
      onNotice(
        kind === 'restore'
          ? '백업을 복원했어요.'
          : `${result.imported ?? 0}건을 가져왔어요. 중복 ${result.duplicates ?? 0}건은 유지했어요.`,
      );
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof RequestError && e.status > 0 && e.status < 500) {
        pending.current = null;
        setUncertain(false);
        setRestore(null);
        setImportPreview(null);
        setReplaceConfirmed(false);
        setImportConfirmed(false);
        if (e.status === 409) await onChanged();
      } else setUncertain(true);
    } finally {
      setBusy(false);
    }
  }
  const locked = busy || uncertain;
  return (
    <div className="data-workspace">
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {uncertain && (
        <div className="alert">
          <p>저장 결과를 확인하지 못했어요. 입력을 바꾸지 않고 같은 요청으로 확인해 주세요.</p>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void apply(pending.current?.url.endsWith('restore') ? 'restore' : 'import')
            }
          >
            저장 결과 다시 확인
          </button>
        </div>
      )}
      {excelImport}
      <SourceInbox data={data} onChanged={onChanged} onNotice={onNotice} disabled={locked} />
      <section className="panel data-panel">
        <div className="section-heading">
          <div>
            <h2>백업 · 내보내기</h2>
            <p className="muted small">
              JSON은 전체 복원용, CSV는 현재 거래 목록을 확인하는 용도예요.
            </p>
          </div>
          <Download size={20} />
        </div>
        <div className="data-actions">
          <button className="primary" disabled={locked} onClick={() => void exportJson()}>
            전체 JSON 백업
          </button>
          <button
            className="secondary"
            disabled={locked}
            onClick={() =>
              download('가계부-거래.csv', transactionsCsv(data), 'text/csv;charset=utf-8')
            }
          >
            거래 CSV 내보내기
          </button>
        </div>
        <p className="small muted">
          보관·삭제 기록과 자산 반영 이력도 백업해요. 로그인 정보와 세션은 포함하지 않아요. 계좌번호
          등 입력한 정보가 파일에 포함되므로 개인 저장 공간에 보관해 주세요.
        </p>
      </section>
      <section className="panel data-panel">
        <div className="section-heading">
          <div>
            <h2>JSON 백업 복원</h2>
            <p className="muted small">
              현재 가구의 모든 가계부 자료를 백업 내용으로 교체해요. 복원 전에 현재 자료를 백업할 수
              있어요.
            </p>
          </div>
          <Upload size={20} />
        </div>
        <fieldset disabled={locked}>
          <label>
            복원할 JSON 파일
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => void loadBackup(e.target.files?.[0])}
            />
          </label>
          {backup && (
            <>
              <p>{fileName}</p>
              <div className="data-member-mapping">
                {backup.members.map((member) => (
                  <label key={member.id}>
                    원본 {member.name} → 현재 구성원
                    <select
                      value={memberMap[member.id] ?? ''}
                      onChange={(e) => {
                        setMemberMap((old) => ({ ...old, [member.id]: e.target.value }));
                        setRestore(null);
                        setReplaceConfirmed(false);
                      }}
                    >
                      <option value="">선택해 주세요</option>
                      {data.users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <button type="button" className="secondary" onClick={() => void previewJson()}>
                복원 내용 검사
              </button>
            </>
          )}
          {restore && (
            <div className="data-preview">
              <h3>교체될 자료</h3>
              <div className="data-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>항목</th>
                      <th>현재</th>
                      <th>복원 후</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backupTables.map((table) => (
                      <tr key={table}>
                        <td>{tableNames[table]}</td>
                        <td>{restore.currentCounts[table]}</td>
                        <td>{restore.counts[table]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {restore.issues.length > 0 ? (
                <ul className="data-errors">
                  {restore.issues.map((issue, index) => (
                    <li key={index}>{issue}</li>
                  ))}
                </ul>
              ) : (
                <>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={replaceConfirmed}
                      onChange={(e) => setReplaceConfirmed(e.target.checked)}
                    />{' '}
                    구성원 연결과 교체 내용을 확인했으며 현재 가구의 자료 전체를 교체합니다.
                  </label>
                  <button
                    type="button"
                    className="primary"
                    disabled={!replaceConfirmed || restore.revision !== data.revision}
                    onClick={() => void apply('restore')}
                  >
                    확인한 백업으로 전체 복원
                  </button>
                </>
              )}
              {restore.revision !== data.revision && (
                <p className="alert">다른 변경이 반영되었어요. 복원 내용을 다시 검사해 주세요.</p>
              )}
            </div>
          )}
        </fieldset>
      </section>
      <section className="panel data-panel">
        <div className="section-heading">
          <div>
            <h2>CSV 거래 가져오기</h2>
            <p className="muted small">
              기존 결제수단과 태그에 연결한 뒤, 오류와 합계를 확인하고 가져와요.
            </p>
          </div>
          <Upload size={20} />
        </div>
        <fieldset disabled={locked}>
          <label>
            CSV 파일
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void loadCsv(e.target.files?.[0])}
            />
          </label>
          {csv.length > 0 && (
            <>
              <div className="form-grid">
                <label>
                  원본 자료 ID
                  <input
                    required
                    maxLength={240}
                    value={sourceId}
                    onChange={(e) => {
                      setSourceId(e.target.value);
                      setImportPreview(null);
                    }}
                  />
                  <span className="small muted">
                    같은 자료는 같은 ID를 사용해요. 원본 행 ID와 함께 중복을 구분해요.
                  </span>
                </label>
                <label>
                  가져올 가계부
                  <select
                    value={ledgerId}
                    onChange={(e) => {
                      setLedgerId(e.target.value);
                      setImportPreview(null);
                    }}
                  >
                    <option value="">선택해 주세요</option>
                    {data.ledgers
                      .filter((l) => !l.archived)
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <div className="data-column-mapping">
                {(Object.keys(csvMappingLabels) as (keyof CsvMapping)[]).map((key) => (
                  <label key={key}>
                    {csvMappingLabels[key]}
                    {key === 'tags' || key === 'owner' ? ' (선택)' : ''}
                    <select
                      value={mapping[key]}
                      onChange={(e) => {
                        setMapping((old) => ({ ...old, [key]: e.target.value }));
                        setImportPreview(null);
                      }}
                    >
                      <option value="">연결 안 함</option>
                      {csv[0].map((header, index) => (
                        <option key={index} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <p className="small muted">
                원본 행 ID는 재수출해도 바뀌지 않는 고유 번호를 사용해요. 태그는 |로 구분하며,
                이름이 겹치면 유형:옵션으로 입력해요. 이 화면은 수입·지출 거래를 가져오며 자산
                배분은 거래 수정에서 지정할 수 있어요.
              </p>
              <button type="button" className="secondary" onClick={() => void previewCsv()}>
                가져올 내역 검사
              </button>
            </>
          )}
          {csvErrors.length > 0 && (
            <ul className="data-errors">
              {csvErrors.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          )}
          {importPreview && (
            <div className="data-preview">
              <h3>가져오기 미리보기</h3>
              <p>
                새 내역 {importPreview.ready}건 · 중복 {importPreview.duplicate}건 · 오류{' '}
                {importPreview.errors}건
              </p>
              <p>
                새 수입 {won(importPreview.income)}원 · 새 지출 {won(importPreview.expense)}원
              </p>
              <div className="data-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>원본 행</th>
                      <th>날짜</th>
                      <th>내역</th>
                      <th>금액</th>
                      <th>검사 결과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.map((row, index) => (
                      <tr key={index}>
                        <td>{row.rowId}</td>
                        <td>{row.transaction.date}</td>
                        <td>{row.transaction.description}</td>
                        <td>{won(row.transaction.amount)}</td>
                        <td>
                          {row.errors.length
                            ? row.errors.join(' ')
                            : row.status === 'duplicate'
                              ? '이미 가져옴'
                              : '가져오기 가능'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={importConfirmed}
                  onChange={(e) => setImportConfirmed(e.target.checked)}
                />{' '}
                원본 행, 거래 내용과 합계를 확인했습니다.
              </label>
              <button
                type="button"
                className="primary"
                disabled={
                  !importConfirmed ||
                  importPreview.errors > 0 ||
                  importPreview.revision !== data.revision
                }
                onClick={() => void apply('import')}
              >
                확인한 거래 가져오기
              </button>
              {importPreview.revision !== data.revision && (
                <p className="alert">다른 변경이 반영되었어요. 내역을 다시 검사해 주세요.</p>
              )}
            </div>
          )}
        </fieldset>
      </section>
      <section className="panel data-panel">
        <div className="section-heading">
          <h2>
            <History size={18} /> 최근 변경 이력
          </h2>
          <span className="small muted">최근 100건</span>
        </div>
        {historyError && <p role="alert">{historyError}</p>}
        <div className="data-history">
          {history.map((row) => (
            <details key={row.id} className="history-entry">
              <summary>
                <span>{row.actorName}</span>
                <span>
                  {historyEntityLabel(row.entityType)} · {historyActionLabels[row.action]}
                </span>
                <time>{new Date(row.createdAt).toLocaleString('ko-KR')}</time>
                <span className="muted small">#{row.revision}</span>
              </summary>
              {row.action === 'unknown' ? (
                <p className="muted">
                  이 기능이 적용되기 전 변경으로, 수정 전후 값은 미확인이에요.
                </p>
              ) : (
                <HistoryComparison row={row} data={data} />
              )}
            </details>
          ))}
          {!history.length && !historyError && <p className="muted">아직 변경 이력이 없어요.</p>}
        </div>
        <p className="small muted">
          항목을 펼치면 저장 당시의 수정 전후 값을 비교할 수 있어요. 기존 자료의 최초 작성자와 과거
          수정 값은 확인된 기록이 없으면 미확인으로 표시해요.
        </p>
      </section>
    </div>
  );
}

const sourceStatusLabels = { pending: '검토 필요', resolved: '검토 완료', reference: '참고 자료' };
const sourceKindLabels = {
  transaction: '거래',
  plan: '예산·계획',
  management: '관리 정보',
  reference: '참고',
};
function SourceInbox({ data, onChanged, onNotice, disabled }: Props & { disabled: boolean }) {
  const [records, setRecords] = useState<SourceRecord[]>([]),
    [error, setError] = useState(''),
    [status, setStatus] = useState('pending'),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(0),
    [editor, setEditor] = useState<SourceRecord | null>(null);
  useEffect(() => {
    let cancelled = false;
    void request<SourceRecord[]>('/api/data/source-records')
      .then((rows) => {
        if (!cancelled) {
          setRecords(rows);
          setError('');
        }
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [data.revision]);
  const filtered = records.filter(
    (r) =>
      (!status || r.status === status) &&
      `${r.sourceId} ${r.sourceLocation} ${r.note}`.toLowerCase().includes(search.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 50)),
    currentPage = Math.min(page, pages - 1),
    visible = filtered.slice(currentPage * 50, (currentPage + 1) * 50);
  return (
    <section className="panel data-panel">
      <div className="section-heading">
        <div>
          <h2>원본 자료 검토함</h2>
          <p className="muted small">
            날짜·분류가 불완전한 행과 원본 메모를 보관해요. 검토 완료로 바꿔도 거래나 자산을
            자동으로 만들지 않아요.
          </p>
        </div>
        <span className="badge">
          검토 필요 {records.filter((r) => r.status === 'pending').length}건
        </span>
      </div>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <div className="data-source-filters">
        <label>
          검토 상태
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="">전체</option>
            {Object.entries(sourceStatusLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          출처·메모 검색
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="시트 이름, 셀 위치, 메모"
          />
        </label>
      </div>
      <div className="data-source-list">
        {visible.map((record) => (
          <article key={record.id}>
            <div className="data-source-heading">
              <div>
                <strong>{record.sourceLocation}</strong>
                <p className="small muted">
                  {record.sourceId} · {sourceKindLabels[record.kind]} ·{' '}
                  {sourceStatusLabels[record.status]}
                </p>
              </div>
              <button className="secondary" disabled={disabled} onClick={() => setEditor(record)}>
                검토 메모·상태
              </button>
            </div>
            {record.note && <p className="data-source-note">{record.note}</p>}
            <details>
              <summary>원본 내용 보기</summary>
              <pre>{JSON.stringify(record.payload, null, 2)}</pre>
            </details>
          </article>
        ))}
        {!visible.length && !error && (
          <p className="muted">이 조건에 맞는 원본 검토 자료가 없어요.</p>
        )}
      </div>
      {pages > 1 && (
        <div className="data-actions">
          <button
            className="secondary"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            이전
          </button>
          <span>
            {currentPage + 1} / {pages}
          </span>
          <button
            className="secondary"
            disabled={currentPage === pages - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            다음
          </button>
        </div>
      )}
      {editor && (
        <SourceEditor
          key={`${editor.id}:${editor.version}`}
          record={editor}
          revision={data.revision}
          onClose={() => setEditor(null)}
          onChanged={onChanged}
          onSaved={async () => {
            await onChanged();
            setEditor(null);
            onNotice('원본 검토 내용을 저장했어요.');
          }}
        />
      )}
    </section>
  );
}
function SourceEditor({
  record,
  revision,
  onClose,
  onChanged,
  onSaved,
}: {
  record: SourceRecord;
  revision: number;
  onClose(): void;
  onChanged(): Promise<void>;
  onSaved(): Promise<void>;
}) {
  const [note, setNote] = useState(record.note),
    [status, setStatus] = useState(record.status),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState(''),
    [conflict, setConflict] = useState(false),
    [version, setVersion] = useState(record.version),
    [baseRevision, setBaseRevision] = useState(revision);
  const pending = useRef<Record<string, unknown> | null>(null),
    baseline = useRef(JSON.stringify({ note: record.note, status: record.status }));
  useUnsavedGuard(busy || uncertain || JSON.stringify({ note, status }) !== baseline.current);
  async function save() {
    if (busy || conflict) return;
    if (!pending.current)
      pending.current = {
        mutationId: crypto.randomUUID(),
        expectedVersion: version,
        expectedRevision: baseRevision,
        note,
        status,
      };
    setBusy(true);
    setError('');
    try {
      await request(
        `/api/data/source-records/${encodeURIComponent(record.id)}`,
        'PATCH',
        pending.current,
      );
      pending.current = null;
      setUncertain(false);
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof RequestError && e.status > 0 && e.status < 500) {
        pending.current = null;
        setUncertain(false);
        if (e.status === 409) {
          setConflict(true);
          await onChanged();
        }
      } else setUncertain(true);
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    setBusy(true);
    setError('');
    try {
      const [records, fresh] = await Promise.all([
        request<SourceRecord[]>('/api/data/source-records'),
        request<Bootstrap>('/api/bootstrap'),
      ]);
      const latest = records.find((r) => r.id === record.id);
      if (!latest) {
        setError('항목이 변경되었어요. 검토함을 다시 열어 주세요.');
        return;
      }
      setNote(latest.note);
      setStatus(latest.status);
      setVersion(latest.version);
      setBaseRevision(fresh.revision);
      baseline.current = JSON.stringify({ note: latest.note, status: latest.status });
      setConflict(false);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="원본 자료 검토"
      subtitle={record.sourceLocation}
      onClose={onClose}
      locked={busy || uncertain}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="form-body">
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {uncertain && (
            <p className="alert">
              저장 결과를 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.
            </p>
          )}
          {conflict && (
            <div className="conflict">
              <p>최신 검토 내용을 불러오면 입력을 최신 내용으로 바꿔요.</p>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void reload()}
              >
                최신 검토 내용 불러오기
              </button>
            </div>
          )}
          <fieldset disabled={busy || uncertain || conflict}>
            <label>
              검토 상태
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SourceRecord['status'])}
              >
                {Object.entries(sourceStatusLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              검토 메모
              <textarea
                rows={6}
                maxLength={5000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <p className="small muted">
              거래로 옮겼다면 원본 위치와 입력한 내역을 메모해 두세요. 원본 내용은 그대로 보존돼요.
            </p>
          </fieldset>
        </div>
        <div className="form-footer">
          <div className="footer-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy || uncertain}
              onClick={onClose}
            >
              닫기
            </button>
            <button className="primary" type="submit" disabled={busy || conflict}>
              {busy ? '저장 중…' : uncertain ? '저장 결과 다시 확인' : '저장'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

const historyActionLabels: Record<RecordHistory['action'], string> = {
  create: '생성',
  update: '수정',
  delete: '삭제',
  import: '가져오기',
  restore: '복원',
  review: '검토',
  unknown: '과거 변경',
};
function historyEntityLabel(value: string) {
  return (
    (
      {
        transaction: '거래',
        'deleted-transaction': '거래',
        asset: '자산',
        paymentMethod: '카드·통장',
        plan: '예산·계획',
        ledger: '가계부',
        tag: '태그',
        tagGroup: '태그 유형',
        assetOperation: '자산 이동·조정',
        sourceRecord: '원본 검토 자료',
        'data.restore': '백업',
        'data.import': '자료',
      } as Record<string, string>
    )[value] ?? '설정'
  );
}
const historyFieldLabels: Record<string, string> = {
  id: '기록 ID',
  ledgerId: '가계부',
  date: '날짜',
  description: '내용',
  amount: '금액',
  type: '구분',
  ownerId: '귀속',
  paymentMethodId: '결제수단',
  tagIds: '태그',
  allocations: '자산 배분',
  createdBy: '최초 작성자',
  createdAt: '최초 작성 시각',
  updatedBy: '수정자',
  updatedAt: '수정 시각',
  deletedAt: '삭제 시각',
  version: '버전',
  name: '이름',
  archived: '보관',
  note: '검토 메모',
  status: '검토 상태',
  balance: '잔액',
  openingBalance: '시작 잔액',
  trackSavings: '저축 집계',
  parentId: '상위 항목',
  assetId: '자산',
  fromAssetId: '보내는 자산',
  toAssetId: '받는 자산',
  targetBalance: '조정 잔액',
  budget: '예산',
  startDate: '시작일',
  endDate: '종료일',
  kind: '유형',
  restored: '복원 행 수',
  imported: '가져온 행 수',
  duplicates: '중복 행 수',
};
function HistoryComparison({ row, data }: { row: RecordHistory; data: Bootstrap }) {
  const before = row.before ?? {},
    after = row.after ?? {};
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  );
  function display(key: string, value: unknown): string {
    if (value == null) return ['createdBy', 'createdAt'].includes(key) ? '미확인' : '없음';
    if (['createdBy', 'updatedBy', 'ownerId', 'actorId'].includes(key))
      return value === 'shared'
        ? '공동'
        : (data.users.find((u) => u.id === value)?.name ?? String(value));
    if (key === 'ledgerId') return data.ledgers.find((l) => l.id === value)?.name ?? String(value);
    if (key === 'paymentMethodId')
      return data.paymentMethods.find((p) => p.id === value)?.name ?? String(value);
    if (['assetId', 'fromAssetId', 'toAssetId'].includes(key))
      return data.assets.find((a) => a.id === value)?.name ?? String(value);
    if (key === 'tagIds' && Array.isArray(value))
      return value.map((id) => data.tags.find((t) => t.id === id)?.name ?? id).join(', ') || '없음';
    if (key === 'allocations' && Array.isArray(value))
      return (
        value
          .map(
            (a) =>
              `${data.assets.find((v) => v.id === a.assetId)?.name ?? a.assetId}: ${won(a.amount)}`,
          )
          .join(', ') || '없음'
      );
    if (
      ['amount', 'balance', 'openingBalance', 'targetBalance', 'budget'].includes(key) &&
      typeof value === 'number'
    )
      return won(value);
    if (typeof value === 'boolean') return value ? '예' : '아니요';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return (
      (
        {
          income: '수입',
          expense: '지출',
          pending: '검토 필요',
          resolved: '검토 완료',
          reference: '참고 자료',
        } as Record<string, string>
      )[String(value)] ?? String(value)
    );
  }
  return (
    <div className="history-comparison">
      <p className="muted small">기록: {row.entityId}</p>
      {row.before === null && (
        <p className="small muted">
          {row.action === 'create'
            ? '새로 생성한 기록이에요.'
            : '가져오기 전 원본의 작성·수정 이력은 미확인이에요.'}
        </p>
      )}
      {row.after === null && (
        <p className="small muted">
          이 작업으로 기록이 제거되었어요. 삭제 전 값은 이력에 보존돼요.
        </p>
      )}
      <div className="data-table-wrap">
        <table>
          <thead>
            <tr>
              <th>항목</th>
              <th>변경 전</th>
              <th>변경 후</th>
            </tr>
          </thead>
          <tbody>
            {changed.map((key) => (
              <tr key={key}>
                <th scope="row">{historyFieldLabels[key] ?? key}</th>
                <td>
                  {row.before === null
                    ? row.action === 'create'
                      ? '없음'
                      : '미확인'
                    : display(key, before[key])}
                </td>
                <td>{row.after === null ? '없음' : display(key, after[key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!changed.length && <p className="muted small">변경된 필드 값이 없어요.</p>}
    </div>
  );
}
