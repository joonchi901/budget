import { useState } from 'react';
import { Plus } from 'lucide-react';
import { UgaLogo } from '../brand/Uga';
import { RoomListItem } from '../ledger';
import { Screen } from '../templates';
import { Button, Empty, List, SearchField } from '../ui';
import { roomRecords, type IsoDate, type Ledger, type LedgerRecord } from '../../shared/ledger';

/**
 * Home: every ledger as a room, most recent activity first, like a messenger. A parent's
 * activity includes its children's records. Search narrows by name; 새 가계부 creates one.
 */
export function RoomListView({
  ledgers,
  records,
  unseen = {},
  today,
  onOpenRoom,
  onCreate,
}: {
  ledgers: Ledger[];
  records: LedgerRecord[];
  /** Records the other member added since this member last opened each room. */
  unseen?: Record<string, number>;
  today: IsoDate;
  onOpenRoom(room: Ledger): void;
  onCreate(): void;
}) {
  const [query, setQuery] = useState('');
  const rooms = ledgers
    .filter((room) => !room.archived)
    .filter((room) => room.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .map((room) => ({
      room,
      latest: roomRecords(ledgers, room, records).reduce<LedgerRecord | undefined>(
        (last, record) => (!last || record.createdAt > last.createdAt ? record : last),
        undefined,
      ),
    }))
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
            placeholder="가계부 이름"
            value={query}
            onValueChange={setQuery}
          />
        </>
      }
      bottom={
        <Button variant="primary" onClick={onCreate}>
          <Plus size={18} />새 가계부
        </Button>
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
