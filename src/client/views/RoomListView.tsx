import { useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { UgaAvatar, UgaLogo } from '../brand/Uga';
import { RoomListItem } from '../ledger';
import { Screen } from '../templates';
import { Button, CountBadge, Empty, IconButton, Inline, List, SearchField } from '../ui';
import { roomRecords, type IsoDate, type Ledger, type LedgerRecord } from '../../shared/ledger';
import type { Profile } from '../../shared/people';

/**
 * Home: every ledger as a room, most recent activity first, like a messenger. A parent's
 * activity includes its children's records. Search narrows by name; 새 가계부 creates one.
 * The top right opens friends (with requests and invitations waiting) and my account.
 */
export function RoomListView({
  ledgers,
  records,
  unseen = {},
  today,
  onOpenRoom,
  onCreate,
  profile,
  pending = 0,
  onOpenFriends,
  onOpenAccount,
}: {
  ledgers: Ledger[];
  records: LedgerRecord[];
  /** Records the other member added since this member last opened each room. */
  unseen?: Record<string, number>;
  today: IsoDate;
  onOpenRoom(room: Ledger): void;
  onCreate(): void;
  profile?: Profile;
  /** Friend requests and ledger invitations waiting for an answer. */
  pending?: number;
  onOpenFriends?(): void;
  onOpenAccount?(): void;
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
          <Inline justify="between" align="center" wrap={false}>
            <h1 className="view-home-title">
              <UgaLogo size={112} alt="우리의 가계부" />
            </h1>
            <Inline gap={1} align="center" wrap={false} className="view-home-actions">
              {onOpenFriends && (
                <IconButton
                  aria-label={pending ? `친구, 답할 요청·초대 ${pending}건` : '친구'}
                  onClick={onOpenFriends}
                >
                  <Users size={22} />
                  <CountBadge count={pending} label={`답할 요청·초대 ${pending}건`} />
                </IconButton>
              )}
              {onOpenAccount && profile && (
                <IconButton aria-label="내 계정" onClick={onOpenAccount}>
                  <UgaAvatar mood={profile.avatar} size={32} />
                </IconButton>
              )}
            </Inline>
          </Inline>
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
