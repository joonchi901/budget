import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Search } from 'lucide-react';
import type { SourceRecord } from '../shared/data';
import type { Workbook, WorkbookCell } from '../shared/xlsx';
import {
  restoreWorkbookArchive,
  workbookArchives,
  type WorkbookArchive,
} from '../shared/workbook-archive';
import { SelectField, SelectOption } from './SelectField';
import './workbook-archive.css';

const pageSize = 100;
const hasContent = (cell: WorkbookCell) =>
  (cell.value !== null && cell.value !== '') || cell.formula !== undefined || Boolean(cell.error);
const cellText = (cell: WorkbookCell) =>
  cell.error ?? (cell.value === null ? '—' : String(cell.value));
function addressOrder(address: string) {
  const match = /^([A-Z]+)(\d+)$/.exec(address);
  if (!match) return [0, 0];
  let column = 0;
  for (const letter of match[1]) column = column * 26 + letter.charCodeAt(0) - 64;
  return [Number(match[2]), column];
}

export default function WorkbookArchiveView({
  records,
  loading,
  loadError,
}: {
  records: SourceRecord[];
  loading: boolean;
  loadError: string;
}) {
  const archives = useMemo(() => workbookArchives(records), [records]);
  const [opened, setOpened] = useState<{ archive: WorkbookArchive; book: Workbook } | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [formulasOnly, setFormulasOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);
  useEffect(() => {
    if (opened && !archives.some((archive) => archive.id === opened.archive.id)) setOpened(null);
  }, [archives, opened]);
  const sheet = opened?.book.sheets[sheetIndex];
  const cells = useMemo(
    () =>
      Object.entries(sheet?.cells ?? {})
        .filter(([, cell]) => hasContent(cell))
        .sort(([a], [b]) => {
          const first = addressOrder(a),
            second = addressOrder(b);
          return first[0] - second[0] || first[1] - second[1];
        }),
    [sheet],
  );
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return cells.filter(
      ([address, cell]) =>
        (!formulasOnly || cell.formula !== undefined) &&
        `${address} ${cellText(cell)} ${cell.formula ?? ''}`.toLocaleLowerCase().includes(search),
    );
  }, [cells, query, formulasOnly]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  async function readArchive(archive: WorkbookArchive, download: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(archive.id);
    setError('');
    setNotice('');
    try {
      const bytes = await restoreWorkbookArchive(records, archive.id);
      if (download) {
        const blob = new Blob([new Uint8Array(bytes)], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download =
          archive.fileName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_') || '가계부-원본.xlsx';
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice('파일 확인을 마쳤어요. 보관된 원본을 내려받았어요.');
      } else {
        const { readXlsx } = await import('../shared/xlsx');
        const book = readXlsx(bytes);
        setOpened({ archive, book });
        setSheetIndex(0);
        setQuery('');
        setFormulasOnly(false);
        setPage(0);
        setNotice('파일 확인을 마쳤어요. 시트를 선택해 원본 셀을 살펴보세요.');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  return (
    <section className="panel data-panel workbook-archive" aria-label="보관된 엑셀 원본">
      <div className="section-heading">
        <div>
          <h2>
            <FileSpreadsheet size={22} /> 엑셀 원본
          </h2>
          <p className="small muted">
            가져올 때 보관한 파일을 시트별로 살펴보거나 그대로 내려받을 수 있어요.
          </p>
        </div>
        <span className="badge">{archives.length}개 파일</span>
      </div>
      {(loadError || error) && (
        <p className="alert error" role="alert">
          {error || loadError}
        </p>
      )}
      <p className="workbook-archive-status small muted" role="status">
        {busy
          ? '원본 파일을 확인하고 있어요…'
          : loading
            ? '엑셀 원본 목록을 불러오고 있어요…'
            : notice}
      </p>
      <div className="workbook-archive-list">
        {archives.map((archive) => (
          <article className={opened?.archive.id === archive.id ? 'is-open' : ''} key={archive.id}>
            <div className="workbook-archive-file">
              <strong>{archive.fileName}</strong>
              <p className="small muted">
                {archive.sourceId} ·{' '}
                {new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(
                  archive.byteLength / 1024,
                )}{' '}
                KB
              </p>
            </div>
            <div className="workbook-archive-actions">
              <button
                type="button"
                className="secondary"
                disabled={Boolean(busy)}
                onClick={() => void readArchive(archive, false)}
                aria-label={`${archive.fileName} 원본 열기`}
              >
                원본 열기
              </button>
              <button
                type="button"
                className="secondary"
                disabled={Boolean(busy)}
                onClick={() => void readArchive(archive, true)}
                aria-label={`${archive.fileName} 원본 다운로드`}
              >
                <Download size={16} /> 다운로드
              </button>
            </div>
          </article>
        ))}
        {!loading && !loadError && !archives.length && (
          <p className="workbook-archive-empty muted">
            보관된 엑셀 원본이 없어요. 원본 보관 기능을 적용해 가져온 파일이 여기에 표시돼요.
          </p>
        )}
      </div>
      {opened && (
        <div className="workbook-cell-viewer">
          <div className="section-heading">
            <div>
              <h3>{opened.archive.fileName}</h3>
              <p className="small muted">
                전체 {opened.book.sheets.length}개 시트 · 주석·도형·서식은 다운로드한 원본에서
                확인할 수 있어요.
              </p>
            </div>
          </div>
          <div className="workbook-cell-filters">
            <label>
              원본 시트
              <SelectField
                value={String(sheetIndex)}
                onValueChange={(value) => {
                  setSheetIndex(Number(value));
                  setPage(0);
                }}
              >
                {opened.book.sheets.map((item, index) => (
                  <SelectOption key={index} value={String(index)}>
                    {item.name}
                    {item.hidden ? ' (숨김 시트)' : ''}
                  </SelectOption>
                ))}
              </SelectField>
            </label>
            <label>
              셀 주소·값·수식 검색
              <span className="workbook-cell-search">
                <Search size={17} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(0);
                  }}
                  placeholder="예: V30, 여행, SUM"
                />
              </span>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={formulasOnly}
                onChange={(event) => {
                  setFormulasOnly(event.target.checked);
                  setPage(0);
                }}
              />
              수식이 있는 셀만
            </label>
          </div>
          <p className="small muted">
            {sheet?.name} · 내용이 있는 셀 {cells.length.toLocaleString('ko-KR')}개 중{' '}
            {filtered.length.toLocaleString('ko-KR')}개 표시 대상. 값 없이 서식만 있는 셀은
            제외해요. 수식 결과는 원본에 저장된 값이에요.
          </p>
          <div
            className="data-table-wrap workbook-cell-table"
            role="region"
            aria-label="엑셀 원본 셀 표"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">셀</th>
                  <th scope="col">저장된 값</th>
                  <th scope="col">수식</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(([address, cell]) => (
                  <tr key={address}>
                    <th scope="row">{address}</th>
                    <td className={cell.error ? 'workbook-cell-error' : ''}>{cellText(cell)}</td>
                    <td className="workbook-formula">
                      {cell.formula === undefined ? '—' : `=${cell.formula}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && (
              <p className="workbook-archive-empty muted">이 조건에 맞는 셀이 없어요.</p>
            )}
          </div>
          {pages > 1 && (
            <nav className="workbook-cell-pagination" aria-label="원본 셀 페이지">
              <button
                type="button"
                className="secondary"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                이전
              </button>
              <span>
                {currentPage + 1} / {pages} · {currentPage * pageSize + 1}~
                {Math.min((currentPage + 1) * pageSize, filtered.length)}번째 셀
              </span>
              <button
                type="button"
                className="secondary"
                disabled={currentPage === pages - 1}
                onClick={() => setPage(currentPage + 1)}
              >
                다음
              </button>
            </nav>
          )}
        </div>
      )}
    </section>
  );
}
