import { useMemo, useState } from 'react';
import { ChevronRight, Layers3, Plus, Search, UsersRound, X } from 'lucide-react';
import { ALL_LEDGERS_ID } from '../shared/hierarchy';
import { ledgerRooms } from '../shared/ledger-rooms';
import type { Bootstrap } from '../shared/types';
import { UgaLedgerIcon, UgaMascot } from './brand/Uga';
import './ledger-rooms.css';

function editedDate(timestamp: number) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(timestamp);
}

export default function LedgerRooms({
  data,
  onOpen,
  onCreate,
}: {
  data: Bootstrap;
  onOpen(id: string): void;
  onCreate(): void;
}) {
  const [query, setQuery] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const rooms = useMemo(
    () => ledgerRooms(data.ledgers, data.transactions, { query, includeArchived }),
    [data.ledgers, data.transactions, query, includeArchived],
  );
  const searching = query.trim().length > 0;
  const admin = data.user.role === 'admin';
  const names = new Map<string, number>();
  for (const room of rooms) names.set(room.ledger.name, (names.get(room.ledger.name) ?? 0) + 1);
  return (
    <section className="ledger-rooms" aria-label="가계부 방 목록">
      <div className="ledger-rooms-search">
        <Search size={20} aria-hidden="true" />
        <input
          type="search"
          aria-label="가계부 검색"
          placeholder="가계부 이름으로 찾아보세요"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button
            className="icon-button"
            aria-label="가계부 검색 지우기"
            onClick={() => setQuery('')}
          >
            <X size={18} />
          </button>
        )}
      </div>
      <div className="ledger-rooms-list-heading">
        <h2>
          {searching ? '검색 결과' : '함께 쓰는 가계부'} <span>{rooms.length}</span>
        </h2>
        <span className="ledger-rooms-order">최근 수정 순</span>
      </div>
      {rooms.length ? (
        <ul className="ledger-rooms-list">
          {rooms.map(
            ({
              ledger,
              path,
              latestTransaction,
              latestActivity,
              transactionCount,
              descendantCount,
            }) => (
              <li key={ledger.id}>
                <button
                  className="ledger-room"
                  aria-label={`${names.get(ledger.name)! > 1 ? path : ledger.name} 가계부 열기`}
                  onClick={() => onOpen(ledger.id)}
                >
                  <span className="ledger-room-avatar">
                    <UgaLedgerIcon value={ledger.icon} size={34} />
                  </span>
                  <span className="ledger-room-content">
                    <span className="ledger-room-title">
                      <strong>{ledger.name}</strong>
                      {ledger.archived && <span className="ledger-room-archived">보관</span>}
                    </span>
                    {(searching || ledger.parentId) && path !== ledger.name && (
                      <span className="ledger-room-path">{path}</span>
                    )}
                    <span className={`ledger-room-preview ${latestTransaction ? '' : 'is-empty'}`}>
                      {latestTransaction
                        ? latestTransaction.description.replace(/\s+/g, ' ').trim() ||
                          '이름 없는 내역'
                        : ledger.archived
                          ? '보관한 기록이 없어요'
                          : '첫 내역을 남겨보세요'}
                    </span>
                    <span className="ledger-room-meta">
                      기록 {transactionCount.toLocaleString('ko-KR')}건
                      {descendantCount > 0 && <> · 하위 가계부 {descendantCount}개 포함</>}
                    </span>
                  </span>
                  <span className="ledger-room-trailing">
                    {latestActivity > 0 && (
                      <time
                        dateTime={latestTransaction!.updatedAt}
                        aria-label={`최근 수정 ${new Date(latestActivity).toLocaleString('ko-KR')}`}
                      >
                        {editedDate(latestActivity)} 수정
                      </time>
                    )}
                    <ChevronRight size={17} aria-hidden="true" />
                  </span>
                </button>
              </li>
            ),
          )}
        </ul>
      ) : (
        <div className="ledger-rooms-empty" role="status">
          <UgaMascot pose={searching ? 'search' : 'record'} size={96} />
          <h3>
            {searching
              ? '찾는 가계부가 없어요'
              : admin
                ? '첫 가계부를 만들어보세요'
                : '아직 가계부가 없어요'}
          </h3>
          <p>
            {searching
              ? '다른 이름으로 검색하거나 보관한 가계부도 확인해보세요.'
              : admin
                ? '일상과 여행, 함께 기록할 공간을 만들어요.'
                : '관리자가 가계부를 만들면 여기에서 함께 기록할 수 있어요.'}
          </p>
          {searching ? (
            <button className="button secondary" onClick={() => setQuery('')}>
              검색 지우기
            </button>
          ) : (
            admin && (
              <button className="button primary" onClick={onCreate}>
                <Plus size={18} />
                가계부 만들기
              </button>
            )
          )}
        </div>
      )}
      {data.ledgers.some((ledger) => ledger.archived) && (
        <label className="checkbox ledger-rooms-archive-toggle">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
          />
          보관한 가계부 포함
        </label>
      )}
      <button className="ledger-rooms-collection" onClick={() => onOpen(ALL_LEDGERS_ID)}>
        <span className="ledger-rooms-collection-icon">
          <Layers3 size={20} aria-hidden="true" />
        </span>
        <span>
          <strong>전체 가계부</strong>
          <small>모든 가계부의 기록을 한곳에서</small>
        </span>
        <ChevronRight size={17} aria-hidden="true" />
      </button>
      <p className="ledger-rooms-sharing">
        <UsersRound size={15} aria-hidden="true" />
        가족 구성원이 함께 보는 가계부예요.
      </p>
    </section>
  );
}
