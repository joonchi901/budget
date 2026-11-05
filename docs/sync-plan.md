# 동기화·성능 개선 계획 (P0–P3)

기준일: 2026-11-05. [가계부 재설계 기준](./ledger-baseline.md) §8(보안)을 그대로 지키면서 DB 읽기를 줄이고, 기기 저장(local-first)과 실시간 전달로 가는 순서다. 구현자는 **단계 순서대로, 한 단계를 한 PR로** 끝낸다. 각 단계는 앞 단계 위에 올라가고, 뒤 단계가 버리는 코드는 P0-b뿐이다.

- **확정**: 이 문서가 정한 것. 바꾸려면 이 문서를 먼저 고친다.
- **구현자 판단**: 제약 안에서 구현자가 정한다. 정한 내용은 코드 주석이나 PR 설명에 남긴다.

## 0. 출발점

### 지금 구조

| 구분 | 현재 |
| --- | --- |
| 저장소 | D1 하나. 가계부(유형·필드·통계 카드·반복 규칙은 JSON 열), 내역, 반응, 대화, 대화 반응, 자산, 사람·친구·초대·가입 링크, 프로필 사진(BLOB) |
| 읽기 | 모든 API 응답이 **그 사용자의 전체 데이터**다. `load()`(`src/server/index.ts`)가 쿼리 7개를 병렬로 돌려 모든 가계부·모든 내역·반응·멤버·자산·최근 대화 500개를 돌려주고, `loadPeople()`(`src/server/people.ts`)이 친구·초대·멤버·새 내역 수를 더한다 |
| 쓰기 | 클라이언트가 ID(UUID)를 만들고 객체를 통째로 PUT, 서버가 upsert. 권한·검증은 전체 데이터 기준. 그래서 **쓰기 1건 = `load()` 2번**(검증용, 응답용) |
| 클라이언트 | `App.tsx`가 메모리에 `AppData` 하나. 낙관적 반영 → `queue`로 순차 전송 → 서버 응답이 상태를 통째로 교체. 실패하면 `confirmed`로 되돌리고 전체 재로드. 합계·통계·필터·반복 내역 생성은 전부 클라이언트(`src/shared/ledger.ts`) |
| 대화 | 공유 가계부의 대화 탭이 열려 있으면 5초마다 `GET /api/data` 전체 |
| 기기 저장 | 없음. 서비스 워커·매니페스트 없음 |

### 측정값 (2년치: 내역 3,000·반응 1,000·대화 6,000, 멤버 2명)

| 동작 | 읽는 행 |
| --- | --- |
| `load()` 1회 | 약 16,000 (내역 테이블을 4번 스캔: 내역, 반응, 사람 목록 UNION 2번) |
| 쓰기 1건 | 약 32,000 |
| 대화 폴링 1회 | 약 16,000 (대화 자체는 약 1,700) |

Cloudflare 무료 한도(2026-11-05 공식 문서): D1 읽기 500만 행/일, 쓰기 10만 행/일, DB당 500MB. Workers 요청 10만/일, 요청당 CPU 10ms. Durable Objects 요청 10만/일(SQLite 저장소 클래스만 무료).

### 목표 수치

| 단계 | 요청당 읽는 행 | 하루 활성 사용자(무료) |
| --- | --- | --- |
| P0 | 읽기 8,000·쓰기 8,000·대화 폴링 ≤ 30 | 약 60명 |
| P1 | 변경 없는 폴링 ≈ 가계부 수 + 2, 내역 쓰기 ≈ 가계부 수 × 4 + 8 (2년치·가계부 24개 실측: 26, 약 101) | 약 250명 (한도는 Workers 요청) |
| P2 | 새로고침·재방문 시 서버 읽기 0 | 같음, 체감 즉시 |
| P3 | 폴링 없음 | 수천 명 |

## 1. 공통 원칙 (확정)

1. **서버 D1이 원본, 기기는 복제본(캐시)이다.** 새 기기 로그인, 멤버 변경, 탈퇴, 권한은 서버 상태로 정한다. 기기 저장은 언제든 지워져도 되고(§8.16) 서버에서 다시 받는다.
2. **P1부터 모든 API 응답은 "변경 목록"이다.** 전체 데이터는 처음 한 번(스냅숏)만 받는다.
3. **권한은 매 요청 서버가 확인한다(§8.2).** 변경 피드도 "지금 멤버인 가계부"의 변경만 준다. 멤버에서 빠지면 다음 피드에서 그 가계부가 사라진다(§8.4).
4. **쓰기는 멱등이다.** 같은 요청을 두 번 보내도 결과가 같다. 재전송(P2 outbox)의 전제다.
5. **충돌은 마지막 쓰기 승(LWW)이다.** 가계부 설정은 소유자만, 대화는 작성자만 고치므로 실제 충돌은 두 사람이 같은 내역을 동시에 고칠 때뿐이고 지금도 LWW다. CRDT·동기화 엔진(Yjs, Replicache, PowerSync 등)은 쓰지 않는다.
6. **런타임 의존성을 더하지 않는다.** IndexedDB·Web Locks·BroadcastChannel·WebSocket은 플랫폼 기능을 직접 쓴다. 서비스 워커 빌드용 `vite-plugin-pwa`만 devDependency로 허용한다.
7. **기존 관례를 따른다.** 코드 주석은 영어(도메인 용어는 한국어), 사용자 메시지는 한국어, 검증은 `src/shared`의 순수 함수, 서버 오류는 `fail()`/`invalid()`.

## 2. P0 — 안전 패치

무료 티어를 바로 넘기지 않게 하는 작은 변경. **P1을 바로 이어서 구현한다면 P0-a만 하고 P0-b는 건너뛴다.**

### P0-a 폴링 제어 (유지되는 코드)

`src/client/app/App.tsx`의 대화 폴링 `useEffect`:

- `document.visibilityState !== 'visible'`이면 폴링하지 않는다. `visibilitychange`로 다시 보이면 즉시 한 번 확인하고 재개한다.
- 간격: 새 글이 있었으면 5초, 없으면 5 → 10 → 20 → 30초로 늘리고 30초에서 멈춘다. 내가 글을 보내거나 새 글을 받으면 5초로 돌아간다.
- 폴링 중 실패는 조용히 무시한다(지금과 같음).

### P0-b 대화만 읽는 폴링 (P1이 대체)

- 서버: `GET /api/messages?ledger=<id>&after=<createdAt>` — 멤버 확인 후 `messages_ledger` 인덱스로 그 방의 `created_at > after`인 글과, `edited_at > after`인 글을 돌려준다. 응답은 `ChatMessage[]`(반응 포함).
- 클라이언트: 폴링에서만 이 주소를 부르고, 받은 글을 `data.messages`에 id 기준으로 합친다. 다른 사람의 **삭제는 이 방식으로 알 수 없다**(전체 재로드 때 반영). P1이 해결한다.
- `shortcut:` 주석으로 한계를 남긴다.

### P0에서 하지 않는 것

쓰기의 `load()` 2번은 응답 형식을 바꿔야 줄어들므로 P1에서 한다. 사람 목록 쿼리의 UNION 스캔도 P1에서 함께 사라진다.

## 3. P1 — 변경 로그와 동기화 API

### 3.1 설계 요지 (확정)

- `changes` 테이블 하나에 **"무엇이 바뀌었나"만** 적는다(내용은 적지 않는다). 모든 쓰기가 같은 `db.batch`에 로그 행을 넣는다(원자성).
- 피드는 로그에서 내 범위의 행을 읽고, **바뀐 대상을 그때 다시 조회해** 요청자 관점으로 payload를 만든다. 같은 대상이 여러 번 바뀌었으면 마지막 한 번만 조회한다. 조회했는데 없거나 볼 수 없으면 "사라짐"으로 보낸다.
- 대상의 삭제는 지금처럼 실제 삭제다. 예외는 **대화**: 지운 글에 단 답장을 "삭제된 메시지"로 보여야 하므로(§8.14) `deleted_at` 소프트 삭제로 바꾼다.
- 반응은 별도 종류가 아니다. 내역 반응이 바뀌면 `record` 변경, 대화 반응이 바뀌면 `message` 변경으로 적고 payload에 반응을 포함한다.

### 3.2 스키마 — `migrations/0011_changes.sql`

```sql
-- What changed, for the sync feed. Rows carry no payload: the feed re-reads the target.
-- ledger_id scopes a row to a ledger's members; user_id to one user. One or both are set.
CREATE TABLE changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,            -- ledger | record | message | asset | members | friends | invites | seen | me
  id TEXT NOT NULL,              -- the target's id; for members/friends/invites/me, the scope id
  ledger_id TEXT,
  user_id TEXT,
  at TEXT NOT NULL
);
CREATE INDEX changes_ledger ON changes (ledger_id, seq);
CREATE INDEX changes_user ON changes (user_id, seq);

-- The feed answers resync when a client's cursor is older than what was pruned.
CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT INTO sync_meta VALUES ('pruned_to', 0);

-- 대화 soft delete: the row stays as a tombstone so answers to it read 삭제된 메시지.
ALTER TABLE messages ADD COLUMN deleted_at TEXT;
```

### 3.3 쓰기 경로 — 어느 핸들러가 어떤 로그 행을 쓰나 (확정)

헬퍼 `change(db, row)`가 `INSERT INTO changes` 준비문을 돌려주고, 각 핸들러는 자기 `db.batch([...])`에 넣는다. 지금 `.run()` 하나로 끝나는 핸들러는 `db.batch([쓰기, 로그])`로 바꾼다.

| 핸들러 (`src/server/index.ts`, `people.ts`) | 로그 행 |
| --- | --- |
| `putLedger` | `ledger` id=가계부 ledger_id=가계부. 함께 저장한 내역마다 `record`. 상위 연결이 바뀐 상위 가계부마다 `ledger`(소유자에게만 보이는 `childIds`가 바뀜) |
| `putRecord`, `deleteRecord` | `record` id=내역 ledger_id=가계부. 내역을 다른 가계부로 옮기면 양쪽 가계부로 한 행씩 |
| `setReaction` | `record` |
| `putMessage`, `deleteMessage`, `setMessageReaction` | `message` id=글 ledger_id=가계부 |
| `putAsset`, `deleteAsset` | `asset` id=자산 user_id=소유자 |
| `inviteMembers` | `members` id=ledger_id ledger_id=가계부; `invites` user_id=초대받은 사람마다 |
| `acceptInvite` | `ledger` id=가계부 user_id=나(새 가계부가 보이게); `members` ledger_id=가계부; `invites` user_id=나. 수락하며 넣은 내 상위 가계부마다 `ledger`(`childIds`가 바뀜, `putLedger`와 같은 이유) |
| `declineInvite` | `members` ledger_id=가계부; `invites` user_id=나 |
| `setMemberRole` | `members` ledger_id=가계부; `ledger` id=가계부 user_id=대상(권한이 바뀌면 `roles`가 바뀜); `invites` user_id=대상(아직 초대 중이면 받은 초대의 권한이 바뀜) |
| `removeMember`, 탈퇴 | `members` ledger_id=가계부; `ledger` id=가계부 user_id=빠진 사람(피드에서 "사라짐"으로 받아 지운다); `invites` user_id=빠진 사람(초대를 거둔 경우 받은 초대에서 사라짐) |
| `friendAction` | `friends` user_id=양쪽 각각 |
| `putProfile`, `putPhoto`, `deletePhoto` | `me` user_id=나; 내가 속한 가계부마다 `members`; 친구마다 `friends` user_id=친구 |
| `markSeen` | `seen` id=가계부 user_id=나 (내 다른 기기의 배지) |
| `renewSignupLink` | `me` user_id=나 |

멤버가 아닌 사람이 볼 수 없어야 하는 것은 로그가 아니라 **조회 시점의 권한**이 막는다(3.5의 payload 생성).

### 3.4 API (확정)

기존 `GET /api/data`와 "모든 응답 = 전체 데이터"를 없앤다. 서버와 클라이언트는 같이 배포한다.

| 주소 | 답 |
| --- | --- |
| `GET /api/snapshot` | 전체 데이터(지금 `load()`+`loadPeople()`과 같은 내용)에 `seq`와 `seenAt`을 더한 `Snapshot`. 대화는 **가계부마다 최근 200개** |
| `GET /api/snapshot?ledgers=a,b` | 그 가계부들만(멤버인 것만). 피드에서 새로 보이게 된 가계부를 받을 때 |
| `GET /api/sync?since=<seq>` | `since` 이후의 변경 목록 `Sync` |
| `GET /api/messages?ledger=<id>&before=<createdAt>` | 그 방의 더 오래된 글 100개(소프트 삭제 포함). 대화 위로 스크롤 "이전 글" |
| 모든 쓰기(PUT/DELETE) `?since=<seq>` | 쓰기 후 `Sync`(내 변경과 그 사이 남의 변경이 함께 온다). `since`가 없으면 `resync: true` |

`src/shared/sync.ts`:

```ts
export type Change =
  // data가 없으면 더는 볼 수 없다(삭제, 멤버에서 빠짐): 기기에서 지운다.
  | { kind: 'ledger'; id: Id; data?: Ledger; role?: MemberRole }
  | { kind: 'record'; id: Id; ledgerId: Id; data?: LedgerRecord }
  | { kind: 'message'; id: Id; ledgerId: Id; data: ChatMessage } // 삭제는 data.deleted
  | { kind: 'asset'; id: Id; data?: Asset }
  | { kind: 'members'; ledgerId: Id; data: LedgerMember[] }
  | { kind: 'friends'; data: Friend[] }
  | { kind: 'invites'; data: RoomInvite[] }
  | { kind: 'seen'; ledgerId: Id; data: string }
  | { kind: 'me'; data: Pick<AppData, 'user' | 'signupLink'> };

export type Sync = {
  seq: number;
  /** 지금 멤버인 가계부. 여기 없는 가계부의 데이터는 기기에서 지운다. */
  ledgerIds: Id[];
  changes: Change[];
  /** 로그가 잘려 since부터 이어 줄 수 없다: 스냅숏을 다시 받는다. */
  resync?: true;
  /** 1,000행을 넘어 더 있다: 같은 주소를 seq로 다시 부른다. */
  more?: true;
};

export type Snapshot = AppData & { seq: number; seenAt: { [ledgerId: Id]: string } };
```

`AppData`에서 `unseen`을 뺀다. 배지는 클라이언트가 `seenAt`과 내역으로 센다(`loadPeople`의 계산을 `src/shared`로 옮긴다). `ChatMessage`에 `deleted?: true`를 더한다.

### 3.5 피드 알고리즘 — `src/server/sync.ts` (확정)

```
1. members = SELECT ledger_id, role, seen_at FROM ledger_members WHERE user_id = me
2. pruned = SELECT value FROM sync_meta WHERE key = 'pruned_to'
   since < pruned 이면 { seq: max(seq), ledgerIds, changes: [], resync: true }
3. 한 db.batch(한 트랜잭션)로:
   top  = SELECT COALESCE(max(seq), 0) FROM changes
   mine = SELECT seq, kind, id, ledger_id FROM changes INDEXED BY changes_user
          WHERE user_id = ?me AND seq > ?since ORDER BY seq LIMIT 1000
   room = SELECT seq, kind, id, ledger_id FROM changes INDEXED BY changes_ledger
          WHERE ledger_id IN (?members...) AND seq > ?since ORDER BY seq LIMIT 1000
          (members 90개마다 한 문: 바인딩 상한 100)
   rows = mine과 room을 seq로 합치고 같은 seq를 지운 뒤 앞의 1,000개
4. (kind, id)로 중복을 지우고 마지막 것만 남긴다
5. kind별로 id를 모아 90개씩 IN 조회로 지금 상태를 읽고, 요청자 관점으로 payload를 만든다
   - ledger: 멤버가 아니면 data 없음. childIds는 소유자에게만(§8.1). role 포함
   - record: 행이 없거나 그 가계부 멤버가 아니면 data 없음. reactions 포함
   - message: 소프트 삭제면 text·sticker·reactions 없이 deleted: true
   - members/friends/invites/me: 그 범위의 목록을 통째로 다시 만든다(작다)
6. seq = rows가 있으면 마지막 행의 seq, 없으면 3의 top (같은 트랜잭션이라 그 사이 변경을 건너뛰지 않는다)
7. rows가 1,000개면 more: true
```

`EXPLAIN QUERY PLAN`으로 3의 쿼리가 두 인덱스를 OR로 쓰는지 확인한다(SQLite의 OR 최적화). 못 쓰면 `user_id = ?` 와 `ledger_id IN (...)`를 두 쿼리로 나눠 `UNION ALL` 한다.

확인 결과(구현 시): 통계가 없으면 `MULTI-INDEX OR`로 두 인덱스를 쓰지만, `ANALYZE` 뒤에는(D1은 `PRAGMA optimize`로 통계를 만들 수 있다) `seq` 범위 스캔으로 바뀌어 다른 집의 변경까지 읽는다(커서가 1만 행 뒤처지면 1,980행). 그래서 두 쿼리로 나누고 각각 `INDEXED BY changes_user`·`INDEXED BY changes_ledger`로 인덱스를 고정했다. `UNION ALL` 대신 같은 `db.batch`의 별개 문으로 보내고(한 트랜잭션) 코드에서 seq로 합친다.

### 3.6 서버 검증 범위 축소 (확정)

`load(db, user, scope)`의 `scope`는 `{ records: 'all' | Id[] | false; reactions?: true; people?: true }`다. `records`는 내역을 읽는 범위다: 전부, 주어진 가계부만(90개까지, `AND r.ledger_id IN (...)`), 또는 읽지 않음. `reactions`는 내역의 반응을 함께 읽고(스냅숏만), `people`은 친구·초대·멤버·가입 링크를 읽는다(스냅숏과 초대 핸들러만). 가계부 목록·역할·자산은 늘 읽는다(수십 행). 대화는 `load()`가 읽지 않고 스냅숏이 가계부마다 따로 읽는다. 디스패처는 자원별로 범위를 정한다.

| 요청 | 범위 |
| --- | --- |
| `records`, `messages`, 반응 | 내역 불필요: `scope = { records: false }`. 대상은 id로 직접 찾는다. `putRecord`의 `before`는 `data.records`가 아니라 `SELECT ... FROM records WHERE id = ?`로 찾는다(다른 가계부에서 옮겨 올 수 있음). `deleteRecord`·`setReaction`도 같은 방식으로 대상의 가계부를 찾는다. 옮길 때 양쪽 권한 확인은 `roles`로 한다. (처음 안은 "본문 또는 대상의 `ledgerId`" 범위였으나, 대상을 id로 찾고 나면 이 핸들러들은 `data.records`·`data.messages`를 전혀 쓰지 않아 그 가계부 내역을 읽는 것이 낭비라 바꿨다) |
| `ledgers` PUT | 가계부 목록은 전체(순환 검사·상위 연결), 내역은 그 가계부만(`IN_USE`, `HAS_RECORDS`). 상위 가계부의 "내역이 있는지"는 `SELECT 1 FROM records WHERE ledger_id = ? LIMIT 1`로 |
| `seen`, 멤버·초대·친구·프로필·자산 | 내역 불필요: `scope = { records: false }` |
| `snapshot`, `sync` | 위 3.4·3.5 |

각 핸들러가 `data.records`·`data.messages`에서 무엇을 찾는지 grep으로 확인하고, 범위 밖을 가정하는 곳을 고친다.

검증용 `load()`는 내역의 반응을 읽지 않고(어떤 검사도 보지 않음), 사람 목록(친구·초대·멤버·가입 링크)은 초대 핸들러(`inviteMembers`·`acceptInvite`·`declineInvite`)만 읽는다. 측정해 보니 가계부 24개·멤버 2명에서 사람 목록이 쓰기 한 번에 약 150행이라 "내역 쓰기 ≤ 그 가계부 내역 수 + 50"을 넘겼다.

### 3.7 대화 변경 (확정)

- `deleteMessage`: `UPDATE messages SET deleted_at = ?, text = NULL, sticker = NULL WHERE id = ? AND author_id = ?` + `DELETE FROM message_reactions WHERE message_id = ?`. 이미 지운 글은 성공으로 답한다(멱등). 쓴 사람이라도 지금 그 가계부 멤버가 아니면 `403`(§8.4, `putMessage`와 같음).
- `putMessage`: 같은 id가 있고 내용이 같으면(글은 `text`, 스티커는 `sticker`) 아무것도 하지 않고 성공(재전송 멱등). 지운 글은 고칠 수 없다(`403`). 답장 대상은 지운 글이어도 된다(지금 `SELECT 1 … WHERE id = ? AND ledger_id = ?` 유지).
- `setMessageReaction`: 지운 글에는 반응할 수 없다(`404`, 없는 글과 같음).
- 스냅숏·피드·`/api/messages` 모두 소프트 삭제 글을 `deleted: true`로 준다.
- 화면(`src/client/ledger/Chat.tsx`): 답장 대상이 로컬에 **있고** `deleted`면 "삭제된 메시지", 로컬에 **없으면** 그 방에 더 받을 이전 글이 남아 있을 때 "이전 글"(눌러서 이전 글 불러오기), 남아 있지 않으면 "삭제된 메시지"(이 변경 전에 실제로 지운 글은 tombstone이 없다). 지금은 둘 다 "삭제된 메시지"로 보인다.

### 3.8 로그 보관 (확정)

- `wrangler.jsonc`에 `"triggers": { "crons": ["17 18 * * *"] }`(매일 03:17 KST), Worker에 `scheduled()` 핸들러. `DELETE FROM changes WHERE at < 30일 전 AND seq < (SELECT max(seq) FROM changes)`, 지운 뒤 `UPDATE sync_meta SET value = (SELECT COALESCE(min(seq), 1) - 1 FROM changes) WHERE key = 'pruned_to'`. 가장 최근 행 하나는 늘 남겨 로그가 비지 않게 한다: 비면 "마지막 seq"를 `sqlite_sequence`에서 읽어야 하는데 D1이 내부 테이블 읽기를 막을 수 있다. 결과는 같다(커서가 마지막 seq − 1 이상이면 이어 받고, 그보다 작으면 `resync`).
- 30일 넘게 안 연 기기는 `resync`로 스냅숏을 다시 받는다.

### 3.9 클라이언트 (확정)

- `src/client/app/api.ts`: 답 형식이 `Snapshot | Sync`가 된다. `api()`가 현재 `seq`를 `?since=`로 붙인다.
- `src/shared/sync.ts`에 순수 함수 `applyChanges(data: Snapshot, sync: Sync, skip?: Set<string>): Snapshot`. (`AppData`가 아니라 `Snapshot`을 받고 돌려준다: `seen` 변경은 `seenAt`에, 답의 `seq`는 `seq`에 적어야 하는데 둘 다 `AppData`에 없다. 클라이언트 상태가 곧 `Snapshot`이다.) `skip`은 `"kind:id"` 집합으로, 아직 보내지 않은 내 변경이 있는 대상은 덮어쓰지 않는다(P2에서 쓴다). `ledgerIds`에 없는 가계부의 가계부·내역·대화·멤버를 지운다. 응답에 `more`가 있으면 호출자가 다시 부른다.
- `App.tsx`:
  - 시작: `GET /api/snapshot`.
  - `change()`: 낙관적 반영 → 쓰기 → 답(`Sync`)을 `applyChanges`. 실패(4xx)는 지금처럼 `confirmed`로 되돌리고, 재로드는 `GET /api/sync?since=`로.
  - 폴링(P0-a 규칙 유지): `GET /api/sync?since=`. 공유 가계부의 **어느 탭이든 방이 열려 있으면** 폴링한다(대화뿐 아니라 남의 내역도 바로 보이게). 메모(혼자)는 폴링하지 않는다.
  - 피드의 `ledgerIds`에 로컬에 없는 가계부가 있으면 `GET /api/snapshot?ledgers=`로 받아 합친다.
  - `resync`면 스냅숏을 다시 받는다.
- 대화 "이전 글": `ChatThread` 맨 위에 버튼, `GET /api/messages?ledger&before=`로 100개씩.

### 3.10 검증과 완료 조건

- `scripts/check-sync.mjs`(node:assert, Node 24가 `.ts`를 바로 실행): `applyChanges`의 추가·수정·삭제·가계부 사라짐·`skip`·`more` 없는 경우를 검사한다. `package.json`에 `"check:sync"` 스크립트.
- 로컬 두 계정(§8 끝의 방식. `DEV_AUTH`가 한 계정만 주면 loopback 한정 `X-Dev-User` 헤더를 더한다)으로: A가 쓴 내역·글·반응·삭제가 B의 `sync`에 오는지, B를 내보낸 직후 B의 `sync`에서 그 가계부가 `ledgerIds`에서 빠지고 `ledger` 변경이 data 없이 오는지, B가 A의 가계부 id로 `snapshot?ledgers=`를 불러도 빈 답인지.
- §6의 방법으로 측정: 변경이 없는 `sync` ≈ 가계부 수 + 2행(내 멤버십 + `pruned_to` + `max(seq)`), 내역 쓰기 ≈ 가계부 수 × 4 + 8행(가계부 목록·상위 연결·답 피드가 가계부 수에 비례), 스냅숏은 지금 `load()`보다 적음(UNION 스캔 제거). 2년치·가계부 24개 실측: 26행, 약 101행, 9,844행(같은 씨앗에서 이전 `load()` 23,129행).
- `docs/ledger-baseline.md` §8.14의 "대화 탭을 보는 동안 몇 초마다 새 글을 확인한다"를 이 문서로 연결해 고친다.
- Storybook: `ChatThread`에 `deleted`·"이전 글" 상태 스토리. `Flow` 스토리는 메모리 상태라 그대로.

## 4. P2 — 기기 저장과 outbox

### 4.1 저장 (확정)

- IndexedDB `budget` v1, 저장소 둘: `state`(키 `'current'` 하나: `{ schema, seq, data }`), `outbox`(autoIncrement, `keyPath: 'key'`라 읽을 때 순서 번호가 항목에 들어 있다).
- 저장하는 상태는 **서버 상태에 이 기기의 아직 보내지 않은 변경을 얹은 것**이다. 오프라인에서 쓴 것이 새로고침 뒤에도 보인다. 답을 적용할 때 남은 outbox 대상을 `skip`하는 이유다(4.2).
- **상태는 통째로 한 값**으로 저장한다(2년치 약 2MB, 직렬화 수 ms). 변경을 적용한 뒤 500ms 디바운스로 `put`. `shortcut: whole state as one value; split into stores once it passes ~10MB` 주석.
- `schema` 상수가 다르면 무시하고 스냅숏부터 받는다. 데이터 형태를 바꾸는 PR은 이 상수를 올린다.
- 시작 순서: IndexedDB에서 읽어 **바로 그린다** → 백그라운드로 `sync?since=` → 적용. 저장된 것이 없으면 지금처럼 "불러오는 중" 뒤 스냅숏.
- IndexedDB를 못 쓰면(사생활 보호 모드 등) 메모리만 쓴다(지금 동작). 모든 IndexedDB 호출은 try/catch. outbox에 넣기가 실패하면 그 항목은 메모리에 둔다(쓰기를 잃지 않게).
- 처음 한 번 `navigator.storage.persist()`를 부른다(거절돼도 무시).
- 파일: `src/client/app/store.ts` — `readState()`, `writeState()`, `clearState()`, `pushOutbox()`, `readOutbox()`, `removeOutbox()`. 30줄 안팎의 IndexedDB promise 헬퍼를 직접 쓴다.

### 4.2 outbox (확정)

- `change()`는 쓰기를 먼저 `outbox`에 넣고(`{ method, path, body, createdAt }`) 낙관적 반영한 뒤 "비우기"를 깨운다.
- 비우기: 한 번에 하나씩 순서대로 보낸다(지금 `queue`와 같음). `?since=`는 보낼 때의 `seq`.
  - 2xx: 항목을 지우고 답을 `applyChanges`. 이때 `skip`에 **남은 outbox 항목의 대상**(`path`에서 kind·id를 뽑는다)을 넣는다.
  - 4xx(검증·권한): 항목을 지우고 오류를 한 번 알린 뒤(지금 "다시 시도" 알림과 같은 자리) **스냅숏으로 다시 맞춘다**(로컬이 잘못된 상태일 수 있다). 삭제 요청의 404는 성공으로 본다. 401과 계정 바뀜(4.5)은 알리지 않고 지운다.
  - 네트워크 실패·5xx: 멈추고 5 → 10 → 20 → 60초 간격으로 다시 시도. `online` 이벤트와 `visibilitychange`에서 바로 시도.
- `skip`의 대상(구현): 내역·대화·자산·가계부는 `kind:id`, 반응은 그 내역·글, `seen`·`invites`·`members`는 그 가계부, 친구·초대 수락·가입 링크는 그 목록 전체. 가계부 PUT은 본문에 함께 보낸 내역도 넣는다. `skip`에 있는 가계부는 피드의 `ledgerIds`에 없어도 지우지 않는다(오프라인에서 만든 가계부가 앞 항목의 답에 지워지지 않게).
- outbox가 비어 있을 때만 폴링한다(보내지 않은 변경이 있는데 남의 변경을 덮어쓰지 않게). 폴링 차례에 outbox가 남아 있으면 먼저 비운다.
- 프로필 저장은 outbox에 넣지 않는다(구현자 판단): 아이디 중복(`HANDLE_TAKEN`)을 그 자리의 입력란에 바로 보여야 해서 온라인에서만 보낸다. 사진은 Blob이라 저장할 이유도 없다.
- 서버 멱등은 P1에서 끝났다(upsert, 반응 PUT/DELETE, 대화 PUT 같은 내용 무시, 삭제 반복 허용). 새로 더하는 쓰기 핸들러는 모두 이 조건을 지킨다.

### 4.3 여러 탭 (확정)

- `navigator.locks.request('budget-sync', ...)`를 **한 탭이 평생 잡는다**. 잡은 탭만 outbox를 보내고 폴링한다. 다른 탭은 쓰기를 outbox에 넣고 `BroadcastChannel('budget')`으로 `{ type: 'outbox' }`를 보낸다.
- 잡은 탭은 상태를 저장할 때마다 `{ type: 'state' }`를 보내고, 다른 탭은 받으면 IndexedDB에서 다시 읽어 그린다.
- 잡은 탭이 닫히면 잠금이 풀려 다음 탭이 잡는다. 새로 잡은 탭은 IndexedDB를 다시 읽고(자기의 보내지 않은 변경을 얹어) `sync?since=`부터 한다.
- 다른 탭은 IndexedDB에서 읽은 상태 위에 **자기가 넣고 아직 outbox에 남은 변경**을 다시 얹어 그린다(구현).
- 다른 탭이 서버에 직접 하는 일(프로필 저장, "이전 글")의 결과는 잡은 탭이 저장한다: 프로필은 `{ type: 'sync' }`로 피드를 받게 하고, 이전 글은 `{ type: 'older', messages }`로 넘긴다(구현).
- 로그아웃·401·계정 바뀜은 `{ type: 'logout' }`·`{ type: 'reset' }`으로 모든 탭에 알린다. 잡은 탭이 메모리의 상태를 다시 저장하지 않게 한다(4.5).
- Web Locks가 없거나 IndexedDB를 못 쓰면 탭마다 동기화한다(중복 전송이 멱등이라 안전).

### 4.4 서비스 워커·PWA (확정)

- `vite-plugin-pwa`(devDependency) `registerType: 'autoUpdate'`, 빌드 산출물만 사전 캐시. **`/api/*`는 절대 캐시하지 않는다.**
  - 구현: `vite-plugin-pwa` 2.0.0의 peer가 `vite ^8.0.0`이라 Vite 8.3에 그대로 설치된다(직접 쓰는 서비스 워커는 필요 없었다). `injectRegister: 'script'`로 등록 코드를 별도 파일(`registerSW.js`)로 둔다: 인라인 스크립트는 CSP `script-src 'self'`(§8.12)가 막는다.
  - 사전 캐시: `index.html`, `assets/`(빌드 산출물), 화면이 쓰는 `brand/*.svg`·반응 그림(`reactions/stickers-96`·`decorations`)·웹 매니페스트. 런타임 캐시는 두지 않는다(`/api/*`가 캐시에 들어갈 길이 없다). 주소가 화면이라(`/ledgers/:id`) 페이지 이동은 `index.html`로 답하되 `/api/`는 제외한다.
  - 개발 서버에서는 꺼 둔다(`devOptions.enabled: false`). 확인은 `npm run build` 결과로 한다.
- `public/manifest.webmanifest`: 이름 "우가 · 우리의 가계부", 짧은 이름 "우가", `display: standalone`, `theme_color`·`background_color` `#faf8f4`(`index.html`과 같음). 아이콘은 `index.html` favicon과 같은 `/brand/uga-app-icon.svg`를 `sizes: "any"`로 쓴다. 앱 아이콘을 바꿀 때 이 아이콘도 함께 바꾼다. `index.html`에는 `<link rel="manifest">`만 더한다. iOS에서 홈 화면에 추가하면 저장소 7일 정리를 피할 수 있다.
- `public/brand/manifest.json`은 브랜드 에셋 목록이지 웹 매니페스트가 아니다. 건드리지 않는다.
- 새 버전이 있으면 조용히 받아 다음 열 때 적용한다. 알림 UI는 두지 않는다.
- CSP(§8.12)는 그대로. 서비스 워커는 같은 출처라 `script-src 'self'`로 된다.

### 4.5 지우기 (§8.16, 확정)

- 로그아웃, 탈퇴, `401` 응답: `clearState()`, outbox 포함, 그 뒤 로그인 화면.
  - 지금은 서버 세션이 없다(개발 계정). 로그아웃은 이 기기의 데이터를 지우고 로그인 화면을 보인다. Google 로그인이 붙으면 서버 세션 삭제를 더한다. 탈퇴는 아직 없다.
- 멤버에서 빠짐: 피드가 처리한다(3.9). 보관한 가계부는 그대로 둔다(보관은 삭제가 아니다).
- 계정이 바뀌면(저장된 `data.user.id`와 서버 `user.id`가 다르면) 지우고 스냅숏부터.
  - 방법(구현): 클라이언트는 상태를 가진 동안 모든 API 요청에 `X-Cached-User: <저장된 user.id>`를 붙이고, 서버는 로그인한 사용자와 다르면 아무것도 읽거나 쓰기 전에 `409 ACCOUNT_CHANGED`로 거절한다. 시작 때의 `sync?since=`가 바로 걸러지고, 다른 계정의 outbox가 새 계정으로 저장되는 일도 서버가 막는다. 피드 답에 사용자 id를 더하는 방법은 3.4의 응답 형태를 바꾸고 outbox 전송을 막지 못해 쓰지 않았다.

### 4.6 검증과 완료 조건

- `check-sync.mjs`에 outbox 재생 순서와 `skip` 계산 검사를 더한다.
- 손으로: 오프라인(브라우저 DevTools)에서 내역 셋 추가·하나 삭제 → 온라인 → 서버에 셋 중 둘만 있고 순서가 맞는지. 탭 둘에서 번갈아 쓸 때 중복 전송이 없는지(`wrangler dev` 로그). 새로고침 직후 서버 요청 없이 화면이 뜨는지(네트워크 탭). 로그아웃 뒤 IndexedDB가 비는지.
- 설치 가능: Chrome DevTools Application 패널의 Manifest에 설치 가능 오류(Installability)가 없는지. (Lighthouse는 PWA 항목을 없애 이 검사에 쓸 수 없다.) 서비스 워커는 `npm run build` 결과로 확인한다.

## 5. P3 — Durable Object 푸시

### 5.1 설계 요지 (확정)

- 가계부마다 Durable Object `Room` 하나. **내용을 들고 있지 않다.** 하는 일은 둘: 연결된 소켓에 `{ seq }`를 쏘는 것(poke), 멤버에서 빠진 사람의 소켓을 닫는 것(kick).
- 쓰기는 지금처럼 HTTP로 D1에 간다(원본 하나, 로그 하나). 쓰기 뒤 Worker가 그 가계부의 `Room`에 poke → 클라이언트는 `sync?since=`로 받는다. 대화뿐 아니라 **모든 가계부 범위 쓰기**가 poke한다(남의 내역·반응도 즉시).
- 권한은 HTTP 계층(연결 시 멤버 확인, 쓰기마다 확인)이 전부 맡는다. DO는 사용자 id 태그만 안다.

### 5.2 구성

`wrangler.jsonc`:

```jsonc
"durable_objects": { "bindings": [{ "name": "ROOMS", "class_name": "Room" }] },
"migrations": [{ "tag": "room-v1", "new_sqlite_classes": ["Room"] }]
```

`src/server/room.ts`:

```ts
export class Room extends DurableObject {
  async fetch(request: Request) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') === 'websocket') {
      const userId = request.headers.get('X-User')!; // set by the Worker after signedIn + membership
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1], [userId]); // hibernatable; tagged for kick
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (url.pathname === '/poke') {
      const body = await request.text();
      for (const ws of this.ctx.getWebSockets()) ws.send(body);
    } else if (url.pathname === '/kick') {
      for (const ws of this.ctx.getWebSockets(await request.text())) ws.close(4403, 'removed');
    }
    return new Response(null, { status: 204 });
  }
  webSocketMessage() {} // clients send nothing; pings are auto-answered
  webSocketClose() {}
}
```

생성자에서 `this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))`를 둔다(깨우지 않는 keepalive).

### 5.3 Worker (확정)

- `GET /api/ledgers/:id/socket`: `signedIn` → 그 가계부 멤버인지 확인 → `env.ROOMS.idFromName(ledgerId)` → 요청에 `X-User` 헤더를 붙여 `stub.fetch`. `X-User`는 클라이언트가 보낸 값을 **절대 쓰지 않고** 서버가 덮어쓴다.
- 쓰기 디스패처: 로그 행에 `ledger_id`가 있는 쓰기가 끝나면 `ctx.waitUntil(stub.fetch('https://room/poke', { method: 'POST', body: String(seq) }))`. 응답을 기다리지 않는다.
- `removeMember`·탈퇴·`setMemberRole`(viewer로 내려도 연결은 유지, 쓰기만 서버가 거절): `/kick`에 user id.

### 5.4 클라이언트 (확정)

- `src/client/app/socket.ts`: 열린 방 하나에 소켓 하나. 방을 바꾸면 닫고 새로 연다. 메모(혼자)는 열지 않는다.
- `{ seq }`를 받아 로컬 `seq`보다 크면 `sync?since=`(outbox가 비어 있을 때; 아니면 비운 뒤). 30초마다 `ping`.
- 끊기면 1 → 2 → 5 → 30초로 다시 연결하고, 그동안은 P0-a 폴링으로 돌아간다. 코드 `4403`이면 다시 연결하지 않고 `sync`로 맞춘다(가계부가 사라진다).
- 소켓이 열려 있는 동안 폴링은 멈춘다.

### 5.5 비용·한도 (2026-11-05 문서 기준)

- 연결 1 = DO 요청 1, poke·kick 1 = 1. 클라이언트가 보내는 메시지는 없다(ping은 자동 응답이라 과금 없음). 쉬는 연결은 Hibernation으로 시간 요금 없음.
- 무료 DO 요청 10만/일. 하루 활성 1,000명이 방을 5번 열고 10번 쓰면 15,000. 충분하다.
- 로컬 `wrangler dev`는 SQLite DO를 지원한다.

### 5.6 검증과 완료 조건

- 두 계정, 창 둘: A가 내역을 쓰면 B 화면에 1초 안에 보이는지. B를 내보내면 B의 소켓이 4403으로 닫히고 가계부가 사라지는지. 네트워크를 끊었다 이으면 다시 연결되고 끊긴 동안의 변경이 오는지.
- `docs/ledger-baseline.md` §8.14 "실시간 연결 없음", §8.4 "실시간 연결을 끊는다"를 현재 상태로 고친다.

## 6. 측정 방법

로컬 D1은 읽은 행 수를 주지 않으므로 같은 파일을 `sqlite3`의 `.scanstats`로 잰다.

```bash
S=$(mktemp -d)/d1 && npx wrangler d1 migrations apply budget-dev --local --persist-to $S
```

씨앗(2년치): 사용자 2명, 가계부 24개(둘 다 멤버), 내역 3,000, 반응 1,000, 대화 6,000을 `WITH RECURSIVE`로 넣는다(`ledger_members`는 열 이름을 명시: `seen_at`이 있다). 그 뒤:

```bash
DB=$(ls $S/v3/d1/miniflare-D1DatabaseObject/*.sqlite | grep -v metadata)
```

```bash
sqlite3 $DB "PRAGMA wal_checkpoint(TRUNCATE);"
```

```bash
printf '.scanstats on\n<쿼리>;\n' | sqlite3 $DB
```

각 루프의 마지막 열이 그 단계가 읽은 행이다. 테이블 크기는 `SELECT name, SUM(pgsize) FROM dbstat GROUP BY name`.

## 7. 구현자에게

- 읽을 것: 이 문서, `docs/ledger-baseline.md` §3·§7·§8, `src/server/index.ts`의 `load()`·디스패처, `src/client/app/App.tsx`의 `change()`·폴링 `useEffect`, `src/shared/ledger.ts`의 `AppData`.
- 한 단계가 한 PR이다. P0-a → P1 → P2 → P3. P0-b는 P1을 바로 하면 건너뛴다.
- 각 PR 끝에 `npm run typecheck`, `npm run check:sync`, `npm run check:ui`, 그리고 그 단계의 "검증과 완료 조건"을 모두 돌리고 결과를 PR에 적는다.
- **구현자 판단**으로 남긴 것: 함수·파일 이름의 세부, 오류 문구, 폴링 간격의 정확한 숫자, outbox 항목 형식의 세부, 서비스 워커 설정. 바꾸면 안 되는 것: 3.2 스키마, 3.4 API 형태, 3.3 로그 행 표, 1의 원칙, §8의 보안 기준.
- 이 문서와 다르게 해야 하는 이유를 찾으면 코드를 바꾸기 전에 이 문서를 먼저 고치고 PR에 쓴다.
