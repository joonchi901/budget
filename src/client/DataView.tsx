import {
  TableScroll,
  Button,
  Panel,
  Toolbar,
  Field,
  FormGrid,
  Checkbox,
  Input,
  FormBody,
  Textarea,
  FormFooter,
  CloseButton,
  Tabs,
} from './ui';
import { SelectField, SelectOption } from './SelectField';
import { FileField } from './FileField';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, Upload } from 'lucide-react';
import { UgaIcon } from './brand/Uga';
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
import { isWorkbookArchiveRecord } from '../shared/workbook-archive';
import WorkbookArchiveView from './WorkbookArchiveView';
import './data.css';
interface Props {
  data: Bootstrap;
  onChanged(): Promise<void>;
  onNotice(message: string): void;
  excelImport?: ReactNode | ((controls: { onPendingChange(pending: boolean): void }) => ReactNode);
}
type DataTab = 'excel' | 'archive' | 'review' | 'backup' | 'csv' | 'history';
const dataTabs = [
  { id: 'excel', label: '엑셀 가져오기', icon: 'ledger' },
  { id: 'archive', label: '엑셀 원본', icon: 'ledger' },
  { id: 'review', label: '원본 검토함', icon: 'tags' },
  { id: 'backup', label: '백업·복원', icon: 'data' },
  { id: 'csv', label: 'CSV 가져오기', icon: 'data' },
  { id: 'history', label: '변경 이력', icon: 'planning' },
] as const;
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
  const isAdmin = data.user.role === 'admin';
  const [activeTab, setActiveTab] = useState<DataTab>(excelImport ? 'excel' : 'backup');
  const tabs = dataTabs.filter((tab) => tab.id !== 'excel' || excelImport);
  const [excelPending, setExcelPending] = useState(false);
  const [backup, setBackup] = useState<BudgetBackup | null>(null),
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
    [historyError, setHistoryError] = useState(''),
    [historyLoading, setHistoryLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [sourceRecords, setSourceRecords] = useState<SourceRecord[]>([]),
    [sourceError, setSourceError] = useState(''),
    [sourceLoading, setSourceLoading] = useState(true);
  useUnsavedGuard(busy || uncertain || excelPending);
  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    void request<typeof history>('/api/data/history')
      .then((rows) => {
        if (!cancelled) {
          setHistory(rows);
          setHistoryError('');
        }
      })
      .catch(() => {
        if (!cancelled) setHistoryError('변경 이력을 불러오지 못했어요.');
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data.revision, reloadKey]);
  useEffect(() => {
    let cancelled = false;
    setSourceLoading(true);
    void request<SourceRecord[]>('/api/data/source-records')
      .then((records) => {
        if (!cancelled) {
          setSourceRecords(records);
          setSourceError('');
        }
      })
      .catch((e) => {
        if (!cancelled) setSourceError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setSourceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data.revision, reloadKey]);
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
    setBusy(true);
    setError('');
    setRestore(null);
    setReplaceConfirmed(false);
    setBackup(null);
    try {
      if (file.size > 12_000_000) throw new Error('파일은 12MB 이하로 선택해 주세요.');
      const value = JSON.parse(await file.text()) as BudgetBackup;
      if (
        value.format !== 'our-budget' ||
        !Array.isArray(value.members) ||
        !value.members.every(
          (member) =>
            member &&
            typeof member.id === 'string' &&
            member.id.trim() &&
            typeof member.name === 'string',
        )
      )
        throw new Error('가계부 JSON 백업 파일을 선택해 주세요.');
      setBackup(value);
      setMemberMap(
        Object.fromEntries(
          value.members.map((m) => [m.id, data.users.some((u) => u.id === m.id) ? m.id : '']),
        ),
      );
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? 'JSON 파일을 읽지 못했어요. 가계부에서 내보낸 백업 파일을 선택해 주세요.'
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function previewJson() {
    if (!backup || !isAdmin) return;
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
    setBusy(true);
    setError('');
    setCsv([]);
    setImportRows([]);
    setSourceId('');
    setImportPreview(null);
    setImportConfirmed(false);
    setCsvErrors([]);
    try {
      if (file.size > 12_000_000) throw new Error('파일은 12MB 이하로 선택해 주세요.');
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error('제목 행과 거래 내역이 있는 CSV 파일을 선택해 주세요.');
      setCsv(rows);
      setMapping(defaultCsvMapping(rows[0] ?? []));
      setSourceId(file.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function previewCsv() {
    if (
      !sourceId.trim() ||
      !data.ledgers.some((ledger) => ledger.id === ledgerId && !ledger.archived)
    ) {
      setError('원본 자료 ID와 가져올 가계부를 선택해 주세요.');
      return;
    }
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
    if (kind === 'restore' && !isAdmin && !pending.current) return;
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
        if (e.status === 409 || e.status === 403) await onChanged();
      } else setUncertain(true);
    } finally {
      setBusy(false);
    }
  }
  const locked = busy || uncertain || excelPending;
  return (
    <div className="data-workspace">
      <div className="data-workspace-intro">
        <p>자료 가져오기부터 백업까지, 필요한 작업을 선택해 주세요.</p>
        <span>탭을 바꿔도 작성 중인 내용은 유지돼요.</span>
      </div>
      <Tabs<DataTab>
        className="data-tabs"
        aria-label="데이터 관리 작업"
        value={activeTab}
        onValueChange={setActiveTab}
        disabled={locked}
        options={tabs.map(({ id, label, icon }) => ({
          value: id,
          label: (
            <>
              <UgaIcon name={icon} size={22} />
              {label}
            </>
          ),
          id: `data-tab-${id}`,
          panelId: `data-panel-${id}`,
        }))}
      />
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {(sourceError || historyError) && (
        <Button
          variant="secondary"
          onClick={() => setReloadKey((key) => key + 1)}
          disabled={sourceLoading || historyLoading}
        >
          자료 다시 불러오기
        </Button>
      )}
      {uncertain && (
        <div className="alert">
          <p>저장 결과를 확인하지 못했어요. 입력을 바꾸지 않고 같은 요청으로 확인해 주세요.</p>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              void apply(pending.current?.url.endsWith('restore') ? 'restore' : 'import')
            }
          >
            저장 결과 다시 확인
          </Button>
        </div>
      )}
      <div
        className="data-tab-panel"
        id="data-panel-archive"
        role="tabpanel"
        aria-labelledby="data-tab-archive"
        hidden={activeTab !== 'archive'}
      >
        <WorkbookArchiveView
          records={sourceRecords}
          loading={sourceLoading}
          loadError={sourceError}
        />
      </div>
      <div
        className="data-tab-panel"
        id="data-panel-excel"
        role="tabpanel"
        aria-labelledby="data-tab-excel"
        hidden={activeTab !== 'excel'}
      >
        {typeof excelImport === 'function'
          ? excelImport({ onPendingChange: setExcelPending })
          : excelImport}
        <Button
          variant="plain"
          className="data-review-shortcut"
          type="button"
          disabled={locked}
          onClick={() => setActiveTab('review')}
        >
          <UgaIcon name="tags" size={22} /> 가져온 원본 검토하기{' '}
          <span>날짜·분류가 미확정인 자료를 확인해요</span>
        </Button>
      </div>
      <div
        className="data-tab-panel"
        id="data-panel-review"
        role="tabpanel"
        aria-labelledby="data-tab-review"
        hidden={activeTab !== 'review'}
      >
        <SourceInbox
          data={data}
          onChanged={onChanged}
          onNotice={onNotice}
          disabled={locked}
          records={sourceRecords.filter((record) => !isWorkbookArchiveRecord(record))}
          error={sourceError}
          loading={sourceLoading}
        />
      </div>
      <div
        className="data-tab-panel"
        id="data-panel-backup"
        role="tabpanel"
        aria-labelledby="data-tab-backup"
        hidden={activeTab !== 'backup'}
      >
        <Panel className="data-panel">
          <Toolbar>
            <div>
              <h2>백업 · 내보내기</h2>
              <p className="muted small">
                JSON은 전체 복원용, CSV는 현재 거래 목록을 확인하는 용도예요.
              </p>
            </div>
            <Download size={20} />
          </Toolbar>
          <div className="data-actions">
            <Button variant="primary" disabled={locked} onClick={() => void exportJson()}>
              전체 JSON 백업
            </Button>
            <Button
              variant="secondary"
              disabled={locked}
              onClick={() =>
                download('가계부-거래.csv', transactionsCsv(data), 'text/csv;charset=utf-8')
              }
            >
              거래 CSV 내보내기
            </Button>
          </div>
          <p className="small muted">
            보관·삭제 기록과 자산 반영 이력도 백업해요. 로그인 정보와 세션은 포함하지 않아요.
            계좌번호 등 입력한 정보가 파일에 포함되므로 개인 저장 공간에 보관해 주세요.
          </p>
        </Panel>
        <Panel className="data-panel">
          <Toolbar>
            <div>
              <h2>JSON 백업 복원</h2>
              <p className="muted small">
                현재 가구의 모든 가계부 자료를 백업 내용으로 교체해요. 복원 전에 현재 자료를 백업할
                수 있어요.
              </p>
            </div>
            <Upload size={20} />
          </Toolbar>
          {!isAdmin && (
            <p className="small muted">
              가계부 구조도 교체하는 백업 복원은 관리자만 할 수 있어요. 현재 자료는 백업하거나 CSV로
              내보낼 수 있어요.
            </p>
          )}
          <fieldset disabled={locked || !isAdmin}>
            <Field>
              복원할 JSON 파일
              <FileField
                accept=".json,application/json"
                onChange={(e) => void loadBackup(e.target.files?.[0])}
              />
            </Field>
            {backup && (
              <>
                <FormGrid className="data-member-mapping">
                  {backup.members.map((member) => (
                    <Field key={member.id}>
                      원본 {member.name} → 현재 구성원
                      <SelectField
                        value={memberMap[member.id] ?? ''}
                        onValueChange={(value) => {
                          setMemberMap((old) => ({ ...old, [member.id]: value }));
                          setRestore(null);
                          setReplaceConfirmed(false);
                        }}
                      >
                        <SelectOption value="">선택해 주세요</SelectOption>
                        {data.users.map((user) => (
                          <SelectOption key={user.id} value={user.id}>
                            {user.name}
                          </SelectOption>
                        ))}
                      </SelectField>
                    </Field>
                  ))}
                </FormGrid>
                <Button type="button" variant="secondary" onClick={() => void previewJson()}>
                  복원 내용 검사
                </Button>
              </>
            )}
            {restore && (
              <div className="data-preview">
                <h3>교체될 자료</h3>
                <TableScroll aria-label="백업 복원 전후 자료" className="data-table-wrap">
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
                </TableScroll>
                {restore.issues.length > 0 ? (
                  <ul className="data-errors">
                    {restore.issues.map((issue, index) => (
                      <li key={index}>{issue}</li>
                    ))}
                  </ul>
                ) : (
                  <>
                    <Field className="checkbox">
                      <Checkbox
                        checked={replaceConfirmed}
                        onChange={(e) => setReplaceConfirmed(e.target.checked)}
                      />{' '}
                      구성원 연결과 교체 내용을 확인했으며 현재 가구의 자료 전체를 교체합니다.
                    </Field>
                    <Button
                      type="button"
                      variant="primary"
                      disabled={!replaceConfirmed || restore.revision !== data.revision}
                      onClick={() => void apply('restore')}
                    >
                      확인한 백업으로 전체 복원
                    </Button>
                  </>
                )}
                {restore.revision !== data.revision && (
                  <p className="alert">다른 변경이 반영되었어요. 복원 내용을 다시 검사해 주세요.</p>
                )}
              </div>
            )}
          </fieldset>
        </Panel>
      </div>
      <div
        className="data-tab-panel"
        id="data-panel-csv"
        role="tabpanel"
        aria-labelledby="data-tab-csv"
        hidden={activeTab !== 'csv'}
      >
        <Panel className="data-panel">
          <Toolbar>
            <div>
              <h2>CSV 거래 가져오기</h2>
              <p className="muted small">
                기존 결제수단과 태그에 연결한 뒤, 오류와 합계를 확인하고 가져와요.
              </p>
            </div>
            <Upload size={20} />
          </Toolbar>
          <fieldset disabled={locked}>
            <Field>
              CSV 파일
              <FileField
                accept=".csv,text/csv"
                onChange={(e) => void loadCsv(e.target.files?.[0])}
              />
            </Field>
            {csv.length > 0 && (
              <>
                <FormGrid>
                  <Field>
                    원본 자료 ID
                    <Input
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
                  </Field>
                  <Field>
                    가져올 가계부
                    <SelectField
                      value={ledgerId}
                      onValueChange={(value) => {
                        setLedgerId(value);
                        setImportPreview(null);
                      }}
                    >
                      <SelectOption value="">선택해 주세요</SelectOption>
                      {data.ledgers
                        .filter((l) => !l.archived)
                        .map((l) => (
                          <SelectOption key={l.id} value={l.id}>
                            {l.name}
                          </SelectOption>
                        ))}
                    </SelectField>
                  </Field>
                </FormGrid>
                <FormGrid className="data-column-mapping">
                  {(Object.keys(csvMappingLabels) as (keyof CsvMapping)[]).map((key) => (
                    <Field key={key}>
                      {csvMappingLabels[key]}
                      {key === 'tags' || key === 'owner' ? ' (선택)' : ''}
                      <SelectField
                        value={mapping[key]}
                        onValueChange={(value) => {
                          setMapping((old) => ({ ...old, [key]: value }));
                          setImportPreview(null);
                        }}
                      >
                        <SelectOption value="">연결 안 함</SelectOption>
                        {csv[0].map((header, index) => (
                          <SelectOption key={index} value={header}>
                            {header}
                          </SelectOption>
                        ))}
                      </SelectField>
                    </Field>
                  ))}
                </FormGrid>
                <p className="small muted">
                  원본 행 ID는 재수출해도 바뀌지 않는 고유 번호를 사용해요. 태그는 |로 구분하며,
                  이름이 겹치면 유형:옵션으로 입력해요. 이 화면은 수입·지출 거래를 가져오며 자산
                  배분은 거래 수정에서 지정할 수 있어요.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!sourceId.trim() || !ledgerId}
                  onClick={() => void previewCsv()}
                >
                  가져올 내역 검사
                </Button>
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
                <TableScroll aria-label="CSV 가져오기 검사 결과" className="data-table-wrap">
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
                </TableScroll>
                <Field className="checkbox">
                  <Checkbox
                    checked={importConfirmed}
                    onChange={(e) => setImportConfirmed(e.target.checked)}
                  />{' '}
                  원본 행, 거래 내용과 합계를 확인했습니다.
                </Field>
                <Button
                  type="button"
                  variant="primary"
                  disabled={
                    !importConfirmed ||
                    importPreview.errors > 0 ||
                    importPreview.revision !== data.revision
                  }
                  onClick={() => void apply('import')}
                >
                  확인한 거래 가져오기
                </Button>
                {importPreview.revision !== data.revision && (
                  <p className="alert">다른 변경이 반영되었어요. 내역을 다시 검사해 주세요.</p>
                )}
              </div>
            )}
          </fieldset>
        </Panel>
      </div>
      <div
        className="data-tab-panel"
        id="data-panel-history"
        role="tabpanel"
        aria-labelledby="data-tab-history"
        hidden={activeTab !== 'history'}
      >
        <Panel className="data-panel">
          <Toolbar>
            <h2>
              <UgaIcon name="planning" size={22} /> 최근 변경 이력
            </h2>
            <span className="small muted">최근 100건</span>
          </Toolbar>
          {historyError && <p role="alert">{historyError}</p>}
          {historyLoading && (
            <p className="muted" role="status">
              변경 이력을 불러오고 있어요…
            </p>
          )}
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
            {!history.length && !historyError && !historyLoading && (
              <p className="muted">아직 변경 이력이 없어요.</p>
            )}
          </div>
          <p className="small muted">
            항목을 펼치면 저장 당시의 수정 전후 값을 비교할 수 있어요. 기존 자료의 최초 작성자와
            과거 수정 값은 확인된 기록이 없으면 미확인으로 표시해요.
          </p>
        </Panel>
      </div>
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
function SourceInbox({
  data,
  onChanged,
  onNotice,
  disabled,
  records,
  error,
  loading,
}: Props & {
  disabled: boolean;
  records: SourceRecord[];
  error: string;
  loading: boolean;
}) {
  const [status, setStatus] = useState('pending'),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(0),
    [editor, setEditor] = useState<SourceRecord | null>(null);
  const filtered = records.filter(
    (r) =>
      (!status || r.status === status) &&
      `${r.sourceId} ${r.sourceLocation} ${r.note} ${JSON.stringify(r.payload)}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 50)),
    currentPage = Math.min(page, pages - 1),
    visible = filtered.slice(currentPage * 50, (currentPage + 1) * 50);
  return (
    <Panel className="data-panel">
      <Toolbar>
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
      </Toolbar>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <div className="data-source-filters">
        <Field>
          검토 상태
          <SelectField
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setPage(0);
            }}
          >
            <SelectOption value="">전체</SelectOption>
            {Object.entries(sourceStatusLabels).map(([key, label]) => (
              <SelectOption key={key} value={key}>
                {label}
              </SelectOption>
            ))}
          </SelectField>
        </Field>
        <Field>
          원본 내역·출처·메모 검색
          <Input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="내역, 금액, 분류, 시트 이름, 메모"
          />
        </Field>
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
              <Button variant="secondary" disabled={disabled} onClick={() => setEditor(record)}>
                검토 메모·상태
              </Button>
            </div>
            <SourcePayloadSummary record={record} />
            {record.note && <p className="data-source-note">{record.note}</p>}
            <details>
              <summary>원본 내용 보기</summary>
              <pre>{JSON.stringify(record.payload, null, 2)}</pre>
            </details>
          </article>
        ))}
        {loading && (
          <p className="small muted" role="status">
            원본 검토 자료를 불러오고 있어요…
          </p>
        )}
        {!visible.length && !error && !loading && (
          <p className="muted">이 조건에 맞는 원본 검토 자료가 없어요.</p>
        )}
      </div>
      {pages > 1 && (
        <nav className="data-actions" aria-label="원본 검토 자료 페이지">
          <Button
            variant="secondary"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            이전
          </Button>
          <span role="status">
            {currentPage + 1} / {pages}
          </span>
          <Button
            variant="secondary"
            disabled={currentPage === pages - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            다음
          </Button>
        </nav>
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
    </Panel>
  );
}
function SourcePayloadSummary({ record }: { record: SourceRecord }) {
  if (
    record.kind !== 'transaction' ||
    !record.payload ||
    typeof record.payload !== 'object' ||
    Array.isArray(record.payload)
  )
    return null;
  const payload = record.payload as Record<string, unknown>;
  const text = (key: string, fallback: string) => {
    const value = payload[key];
    return (typeof value === 'string' && value.trim()) || typeof value === 'number'
      ? String(value)
      : fallback;
  };
  const amount =
    typeof payload.amount === 'number' && Number.isFinite(payload.amount)
      ? `${won(payload.amount)}원`
      : text('amount', '금액 미확정');
  const fields = [
    ['날짜', text('date', '미확정')],
    ['대분류', text('major', '미분류')],
    ['소분류', text('minor', '미분류')],
    ['결제수단', text('payment', '미지정')],
    ['원본 태그', text('tag', '없음')],
  ];
  return (
    <>
      <div className="source-transaction-summary">
        <h3>{text('description', '내역 미기록')}</h3>
        <strong>{amount}</strong>
      </div>
      <dl className="source-transaction-fields">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </>
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
  const dirty = JSON.stringify({ note, status }) !== baseline.current;
  useUnsavedGuard(busy || uncertain || dirty);
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
      dirty={dirty}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <FormBody>
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
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void reload()}
              >
                최신 검토 내용 불러오기
              </Button>
            </div>
          )}
          <fieldset disabled={busy || uncertain || conflict}>
            <Field>
              검토 상태
              <SelectField
                value={status}
                onValueChange={(value) => setStatus(value as SourceRecord['status'])}
              >
                {Object.entries(sourceStatusLabels).map(([key, label]) => (
                  <SelectOption key={key} value={key}>
                    {label}
                  </SelectOption>
                ))}
              </SelectField>
            </Field>
            <Field>
              검토 메모
              <Textarea
                rows={6}
                maxLength={5000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <p className="small muted">
              거래로 옮겼다면 원본 위치와 입력한 내역을 메모해 두세요. 원본 내용은 그대로 보존돼요.
            </p>
          </fieldset>
        </FormBody>
        <FormFooter>
          <div className="footer-actions">
            <CloseButton type="button" variant="secondary" disabled={busy || uncertain}>
              닫기
            </CloseButton>
            <Button variant="primary" type="submit" disabled={busy || conflict}>
              {busy ? '저장 중…' : uncertain ? '저장 결과 다시 확인' : '저장'}
            </Button>
          </div>
        </FormFooter>
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
    if (value == null)
      return key === 'paymentMethodId'
        ? '미지정'
        : ['createdBy', 'createdAt'].includes(key)
          ? '미확인'
          : '없음';
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
      <TableScroll aria-label="변경 전후 비교" className="data-table-wrap">
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
      </TableScroll>
      {!changed.length && <p className="muted small">변경된 필드 값이 없어요.</p>}
    </div>
  );
}
