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
import {
  ROOM_LATEST,
  applyChanges,
  mergeSnapshot,
  pendingKeys,
  replay,
  withOlder,
  type Snapshot,
  type Sync,
} from '../../shared/sync';
import { ApiFailure, api } from './api';
import { reencodePhoto } from './photo';
import { useRoute } from './route';
import {
  clearState,
  pushOutbox,
  readOutbox,
  readState,
  removeOutbox,
  stored,
  writeState,
} from './store';

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
/** The device's copy is stored this long after the last change to it, not on every one. */
const STORE_AFTER = 500;
/** Waits between tries while the server cannot be reached; the last one repeats. */
const RETRY = [5000, 10000, 20000, 60000];

/** What tabs tell each other on BroadcastChannel `budget` (docs/sync-plan.md §4.3). */
type TabMessage =
  /** The syncing tab stored the copy: read it again. */
  | { type: 'state' }
  /** To the syncing tab: send the outbox, and with `sync` ask the feed too. */
  | { type: 'outbox' | 'sync' }
  /** To the syncing tab: a room's 이전 글 another tab loaded, to keep in the copy. */
  | { type: 'older'; messages: ChatMessage[] }
  /** The copy is gone (§4.5): show the login screen, or start again. */
  | { type: 'logout' | 'reset' };

/**
 * The app layer: keeps the user's data on this device, opens rooms and sheets, and saves through
 * the API. The data comes whole once (snapshot); after that every answer lists what changed since
 * the device's cursor (docs/sync-plan.md §3.9). A change shows at once and waits in the outbox
 * until the server takes it, one at a time in order (§4.2).
 */
export function App() {
  const [data, setData] = useState<Snapshot>();
  const [error, setError] = useState<{ message: string; login?: boolean }>();
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
  /** Rooms whose 대화 is loaded back to its first message. */
  const [fullChats, setFullChats] = useState<Set<Id>>(() => new Set());
  /** Calls to the server, one at a time: the outbox, checks for others' changes, their answers. */
  const queue = useRef(Promise.resolve());
  /**
   * This device's copy (docs/sync-plan.md §4.1): the server's state as last answered, with the
   * changes still in the outbox made in it. The screen shows it and the device stores it.
   */
  const state = useRef<Snapshot>(undefined);
  /** This page's changes still in the outbox, by key, for making again over a copy read afresh. */
  const locals = useRef(new Map<number, (data: Snapshot) => Snapshot>());
  /** Whether this tab sends, checks and stores for every tab (§4.3); the others read its copy. */
  const [leading, setLeading] = useState(false);
  const syncing = useRef(false);
  const channel = useRef<BroadcastChannel>(undefined);
  const tell = (message: TabMessage) => channel.current?.postMessage(message);
  const storing = useRef<number>(undefined);
  const retry = useRef({ timer: 0, count: 0 });
  /** What the server last refused in the outbox, told once the data is taken whole again. */
  const refusal = useRef<string>(undefined);
  /** Counts the copies forgotten, so a snapshot asked for before cannot bring one back. */
  const epoch = useRef(0);
  /** Brings the next check for others' changes forward, while a shared room is open. */
  const wake = useRef<() => void>(undefined);
  const today = localDate(new Date());

  /** Drops this page's copy; a request already out comes back to nothing. */
  const drop = () => {
    epoch.current += 1;
    window.clearTimeout(storing.current);
    window.clearTimeout(retry.current.timer);
    state.current = undefined;
    refusal.current = undefined;
    locals.current.clear();
    setData(undefined);
    setFullChats(new Set());
  };
  /** Once the copy is gone: the login screen, or after `reset` the syncing tab starts again. */
  const after = (then: 'logout' | 'reset') => {
    setError(then === 'logout' ? { message: '', login: true } : undefined);
    if (then === 'reset' && syncing.current) start();
  };
  /** Forgets this device's copy and outbox in every tab (docs/sync-plan.md §4.5, §8.16). */
  const forget = (then: 'logout' | 'reset') => {
    drop();
    tell({ type: then });
    return clearState().then(() => after(then));
  };
  /** A 401, or a session of another account: forgets the copy, and says so (§4.5). */
  const leave = (failure: unknown) =>
    failure instanceof ApiFailure && failure.status === 401
      ? forget('logout')
      : failure instanceof ApiFailure && failure.code === 'ACCOUNT_CHANGED'
        ? forget('reset')
        : undefined;
  const report = (failure: unknown) => {
    if (leave(failure)) return;
    setError({ message: failure instanceof Error ? failure.message : '문제가 생겼어요.' });
  };
  /**
   * Shows the device's copy. The syncing tab stores it STORE_AFTER after the last change (§4.1)
   * and tells the other tabs.
   */
  const commit = (next: Snapshot) => {
    state.current = next;
    setData(next);
    if (!syncing.current) return;
    window.clearTimeout(storing.current);
    storing.current = window.setTimeout(
      () => writeState(next).then((done) => done && tell({ type: 'state' })),
      STORE_AFTER,
    );
  };
  /** This page's changes still waiting, made over `data`. */
  const unsent = (data: Snapshot) =>
    [...locals.current.values()].reduce((next, local) => local(next), data);
  /** The whole data again, with this page's unsent changes made over it. */
  const reload = () => {
    const asked = epoch.current;
    return api<Snapshot>('GET', '/api/snapshot', undefined, state.current).then((answer) => {
      if (asked !== epoch.current) return;
      commit(unsent(answer));
      setFullChats(new Set());
      setError(undefined);
    });
  };
  /** The stored copy with this page's changes still in the outbox; resolves whether there was one. */
  const refresh = async () => {
    const [copy, queued] = await Promise.all([readState(), readOutbox()]);
    const waiting = new Set(queued.map((item) => item.key));
    for (const key of locals.current.keys()) if (!waiting.has(key)) locals.current.delete(key);
    if (copy) commit(unsent(copy));
    return Boolean(copy);
  };
  /**
   * Takes in a feed answer, keeping the targets of changes still in the outbox (`skip`, read
   * from it when not given): ledgers newly shared with the user come whole, `more` is asked for.
   * It applies to the copy as it is once the answer is complete, so a change made meanwhile stays.
   */
  const accept = async (answer: Sync, skip?: Set<string>): Promise<void> => {
    if (answer.resync) return reload();
    const fresh = answer.ledgerIds.filter(
      (id) => !state.current!.ledgers.some((ledger) => ledger.id === id),
    );
    // shortcut: more than 90 new ledgers at once take the whole snapshot again.
    if (fresh.length > 90) return reload();
    const part = fresh.length
      ? await api<Snapshot>(
          'GET',
          `/api/snapshot?ledgers=${fresh.join(',')}`,
          undefined,
          state.current,
        ).catch(() => undefined)
      : undefined;
    const skipped = skip ?? pendingKeys(await readOutbox());
    if (!state.current) return; // forgotten meanwhile
    let next = applyChanges(state.current, answer, skipped);
    if (part) next = mergeSnapshot(next, part);
    // What was saved stays; the new ledgers stay out, so the next try asks for them again.
    else if (fresh.length)
      next = { ...next, ledgers: next.ledgers.filter((ledger) => !fresh.includes(ledger.id)) };
    commit(next);
    if (fresh.length && !part) throw new ApiFailure(0, '서버에 연결하지 못했어요.');
    if (answer.more) return accept(await api('GET', '/api/sync', undefined, next), skip);
  };
  /**
   * The way to the server for changes and checks: sends the outbox in order, then with `feed`
   * asks what changed; resolves whether anything came. After changes the server refused, the data
   * is taken whole once and the last refusal told. While the server cannot be reached it tries
   * again after RETRY, and when the device is online or the page shows again.
   */
  const sync = (feed = false) => {
    window.clearTimeout(retry.current.timer);
    const run = queue.current.then(async () => {
      if (!syncing.current || !state.current) return false;
      try {
        const sent = await replay({
          read: readOutbox,
          send: (item) => api(item.method, item.path, item.body, state.current),
          remove: (key) => {
            locals.current.delete(key);
            return removeOutbox(key);
          },
          accept,
          refused: (failure) => leave(failure) ?? (refusal.current = (failure as Error).message),
        });
        if (!state.current) return false; // forgotten meanwhile
        if (!sent) throw new ApiFailure(0, '서버에 연결하지 못했어요.');
        if (refusal.current) {
          await reload();
          if (refusal.current) setError({ message: refusal.current }); // unless forgotten meanwhile
          refusal.current = undefined;
        }
        const answer = feed ? await api('GET', '/api/sync', undefined, state.current) : undefined;
        if (answer) await accept(answer);
        retry.current.count = 0;
        return Boolean(answer?.changes.length);
      } catch (failure) {
        if (leave(failure)) return false;
        const wait = RETRY[Math.min(retry.current.count++, RETRY.length - 1)];
        retry.current.timer = window.setTimeout(() => sync(feed), wait);
        return false;
      }
    });
    queue.current = run.then(() => {});
    return run;
  };
  /** The data from the server whole, then any changes left in the outbox. */
  const start = () => reload().then(() => sync(), report);
  /** Starts again in every tab: the syncing one takes the snapshot, the others wait for it. */
  const again = () => {
    tell({ type: 'reset' });
    after('reset');
  };
  // A stored copy shows at once. The syncing tab reads it again when it takes over and catches
  // up behind it; without one it takes the snapshot first, and the other tabs wait for it.
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    if (leading) refresh().then((found) => (found ? sync(true) : start()));
  }, [leading]);
  // One tab holds the lock for its life and alone sends, checks and stores (§4.3); when it goes,
  // the next takes over. Without Web Locks or IndexedDB each tab does all of it for itself.
  useEffect(() => {
    const stop = new AbortController();
    let release = () => {};
    const lead = () => {
      syncing.current = true;
      setLeading(true);
    };
    stored().then((shared) => {
      if (stop.signal.aborted) return;
      if (!shared || !navigator.locks) return lead();
      navigator.locks
        .request('budget-sync', { signal: stop.signal }, () => {
          lead();
          return new Promise<void>((resolve) => (release = resolve));
        })
        .catch(() => {}); // the page went while waiting
    });
    return () => {
      stop.abort();
      release();
      syncing.current = false;
      setLeading(false);
    };
  }, []);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const tabs = new BroadcastChannel('budget');
    channel.current = tabs;
    tabs.onmessage = ({ data: message }: MessageEvent<TabMessage>) => {
      if (message.type === 'logout' || message.type === 'reset') {
        drop();
        after(message.type);
      } else if (!syncing.current) {
        if (message.type === 'state') refresh();
      } else if (message.type === 'outbox') sync();
      else if (message.type === 'sync') sync(true);
      else if (message.type === 'older' && state.current)
        commit(withOlder(state.current, message.messages));
    };
    return () => {
      channel.current = undefined;
      tabs.close();
    };
  }, []);
  // Unsent changes go as soon as the device is online again or the page shows again (§4.2); the
  // waits between tries start over, since `online` may come a moment before the network does.
  useEffect(() => {
    const now = () => {
      if (document.visibilityState !== 'visible') return;
      retry.current.count = 0;
      sync();
    };
    window.addEventListener('online', now);
    document.addEventListener('visibilitychange', now);
    return () => {
      window.removeEventListener('online', now);
      document.removeEventListener('visibilitychange', now);
    };
  }, []);
  // Each room opens on 내역.
  useEffect(() => setRoomView('records'), [roomId]);
  // A shared ledger's room can change under the person: while it shows, check for others'
  // changes, after the outbox is empty. Each check that finds nothing waits longer, up to
  // POLL_LONGEST; something new, or the person's own change, starts again from POLL_FIRST. A
  // hidden page does not check, and checks at once when it shows again. A 메모 needs none.
  const watching = Boolean(roomId) && (data?.ledgerMembers?.[roomId!]?.length ?? 0) > 1;
  useEffect(() => {
    if (!watching || !leading) return;
    let delay = POLL_FIRST;
    let timer: number | undefined;
    const later = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === 'visible') timer = window.setTimeout(check, delay);
    };
    const check = () => {
      window.clearTimeout(timer);
      sync(true).then((news) => {
        delay = news ? POLL_FIRST : Math.min(delay * 2, POLL_LONGEST);
        if (wake.current === soon) later();
      });
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
  }, [watching, leading]);

  /**
   * A change: made on the device's copy at once, put in the outbox, then sent in turn (§4.2).
   * `local` makes it; it runs again over a snapshot taken before the change is sent.
   */
  const change = (
    local: (data: Snapshot) => Snapshot,
    method: 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ) => {
    commit(local(state.current!));
    wake.current?.();
    pushOutbox({ method, path, body, createdAt: new Date().toISOString() }).then((key) => {
      locals.current.set(key, local);
      if (syncing.current) sync();
      else tell({ type: 'outbox' });
    });
  };
  /** A room's 100 messages before its oldest loaded one (이전 글). */
  const loadOlder = (ledgerId: Id) => {
    const oldest = state.current?.messages?.find((message) => message.ledgerId === ledgerId);
    api<ChatMessage[]>(
      'GET',
      `/api/messages?ledger=${ledgerId}&before=${encodeURIComponent(oldest?.createdAt ?? '9999')}`,
      undefined,
      state.current,
    )
      .then((older) => {
        if (!state.current) return;
        if (older.length < 100) setFullChats((full) => new Set(full).add(ledgerId));
        commit(withOlder(state.current, older));
        if (!syncing.current) tell({ type: 'older', messages: older });
      })
      .catch(report);
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
        onLogin={again}
        error="로그인은 아직 연결 전이에요. 로컬 개발 서버(npm run dev)에서 열어 주세요."
      />
    );
  if (!data)
    return (
      <StatusScreen busy={!error} action={<Button onClick={again}>다시 시도</Button>}>
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
  const roomMessages = (data.messages ?? []).filter((message) => message.ledgerId === roomId);
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
      {error && <Notice onClose={() => setError(undefined)}>{error.message}</Notice>}
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
                messages={roomMessages}
                // The snapshot holds each room's latest 200: a room with that many may have more.
                hasOlder={roomMessages.length >= ROOM_LATEST && !fullChats.has(room.id)}
                onLoadOlder={() => loadOlder(room.id)}
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
                      // Made again over a copy that may hold it already.
                      messages: [
                        ...(current.messages ?? []).filter((item) => item.id !== message.id),
                        message,
                      ],
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
                api(method, path, body, state.current).then((answer) =>
                  syncing.current ? accept(answer) : tell({ type: 'sync' }),
                );
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
            // shortcut: no server session yet (the dev account), so logging out forgets this
            // device's data and shows the login screen; Google login adds ending the session.
            onLogout={() => forget('logout')}
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
                    // It stays without content, as the server keeps it, for the answers to it.
                    messages: (current.messages ?? []).map((item) =>
                      item.id === id
                        ? {
                            id,
                            ledgerId: item.ledgerId,
                            authorId: item.authorId,
                            createdAt: item.createdAt,
                            ...(item.replyTo ? { replyTo: item.replyTo } : {}),
                            deleted: true as const,
                          }
                        : item,
                    ),
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
