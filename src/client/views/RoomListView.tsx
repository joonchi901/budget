import { useState } from 'react';
import { Plus } from 'lucide-react';
import { UgaLogo } from '../brand/Uga';
import { RoomListItem } from '../ledger';
import { Screen } from '../templates';
import { Button, Empty, List, Menu, SearchField, SegmentedControl } from '../ui';
import type { Group, IsoDate, Ledger, LedgerRecord } from '../../shared/ledger';

type RoomFilter = 'all' | 'ledger' | 'group';

/**
 * Home: every ledger and group as rooms, most recent activity first, like a messenger.
 * Search and the 전체·가계부·묶음 switch narrow the list; 새로 만들기 starts a ledger or group.
 */
export function RoomListView({
  ledgers,
  groups,
  records,
  unseen = {},
  today,
  onOpenRoom,
  onCreate,
}: {
  ledgers: Ledger[];
  groups: Group[];
  records: LedgerRecord[];
  /** Records the other member added since this member last opened each room. */
  unseen?: Record<string, number>;
  today: IsoDate;
  onOpenRoom(room: Ledger | Group): void;
  onCreate(kind: 'ledger' | 'group'): void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RoomFilter>('all');
  const latest = (room: Ledger | Group) => {
    const ids = 'ledgerIds' in room ? room.ledgerIds : [room.id];
    return records
      .filter((record) => ids.includes(record.ledgerId))
      .reduce<LedgerRecord | undefined>(
        (last, record) => (!last || record.createdAt > last.createdAt ? record : last),
        undefined,
      );
  };
  const rooms = [...(filter === 'group' ? [] : ledgers), ...(filter === 'ledger' ? [] : groups)]
    .filter((room) => !room.archived)
    .filter((room) => room.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .map((room) => ({ room, latest: latest(room) }))
    .sort((a, b) => (b.latest?.createdAt ?? '').localeCompare(a.latest?.createdAt ?? ''));
  return (
    <Screen
      top={
        <>
          <h1 className="view-home-title">
            <UgaLogo size={112} alt="우리의 가계부" />
          </h1>
          <SearchField
            aria-label="가계부 검색"
            placeholder="가계부·묶음 이름"
            value={query}
            onValueChange={setQuery}
          />
          <SegmentedControl<RoomFilter>
            aria-label="방 종류"
            value={filter}
            onValueChange={setFilter}
            options={[
              { value: 'all', label: '전체' },
              { value: 'ledger', label: '가계부' },
              { value: 'group', label: '묶음' },
            ]}
          />
        </>
      }
      bottom={
        <Menu
          label="새로 만들기"
          items={[
            { label: '가계부 만들기', onSelect: () => onCreate('ledger') },
            { label: '묶음 만들기', onSelect: () => onCreate('group') },
          ]}
          trigger={(props) => (
            <Button {...props} variant="primary">
              <Plus size={18} />
              새로 만들기
            </Button>
          )}
        />
      }
    >
      {rooms.length ? (
        <List aria-label="방 목록">
          {rooms.map(({ room, latest }) => (
            <RoomListItem
              key={room.id}
              room={room}
              latest={latest}
              unseen={unseen[room.id]}
              today={today}
              onOpen={() => onOpenRoom(room)}
            />
          ))}
        </List>
      ) : (
        <Empty illustration={query ? 'search' : 'empty'}>
          {query ? `'${query}'와 맞는 방이 없어요.` : '아직 방이 없어요. 새로 만들어 보세요.'}
        </Empty>
      )}
    </Screen>
  );
}
