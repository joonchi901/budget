import { useEffect, useRef, useState } from 'react';
import { ChatThread, HomeTabBar, type RoomView } from '../ledger';
import { addDays, addMonths, localDate } from '../ledger/format';
import { UgaLogo } from '../brand/Uga';
import { AppShell, Dialog, StatusScreen, useWide } from '../templates';
import { Button, CloseButton, FormBody, FormFooter, Notice } from '../ui';
import {
  AccountView,
  AppSettingsView,
  AssetEditView,
  AssetManageView,
  AssetsView,
  CreateLedgerView,
  FriendsView,
  InviteAcceptView,
  LedgerMembersView,
  LedgerRoomView,
  LedgerSettingsView,
  LoginView,
  RecordEntryView,
  RoomListView,
  RoomPlaceholderView,
} from '../views';
import {
  isScheduled,
  leafLedgers,
  ledgerPath,
  pathBetween,
  rescheduled,
  unseenCounts,
  writeAhead,
  type AppData,
  type ChatMessage,
  type Id,
  type IsoDate,
  type Ledger,
  type LedgerRecord,
} from '../../shared/ledger';
import { assetFor, type Asset } from '../../shared/assets';
import type { Profile, RoomInvite } from '../../shared/people';
import { applyChanges, mergeSnapshot, type Snapshot, type Sync } from '../../shared/sync';
import { ApiFailure, api } from './api';
import { reencodePhoto } from './photo';
import { useRoute } from './route';

type Sheet =
  | { type: 'entry'; ledgers: Ledger[]; date?: IsoDate; record?: LedgerRecord }
  | { type: 'create'; sourceId?: Id }
  | { type: 'asset'; asset?: Asset }
  | { type: 'members'; ledger: Ledger }
  | { type: 'invite'; invite: RoomInvite }
  | { type: 'deleteMessage'; message: ChatMessage };

const parentIdsOf = (ledgers: Ledger[], id: Id) =>
  ledgers.filter((ledger) => ledger.childIds.includes(id)).map((ledger) => ledger.id);

/** The ledger saved with its parents, for showing a change before the server answers. */
const withLedger = <T extends AppData>(data: T, ledger: Ledger, parentIds: Id[]): T => ({
  ...data,
  ledgers: [
    ...data.ledgers
      .filter((item) => item.id !== ledger.id)
      .map((item) => ({
        ...item,
        childIds: parentIds.includes(item.id)
          ? [...new Set([...item.childIds, ledger.id])]
          : item.childIds.filter((childId) => childId !== ledger.id),
      })),
    ledger,
  ],
});

/** The record or message with the member's reaction added or taken away, for showing it at once. */
const withReaction = <T extends LedgerRecord | ChatMessage>(
  item: T,
  reaction: string,
  memberId: Id,
  on: boolean,
): T => {
  const who = (item.reactions?.[reaction] ?? []).filter((id) => id !== memberId);
  const reactions = { ...item.reactions, [reaction]: on ? [...who, memberId] : who };
  if (!reactions[reaction].length) delete reactions[reaction];
  return { ...item, reactions };
};

/** Checks for others' changes start this often, and slow down to the longest while none come. */
const POLL_FIRST = 5000;
const POLL_LONGEST = 30000;

/**
 * The app layer: loads the user's data, opens rooms and sheets, and saves through the API.
 * The data comes whole once (snapshot); after that every answer lists what changed since the
 * client's cursor (docs/sync-plan.md §3.9). A change shows at once; changes are sent one at a
 * time in order, and the server's state shows again once none is left unanswered. A failure
 * catches up with the server.
 */
export function App() {
  const [data, setData] = useState<Snapshot>();
  const [error, setError] = useState<{ message: string; login?: boolean; retry?(): void }>();
  const [sheet, setSheet] = useState<Sheet>();
  const { route, go, back } = useRoute();
  const { tab, roomId } = route;
  // From 1024px a list stays beside the screen: the rooms beside a room, the 설정 menu beside
  // its page (프로필 until another is picked).
  const wide = useWide();
  const settingsPage = wide && tab === 'settings' ? (route.page ?? 'profile') : route.page;
  const [roomView, setRoomView] = useState<RoomView>('records');
  /** The 상위 가계부 a room was opened through, for its title's path. */
  const [via, setVia] = useState<{ roomId: Id; ids: Id[] }>();
  const [takenHandle, setTakenHandle] = useState<string>();
  const queue = useRef(Promise.resolve());
  /** Changes sent and not answered yet; while any is, the screen keeps showing them. */
  const pending = useRef(0);
  /** The server's state as this device knows it: what is saved for sure, with the cursor. */
  const confirmed = useRef<Snapshot>(undefined);
  /** Brings the next check for others' changes forward, while a shared room is open. */
  const wake = useRef<() => void>(undefined);
  const today = localDate(new Date());

  const report = (failure: unknown, retry?: () => void) =>
    setError({
      message: failure instanceof Error ? failure.message : '문제가 생겼어요.',
      login: failure instanceof ApiFailure && failure.status === 401,
      retry,
    });
  const reload = () =>
    api<Snapshot>('GET', '/api/snapshot').then((answer) => {
      confirmed.current = answer;
      setData(answer);
      setError(undefined);
    }, report);
  /** Takes in a feed answer: ledgers newly shared with the user come whole, `more` is asked for. */
  const accept = async (sync: Sync): Promise<void> => {
    if (sync.resync) return reload();
    const before = confirmed.current!;
    let next = applyChanges(before, sync);
    const fresh = sync.ledgerIds.filter((id) => !before.ledgers.some((ledger) => ledger.id === id));
    // shortcut: more than 90 new ledgers at once take the whole snapshot again.
    if (fresh.length > 90) return reload();
    if (fresh.length)
      next = mergeSnapshot(
        next,
        await api<Snapshot>('GET', `/api/snapshot?ledgers=${fresh.join(',')}`),
      );
    confirmed.current = next;
    if (sync.more) return accept(await api('GET', '/api/sync', undefined, next.seq));
    if (!pending.current) setData(next);
  };
  const catchUp = () =>
    api('GET', '/api/sync', undefined, confirmed.current?.seq)
      .then(accept)
      .catch(() => {});
  useEffect(() => {
    reload();
  }, []);
  // Each room opens on 내역.
  useEffect(() => setRoomView('records'), [roomId]);
  // A shared ledger's room can change under the person: while it shows, check for others'
  // changes, queued after any change being sent. Each check that finds nothing waits longer, up
  // to POLL_LONGEST; something new, or the person's own change, starts again from POLL_FIRST. A
  // hidden page does not check, and checks at once when it shows again. A 메모 needs none.
  const watching = Boolean(roomId) && (data?.ledgerMembers?.[roomId!]?.length ?? 0) > 1;
  useEffect(() => {
    if (!watching) return;
    let delay = POLL_FIRST;
    let timer: number | undefined;
    const later = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === 'visible') timer = window.setTimeout(check, delay);
    };
    const check = () => {
      window.clearTimeout(timer);
      queue.current = queue.current.then(() =>
        api('GET', '/api/sync', undefined, confirmed.current?.seq)
          .then((sync) => {
            delay = sync.changes.length ? POLL_FIRST : Math.min(delay * 2, POLL_LONGEST);
            return accept(sync);
          })
          // A failed check stays quiet; the next one tries again.
          .catch(() => {})
          .then(() => {
            if (wake.current === soon) later();
          }),
      );
    };
    const soon = () => {
      delay = POLL_FIRST;
      later();
    };
    const shown = () =>
      document.visibilityState === 'visible' ? check() : window.clearTimeout(timer);
    wake.current = soon;
    document.addEventListener('visibilitychange', shown);
    later();
    return () => {
      wake.current = undefined;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', shown);
    };
  }, [watching]);

  const change = (
    local: (data: Snapshot) => Snapshot,
    method: 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ) => {
    setData((current) => current && local(current));
    pending.current += 1;
    wake.current?.();
    queue.current = queue.current.then(() =>
      api(method, path, body, confirmed.current?.seq)
        .then(accept, (failure) => {
          report(failure, () => change(local, method, path, body));
          // Catch up with the server quietly, keeping the notice and its 다시 시도.
          return catchUp();
        })
        .catch(report)
        .finally(() => {
          pending.current -= 1;
          // Show only what the server holds, so nothing unsaved looks saved.
          if (!pending.current && confirmed.current) setData(confirmed.current);
        }),
    );
  };
  /** A change whose result only the server knows; the screen updates when it answers. */
  const send = (method: 'PUT' | 'DELETE', path: string, body?: unknown) =>
    change((current) => current, method, path, body);
  const saveLedger = (ledger: Ledger, parentIds: Id[], records: LedgerRecord[] = []) =>
    change(
      (current) => {
        const next = withLedger(current, ledger, parentIds);
        const sent = new Set(records.map((record) => record.id));
        return {
          ...next,
          records: [...next.records.filter((record) => !sent.has(record.id)), ...records],
        };
      },
      'PUT',
      `/api/ledgers/${ledger.id}`,
      { ledger, parentIds, ...(records.length ? { records } : {}) },
    );

  if (error?.login)
    return (
      <LoginView
        onLogin={reload}
        error="로그인은 아직 연결 전이에요. 로컬 개발 서버(npm run dev)에서 열어 주세요."
      />
    );
  if (!data)
    return (
      <StatusScreen busy={!error} action={<Button onClick={reload}>다시 시도</Button>}>
        {error ? error.message : '불러오는 중이에요'}
      </StatusScreen>
    );

  const room = data.ledgers.find((ledger) => ledger.id === roomId);
  const roomPath = room
    ? ledgerPath(data.ledgers, room.id, via?.roomId === room.id ? via.ids : undefined)
    : [];
  /** Only owners change a ledger: its 통계 charts and 반복 내역 included. */
  const owns = (ledgerId: Id) =>
    Boolean(
      data.ledgerMembers?.[ledgerId]?.some(
        (member) => member.profile.id === data.user.id && member.role === 'owner',
      ),
    );
  // 자산 count what has happened; 예정 records join once due.
  const dueRecords = data.records.filter((record) => !isScheduled(record, today));
  const friends = data.friends ?? [];
  const invites = data.invites ?? [];
  const me: Profile = {
    id: data.user.id,
    handle: data.user.handle,
    name: data.user.name,
    avatar: data.user.avatar ?? 'happy',
    ...(data.user.photo ? { photo: data.user.photo } : {}),
  };
  const unseen = unseenCounts(data.ledgers, data.records, data.seenAt, data.user.id);
  const tabBar = (
    <HomeTabBar
      tab={tab}
      pending={friends.filter((friend) => friend.status === 'incoming').length + invites.length}
      onTabChange={(next) => go({ tab: next })}
    />
  );
  const friendAction = (action: string) => (profile: Profile) =>
    send('PUT', `/api/friends/${profile.id}`, { action });
  const openRoom = (id: Id, through?: Id[]) => {
    setVia(through && { roomId: id, ids: through });
    go({ tab: 'ledgers', roomId: id });
    if (unseen[id])
      change(
        (current) => ({
          ...current,
          seenAt: { ...current.seenAt, [id]: new Date().toISOString() },
        }),
        'PUT',
        `/api/ledgers/${id}/seen`,
      );
  };
  const thisMonth = { start: today, end: addDays(addMonths(today, 1), -1) };
  const roomList = (
    <RoomListView
      ledgers={data.ledgers}
      records={data.records}
      unseen={unseen}
      today={today}
      currentId={roomId}
      currentPath={roomPath.map((ledger) => ledger.id)}
      onOpenRoom={(ledger, through) => openRoom(ledger.id, through)}
      onCreate={() => setSheet({ type: 'create' })}
      tabBar={tabBar}
    />
  );
  const settingsMenu = (
    <AppSettingsView
      current={wide ? settingsPage : undefined}
      onOpenProfile={() => go({ tab: 'settings', page: 'profile' })}
      onOpenAssets={() => go({ tab: 'settings', page: 'assets' })}
      tabBar={tabBar}
    />
  );
  const aside = !wide
    ? undefined
    : tab === 'ledgers'
      ? { list: roomList, label: '가계부 목록' }
      : tab === 'settings'
        ? { list: settingsMenu, label: '설정 메뉴' }
        : undefined;

  return (
    <>
      {error && (
        <Notice
          onClose={() => setError(undefined)}
          action={
            error.retry && (
              <Button
                variant="plain"
                onClick={() => {
                  setError(undefined);
                  error.retry!();
                }}
              >
                다시 시도
              </Button>
            )
          }
        >
          {error.message}
        </Notice>
      )}
      <AppShell
        logo={<UgaLogo size={120} alt="우리의 가계부" />}
        mark={<UgaLogo variant="mark" size={36} />}
        nav={tabBar}
        aside={aside?.list}
        asideLabel={aside?.label}
      >
        {room ? (
          <LedgerRoomView
            key={room.id}
            ledger={room}
            ledgers={data.ledgers}
            records={data.records}
            today={today}
            // On phones back is the room list; the desktop keeps the list beside the room.
            onBack={wide ? undefined : () => go({ tab: 'ledgers' })}
            path={roomPath}
            onOpenPath={(ledger, index) =>
              openRoom(
                ledger.id,
                roomPath.slice(0, index).map((item) => item.id),
              )
            }
            onViewChange={setRoomView}
            // Alone, the 대화 tab is the owner's 메모; it turns into 대화 once someone joins.
            memo={(data.ledgerMembers?.[room.id]?.length ?? 0) <= 1}
            // Every ledger, 상위 included, keeps one thread of its own.
            chat={
              <ChatThread
                memo={(data.ledgerMembers?.[room.id]?.length ?? 0) <= 1}
                messages={(data.messages ?? []).filter((message) => message.ledgerId === room.id)}
                memberId={data.user.id}
                members={data.members}
                people={data.ledgerMembers?.[room.id]?.map((member) => member.profile)}
                onToggleReaction={(message, reaction) => {
                  const on = !message.reactions?.[reaction]?.includes(data.user.id);
                  change(
                    (current) => ({
                      ...current,
                      messages: (current.messages ?? []).map((item) =>
                        item.id === message.id
                          ? withReaction(item, reaction, data.user.id, on)
                          : item,
                      ),
                    }),
                    on ? 'PUT' : 'DELETE',
                    `/api/messages/${message.id}/reactions/${reaction}`,
                  );
                }}
                onSend={(content) => {
                  const message = {
                    id: crypto.randomUUID(),
                    ledgerId: room.id,
                    authorId: data.user.id,
                    createdAt: new Date().toISOString(),
                    ...content,
                  };
                  change(
                    (current) => ({
                      ...current,
                      messages: [...(current.messages ?? []), message],
                    }),
                    'PUT',
                    `/api/messages/${message.id}`,
                    { ledgerId: room.id, ...content },
                  );
                }}
                onEdit={(message, text) =>
                  change(
                    (current) => ({
                      ...current,
                      messages: (current.messages ?? []).map((item) =>
                        item.id === message.id
                          ? { ...item, text, editedAt: new Date().toISOString() }
                          : item,
                      ),
                    }),
                    'PUT',
                    `/api/messages/${message.id}`,
                    { ledgerId: message.ledgerId, text },
                  )
                }
                onDelete={(message) => setSheet({ type: 'deleteMessage', message })}
              />
            }
            onAddRecord={(date) => {
              const ledgers = leafLedgers(data.ledgers, room);
              if (ledgers.length) setSheet({ type: 'entry', ledgers, date });
            }}
            reacting={{
              memberId: data.user.id,
              members: data.members,
              onToggleReaction: (record, reaction) => {
                const on = !record.reactions?.[reaction]?.includes(data.user.id);
                change(
                  (current) => ({
                    ...current,
                    records: current.records.map((item) =>
                      item.id === record.id ? withReaction(item, reaction, data.user.id, on) : item,
                    ),
                  }),
                  on ? 'PUT' : 'DELETE',
                  `/api/records/${record.id}/reactions/${reaction}`,
                );
              },
            }}
            onOpenRecord={(record) =>
              setSheet({
                type: 'entry',
                ledgers: data.ledgers.filter((ledger) => ledger.id === record.ledgerId),
                record,
              })
            }
            settings={
              <LedgerSettingsView
                key={room.id}
                ledger={room}
                ledgers={data.ledgers}
                today={today}
                onSave={({ ledger, parentIds }) => {
                  // Changed or stopped 반복 내역 carry over to their 예정 records.
                  const { changed, removed } = rescheduled(room, ledger, data.records, today);
                  saveLedger(ledger, parentIds, changed);
                  for (const id of removed)
                    change(
                      (current) => ({
                        ...current,
                        records: current.records.filter((record) => record.id !== id),
                      }),
                      'DELETE',
                      `/api/records/${id}`,
                    );
                }}
                onArchive={(ledger) => {
                  saveLedger({ ...ledger, archived: true }, parentIdsOf(data.ledgers, ledger.id));
                  back();
                }}
                onRestore={({ archived: _, ...ledger }) =>
                  saveLedger(ledger, parentIdsOf(data.ledgers, ledger.id))
                }
              />
            }
            onCopy={() => setSheet({ type: 'create', sourceId: room.id })}
            onSaveStatCards={
              owns(room.id)
                ? (statCards) =>
                    saveLedger({ ...room, statCards }, parentIdsOf(data.ledgers, room.id))
                : undefined
            }
            // A record's own ledger opens below this room, keeping the path down to it.
            onOpenLedger={(ledger) =>
              openRoom(ledger.id, [
                ...roomPath.map((item) => item.id),
                room.id,
                ...(pathBetween(data.ledgers, room.id, ledger.id) ?? []),
              ])
            }
            onOpenMembers={() => setSheet({ type: 'members', ledger: room })}
          />
        ) : tab === 'ledgers' ? (
          wide ? (
            <RoomPlaceholderView onCreate={() => setSheet({ type: 'create' })} />
          ) : (
            roomList
          )
        ) : tab === 'assets' ? (
          <AssetsView
            assets={data.assets ?? []}
            ledgers={data.ledgers}
            records={dueRecords}
            onManage={() => go({ tab: 'settings', page: 'assets' })}
            tabBar={tabBar}
          />
        ) : tab === 'settings' && settingsPage === 'assets' ? (
          <AssetManageView
            assets={data.assets ?? []}
            ledgers={data.ledgers}
            records={dueRecords}
            onAdd={() => setSheet({ type: 'asset' })}
            onOpenAsset={(asset) => setSheet({ type: 'asset', asset })}
            onBack={wide ? undefined : back}
            tabBar={tabBar}
          />
        ) : tab === 'settings' && !settingsPage ? (
          settingsMenu
        ) : tab === 'friends' ? (
          <FriendsView
            friends={friends}
            invites={invites}
            today={today}
            signupLink={{
              ...data.signupLink!,
              url: new URL(data.signupLink!.url, location.origin).href,
            }}
            onFind={(handle) =>
              api<{ profile: Profile | null }>(
                'GET',
                `/api/people?handle=${encodeURIComponent(handle)}`,
              ).then(
                (answer) => answer.profile,
                () => null,
              )
            }
            onRequest={friendAction('request')}
            onAccept={friendAction('accept')}
            onDecline={friendAction('decline')}
            onCancel={friendAction('cancel')}
            onRemove={friendAction('remove')}
            onBlock={friendAction('block')}
            onUnblock={friendAction('unblock')}
            onOpenInvite={(invite) => setSheet({ type: 'invite', invite })}
            onCopyLink={(url) => navigator.clipboard?.writeText(url)}
            onRenewLink={() => send('PUT', '/api/signup-link')}
            tabBar={tabBar}
          />
        ) : (
          <AccountView
            key={`${me.handle}-${me.photo ?? me.avatar}`}
            profile={me}
            email={data.user.email ?? ''}
            today={today}
            handleChangeableFrom={data.user.handleChangeableFrom}
            takenHandle={takenHandle}
            onSave={(profile, photo) => {
              setTakenHandle(undefined);
              const save = (method: 'PUT' | 'DELETE', path: string, body?: unknown) =>
                api(method, path, body, confirmed.current?.seq).then(accept);
              queue.current = queue.current.then(() =>
                save('PUT', '/api/profile', profile)
                  .then(async () => {
                    if (photo) await save('PUT', '/api/profile/photo', await reencodePhoto(photo));
                    else if (photo === null) await save('DELETE', '/api/profile/photo');
                  })
                  .catch((failure) => {
                    if (failure instanceof ApiFailure && failure.code === 'HANDLE_TAKEN')
                      setTakenHandle(profile.handle);
                    else report(failure);
                  }),
              );
            }}
            onLogout={() =>
              setError({
                message: '로컬 개발 계정은 로그아웃할 수 없어요. Google 로그인을 붙인 뒤에 열어요.',
              })
            }
            onLeave={() => setError({ message: '탈퇴는 Google 로그인을 붙인 뒤에 열어요.' })}
            onBack={wide ? undefined : back}
            tabBar={tabBar}
          />
        )}
      </AppShell>
      {sheet?.type === 'entry' && (
        <RecordEntryView
          ledgers={sheet.ledgers}
          record={sheet.record}
          date={sheet.date}
          today={today}
          memberId={data.user.id}
          suggestions={data.records.map((record) => record.title)}
          onSave={(record, keepOpen, rule) => {
            if (rule) {
              // A new 반복 내역: the rule joins its ledger with this record and the 예정 ones after it.
              const ledger = data.ledgers.find((item) => item.id === record.ledgerId)!;
              saveLedger(
                { ...ledger, recurring: [...(ledger.recurring ?? []), rule] },
                parentIdsOf(data.ledgers, ledger.id),
                [record, ...writeAhead(ledger, rule, data.user.id, record.date)],
              );
            } else
              change(
                (current) => ({
                  ...current,
                  records: [...current.records.filter((item) => item.id !== record.id), record],
                }),
                'PUT',
                `/api/records/${record.id}`,
                record,
              );
            if (!keepOpen) setSheet(undefined);
          }}
          repeatable={owns}
          onDelete={(record) => {
            change(
              (current) => ({
                ...current,
                records: current.records.filter((item) => item.id !== record.id),
              }),
              'DELETE',
              `/api/records/${record.id}`,
            );
            setSheet(undefined);
          }}
          onLedgerChange={(ledger) => saveLedger(ledger, parentIdsOf(data.ledgers, ledger.id))}
          assetNameFor={(ledgerId) => assetFor(data.assets ?? [], data.ledgers, ledgerId)?.name}
          onClose={() => setSheet(undefined)}
        />
      )}
      {sheet?.type === 'deleteMessage' && (
        <Dialog title="메시지를 지울까요?" onClose={() => setSheet(undefined)}>
          <FormBody>
            <p>모두의 대화에서 사라지고, 이 글에 단 답장에는 "삭제된 메시지"로 보여요.</p>
          </FormBody>
          <FormFooter>
            <CloseButton variant="secondary" autoFocus>
              취소
            </CloseButton>
            <Button
              variant="primary"
              className="view-danger"
              onClick={() => {
                const { id } = sheet.message;
                change(
                  (current) => ({
                    ...current,
                    messages: (current.messages ?? []).filter((item) => item.id !== id),
                  }),
                  'DELETE',
                  `/api/messages/${id}`,
                );
                setSheet(undefined);
              }}
            >
              지우기
            </Button>
          </FormFooter>
        </Dialog>
      )}
      {sheet?.type === 'asset' && (
        <AssetEditView
          asset={sheet.asset}
          assets={data.assets ?? []}
          ledgers={data.ledgers}
          today={today}
          onSave={(asset) => {
            change(
              (current) => ({
                ...current,
                assets: [...(current.assets ?? []).filter((item) => item.id !== asset.id), asset],
              }),
              'PUT',
              `/api/assets/${asset.id}`,
              asset,
            );
            setSheet(undefined);
          }}
          onDelete={(asset) => {
            change(
              (current) => ({
                ...current,
                assets: (current.assets ?? []).filter((item) => item.id !== asset.id),
              }),
              'DELETE',
              `/api/assets/${asset.id}`,
            );
            setSheet(undefined);
          }}
          onClose={() => setSheet(undefined)}
        />
      )}
      {sheet?.type === 'members' && (
        <LedgerMembersView
          ledger={sheet.ledger}
          meId={data.user.id}
          members={data.ledgerMembers?.[sheet.ledger.id] ?? []}
          below={
            sheet.ledger.childIds.length
              ? leafLedgers(data.ledgers, sheet.ledger).map((ledger) => ({
                  ledger,
                  owned: Boolean(
                    data.ledgerMembers?.[ledger.id]?.some(
                      (member) => member.profile.id === data.user.id && member.role === 'owner',
                    ),
                  ),
                }))
              : undefined
          }
          friends={friends
            .filter((friend) => friend.status === 'friend')
            .map((friend) => friend.profile)}
          onInvite={(invite) => send('PUT', `/api/ledgers/${sheet.ledger.id}/invites`, invite)}
          onRoleChange={(profile, role) =>
            send('PUT', `/api/ledgers/${sheet.ledger.id}/members/${profile.id}`, { role })
          }
          onRemove={(profile) =>
            send('DELETE', `/api/ledgers/${sheet.ledger.id}/members/${profile.id}`)
          }
          onLeave={() => {
            send('DELETE', `/api/ledgers/${sheet.ledger.id}/members/${data.user.id}`);
            setSheet(undefined);
            back();
          }}
          onFindFriends={() => {
            setSheet(undefined);
            go({ tab: 'friends' });
          }}
          onClose={() => setSheet(undefined)}
        />
      )}
      {sheet?.type === 'invite' && (
        <InviteAcceptView
          invite={sheet.invite}
          ledgers={data.ledgers}
          onAccept={({ parentIds }) => {
            send('PUT', `/api/invites/${sheet.invite.id}`, { parentIds });
            setSheet(undefined);
          }}
          onDecline={() => {
            send('DELETE', `/api/invites/${sheet.invite.id}`);
            setSheet(undefined);
          }}
          onCreateParent={(name) => {
            const id = crypto.randomUUID();
            saveLedger(
              { id, name, icon: 'ledger', period: thisMonth, kinds: [], fields: [], childIds: [] },
              [],
            );
            return id;
          }}
          onClose={() => setSheet(undefined)}
        />
      )}
      {sheet?.type === 'create' && (
        <CreateLedgerView
          ledgers={data.ledgers}
          today={today}
          initialSourceId={sheet.sourceId}
          onCreate={({ ledger, parentIds }) => {
            // A copy's 반복 내역 write the new period's 예정 records with it.
            saveLedger(
              ledger,
              parentIds,
              (ledger.recurring ?? []).flatMap((rule) => writeAhead(ledger, rule, data.user.id)),
            );
            setSheet(undefined);
            go({ tab: 'ledgers', roomId: ledger.id });
          }}
          onCreateParent={(name) => {
            const id = crypto.randomUUID();
            saveLedger(
              { id, name, icon: 'ledger', period: thisMonth, kinds: [], fields: [], childIds: [] },
              [],
            );
            return id;
          }}
          onClose={() => setSheet(undefined)}
        />
      )}
    </>
  );
}
