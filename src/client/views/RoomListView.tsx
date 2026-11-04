import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { UgaLogo } from '../brand/Uga';
import { RoomListItem } from '../ledger';
import { Screen } from '../templates';
import { Button, Empty, Inline, List, SearchField } from '../ui';
import {
  roomRecords,
  type Id,
  type IsoDate,
  type Ledger,
  type LedgerRecord,
} from '../../shared/ledger';

/**
 * Home's 가계부 tab: every ledger as a room, most recent activity first, like a messenger. A
 * 하위 가계부 sits indented under each 상위 that holds it; a parent's activity includes its
 * children's. Searching lists matching rooms flat. 새 가계부 sits right of the logo. Archived
 * ledgers wait folded under 보관한 가계부 at the bottom, where they can be opened and restored.
 */
export function RoomListView({
  ledgers,
  records,
  unseen = {},
  today,
  onOpenRoom,
  onCreate,
  tabBar,
}: {
  ledgers: Ledger[];
  records: LedgerRecord[];
  /** Records the other member added since this member last opened each room. */
  unseen?: Record<string, number>;
  today: IsoDate;
  onOpenRoom(room: Ledger): void;
  onCreate(): void;
  /** The app's bottom tabs. */
  tabBar?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const open = ledgers.filter((room) => !room.archived);
  const archived = ledgers.filter((room) => room.archived);
  const latest = new Map(
    ledgers.map((room) => [
      room.id,
      roomRecords(ledgers, room, records).reduce<LedgerRecord | undefined>(
        (last, record) => (!last || record.createdAt > last.createdAt ? record : last),
        undefined,
      ),
    ]),
  );
  const byActivity = (a: Ledger, b: Ledger) =>
    (latest.get(b.id)?.createdAt ?? '').localeCompare(latest.get(a.id)?.createdAt ?? '');
  const search = query.trim().toLocaleLowerCase();
  const rows: { key: string; room: Ledger; depth: number }[] = [];
  if (search)
    for (const room of open
      .filter((item) => item.name.toLocaleLowerCase().includes(search))
      .sort(byActivity))
      rows.push({ key: room.id, room, depth: 0 });
  else {
    // A 하위 가계부 held by two 상위 shows under each; `path` guards against a cycle in bad data.
    const visit = (room: Ledger, path: Id[]) => {
      rows.push({ key: [...path, room.id].join('/'), room, depth: path.length });
      open
        .filter((child) => room.childIds.includes(child.id) && !path.includes(child.id))
        .sort(byActivity)
        .forEach((child) => visit(child, [...path, room.id]));
    };
    open
      .filter((room) => !open.some((parent) => parent.childIds.includes(room.id)))
      .sort(byActivity)
      .forEach((room) => visit(room, []));
  }
  return (
    <Screen
      top={
        <>
          <Inline justify="between" align="center" wrap={false}>
            <h1 className="view-home-title">
              <UgaLogo size={112} alt="우리의 가계부" />
            </h1>
            <Button variant="primary" onClick={onCreate}>
              <Plus size={18} />새 가계부
            </Button>
          </Inline>
          <SearchField
            aria-label="가계부 검색"
            placeholder="가계부 이름"
            value={query}
            onValueChange={setQuery}
          />
        </>
      }
      bottom={tabBar}
    >
      {rows.length ? (
        <List aria-label="방 목록">
          {rows.map(({ key, room, depth }) => (
            <RoomListItem
              key={key}
              room={room}
              latest={latest.get(room.id)}
              unseen={unseen[room.id]}
              today={today}
              depth={depth}
              onOpen={() => onOpenRoom(room)}
            />
          ))}
        </List>
      ) : (
        <Empty illustration={query ? 'search' : 'empty'}>
          {query ? `'${query}'와 맞는 방이 없어요.` : '아직 방이 없어요. 새로 만들어 보세요.'}
        </Empty>
      )}
      {archived.length > 0 && !search && (
        <details className="view-archived">
          <summary>보관한 가계부 {archived.length}개</summary>
          <List aria-label="보관한 가계부">
            {archived.sort(byActivity).map((room) => (
              <RoomListItem
                key={room.id}
                room={room}
                latest={latest.get(room.id)}
                today={today}
                onOpen={() => onOpenRoom(room)}
              />
            ))}
          </List>
        </details>
      )}
    </Screen>
  );
}
