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
| P2 | 새로고침·재방문 시 화면은 서버를 기다리지 않는다. 서버 읽기는 시작 때 `sync?since=` 한 번(변경이 없으면 P1의 폴링과 같다, 실측 26–29행)이고 스냅숏은 없다 | 같음, 체감 즉시 |
| P3 | 공유 방을 보는 동안 폴링 없음(소켓이 끊긴 동안만 폴링). 다른 사람의 쓰기는 신호 하나에 피드 한 번으로 온다(실측 28행, 로그인 확인 포함 31행). 쓰기는 2행 + 그 쓰기의 로그 행만큼 늘어난다 | 수천 명 (한도는 Workers 요청: 쓰기 1, 그 방을 보는 기기마다 신호당 피드 1, 소켓 연결 1) |

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
  - 폴링(P0-a 규칙 유지): `GET /api/sync?since=`. P3부터는 그 방의 소켓이 끊긴 동안만 폴링한다(5.4). 공유 가계부의 **어느 탭이든 방이 열려 있으면** 폴링한다(대화뿐 아니라 남의 내역도 바로 보이게). 메모(혼자)는 폴링하지 않는다.
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

- IndexedDB `budget` v1, 저장소 둘: `state`(키 `'current'` 하나: `{ schema, seq, data, refused? }`; `refused`는 4.2. 화면 복구 뒤에는 `{ refused, userId }`만 남을 수 있다), `outbox`(autoIncrement, `keyPath: 'key'`라 읽을 때 순서 번호가 항목에 들어 있다).
- 저장하는 상태는 **서버 상태에 이 기기의 아직 보내지 않은 변경을 얹은 것**이다. 오프라인에서 쓴 것이 새로고침 뒤에도 보인다. 답을 적용할 때 남은 outbox 대상을 `skip`하는 이유다(4.2).
- **상태는 통째로 한 값**으로 저장한다(2년치 약 2MB, 직렬화 수 ms). 변경을 적용한 뒤 500ms 디바운스로 `put`. `shortcut: whole state as one value; split into stores once it passes ~10MB` 주석.
- `schema` 상수가 다르면 무시하고 스냅숏부터 받는다. 데이터 형태를 바꾸는 PR은 이 상수를 올린다. outbox `patch`의 형식(4.3)을 바꾸는 PR도 올린다. 그래야 옛 형식의 patch를 새 코드가 얹지 않고 보내기만 한다.
  - `schema`가 같아도 최소 모양이 아니면(`seq` 숫자, `user.id`, `ledgers`·`records` 목록, `seenAt`, 있으면 목록인 나머지 목록들) 깨진 것으로 보고 똑같이 한다. 다음 저장이 덮어쓴다. 이 상수를 올리는 것을 잊은 PR이 매 시작을 빈 화면으로 만들지 않게 한다.
  - 이 검사가 거르지 못하는 것(목록 안 항목이 깨진 복사본 등)은 화면이 그리다 실패할 때 잡는다(구현: `main.tsx`의 ErrorBoundary). 복사본(`state`)과 outbox 항목의 `patch`를 지우고(깨진 patch가 다시 띄운 화면을 또 깨뜨리지 않게) 본문은 두며, 아직 알리지 않은 거절(`refused`, 4.2)은 그 복사본의 계정과 함께 남긴다(`clearCopy(true)`). 그다음 모든 탭에 `{ type: 'reset' }`을 보낸 뒤 앱을 다시 띄운다. patch를 잃은 변경은 그대로 보내지고, 보낼 때까지 화면에 보이지 않을 뿐이다. 남긴 거절은 다시 띄운 앱이 스냅숏을 받은 뒤, 스냅숏의 계정이 그 거절의 계정과 같을 때만 모든 탭에 알린다(계정이 바뀌었으면 버린다). 다시 띄우기는 한 페이지에 한 번이다. 데이터와 상관없는 그리기 버그에도 돈다(4.7). 또 실패하면 "화면을 그리지 못했어요"와 새로고침 단추를 보인다(끝없이 다시 띄우지 않게).
- 시작 순서: IndexedDB에서 읽어 **바로 그린다** → 백그라운드로 `sync?since=` → 적용. 저장된 것이 없으면 지금처럼 "불러오는 중" 뒤 스냅숏.
- IndexedDB를 못 쓰면(사생활 보호 모드 등) 메모리만 쓴다(지금 동작). 모든 IndexedDB 호출은 try/catch. outbox에 넣기가 실패하면 그 항목은 메모리에 둔다(쓰기를 잃지 않게).
- 연결(구현): 다른 탭이 DB 버전을 올리거나 지우려 하면(`versionchange`) 또는 연결이 끊기면(`close`, iOS의 "Connection to Indexed Database server lost") 연결을 닫고, 다음 호출이 다시 연다. 열기가 실패해도 다음 호출이 다시 연다. 요청이 실패해 연결을 버릴 때는 그 연결을 닫는다(쓰기가 계속 실패해도 실패마다 연결이 쌓이지 않게). 그래서 옛 탭이 새 버전의 `open()`을 막지 않는다. 버전을 올리는 PR은 `onupgradeneeded`에서 `oldVersion`으로 나눠 만든다.
- 처음 한 번 `navigator.storage.persist()`를 부른다(거절돼도 무시). 결정(13): 설치했는지와 상관없이 어디서든 첫 저장 때 한 번 부른다. Firefox 탭에서는 이때 권한 창이 뜨는데, 이를 받아들인다. 설치한 앱(standalone)에서만 부르는 안은 쓰지 않았다.
- 파일: `src/client/app/store.ts` — `readState()`, `writeState()`, `clearState()`, `clearCopy()`(복사본만), `dropPatches()`, `pushOutbox()`, `readOutbox()`, `removeOutbox()`. 30줄 안팎의 IndexedDB promise 헬퍼를 직접 쓴다.

### 4.2 outbox (확정)

- `change()`는 먼저 낙관적 반영하고(화면이 IndexedDB를 기다리지 않게), 쓰기를 `outbox`에 넣은 뒤(`{ userId, schema, method, path, body, patch, createdAt }`; `userId`는 4.5, `schema`·`patch`는 4.3) "비우기"를 깨운다. 넣기는 수 ms라, 그 사이에 페이지가 닫히면 그 변경은 화면에만 있다가 사라진다.
- 비우기: 한 번에 하나씩 순서대로 보낸다(지금 `queue`와 같음). `?since=`는 보낼 때의 `seq`.
  - 2xx: 항목을 지우고 답을 `applyChanges`. 이때 `skip`에 **남은 outbox 항목의 대상**(`path`에서 kind·id를 뽑는다)을 넣는다.
  - 4xx(검증·권한): 항목을 지우고 다음 항목으로 간다. 그 비우기가 끝나면 **스냅숏으로 한 번 다시 맞추고**(로컬이 잘못된 상태일 수 있다) 마지막 거절을 한 번 알린다(지금 "다시 시도" 알림과 같은 자리, 닫을 때까지 남는다). 거절이 여럿이어도 스냅숏은 한 번이다(D1 읽기: 스냅숏 하나가 약 9.8K행). 삭제 요청의 404는 성공으로 본다. 401과 계정 바뀜(`409 ACCOUNT_CHANGED`, 4.5)이면 그 항목을 지우지 않고 멈춘 뒤 4.5대로 한다. 401이면 복사본만 지우고 outbox는 같은 계정이 다시 로그인할 때까지 둔다. 계정 바뀜이면 앞 계정의 항목만, 또는 복사본까지 앞 계정의 것이면 outbox 전체를 지우고 지운 개수를 알린다.
    - 거절은 그 자리에서 저장된 복사본에 `refused`(마지막 거절 문구)로 함께 적고, 스냅숏으로 다시 맞춘 복사본을 저장할 때 지운다. 그래서 그 비우기가 다음 항목의 5xx·429로 멈추고 다시 시도 전에 페이지가 닫혀도, 다음에 동기화를 맡는 탭이 이를 읽어 비우기 뒤 스냅숏으로 맞추고 알린다. 거절된 변경이 복사본과 화면에만 남는 일이 없다.
    - 알림은 모든 탭에 뜬다(`{ type: 'refused', message }`). 거절된 변경을 만든 탭이 동기화를 맡은 탭이 아닐 수 있다.
  - 네트워크 실패·5xx·408·425·429(나중에 다시 하라는 답, 요청 한도 포함): 멈추고 5 → 10 → 20 → 30초 간격으로 다시 시도(마지막이 반복). 마지막 간격은 폴링 최대 간격(30초)과 같다: 기다리는 동안 확인을 건너뛰므로(4.3), 서버가 돌아온 뒤 첫 확인이 폴링보다 늦지 않게. `online` 이벤트와 `visibilitychange`에서 바로 시도.
- `skip`의 대상(구현): 내역·대화·자산·가계부는 `kind:id`, 반응은 그 내역·글, `seen`·`invites`·`members`는 그 가계부, 친구·초대 수락·가입 링크는 그 목록 전체. 가계부 PUT은 본문에 함께 보낸 내역도 넣는다. `skip`에 있는 가계부는 피드의 `ledgerIds`에 없어도 지우지 않는다(오프라인에서 만든 가계부가 앞 항목의 답에 지워지지 않게).
- outbox가 비어 있을 때만 폴링한다(보내지 않은 변경이 있는데 남의 변경을 덮어쓰지 않게). 폴링 차례에 outbox가 남아 있으면 먼저 비운다.
- 프로필 저장은 outbox에 넣지 않는다(구현자 판단): 아이디 중복(`HANDLE_TAKEN`)을 그 자리의 입력란에 바로 보여야 해서 온라인에서만 보낸다. 사진은 Blob이라 저장할 이유도 없다.
- 서버 멱등: P1에서 upsert, 반응 PUT/DELETE, 대화 PUT 같은 내용 무시, 삭제 반복 허용을 했다. 다시 보내면 거절하던 셋은 P2에서 고쳤다(답을 잃고 다시 보내거나, 잡은 탭이 보내는 중에 닫힐 때). 친구 수락은 이미 친구면, 가계부 나가기는 이미 나갔으면 그대로 200이다. 초대 수락은 본문에 `ledgerId`를 함께 보내고, 초대가 없어도 그 가계부의 멤버면 200이다. 클라이언트가 이 답들을 "이미 됨"으로 보는 방법은 쓰지 않았다: 상대가 요청을 취소했거나 초대를 거둔 경우까지 말없이 넘어간다. 새로 더하는 쓰기 핸들러는 모두 다시 보내도 같은 결과가 되게 한다.

### 4.3 여러 탭 (확정)

- `navigator.locks.request('budget-sync', ...)`를 **한 탭이 잡는다**. 잡은 탭만 outbox를 보내고 피드를 받고 복사본을 저장한다. 다른 탭은 쓰기를 outbox에 넣고 `BroadcastChannel('budget')`으로 `{ type: 'outbox' }`를 보낸다.
  - 결정(12): 가려졌다가 보이게 된 탭과, 저장된 복사본이 있는 채로 보이며 열린 탭은, 잠금을 쥐고 있지 않으면 `steal: true`로 가져온다. 브라우저가 얼린 배경 탭(iOS Safari, Chrome의 freeze)이 잠금을 쥔 채 멈춰도 사용자가 보는 탭이 동기화한다.
  - 가져오는 것은 열릴 때와 보이게 되는 전환 때뿐이다. 그래서 나란히 보이는 두 창이 서로 계속 빼앗지 않는다. 이미 보이고 있던 탭은 가져오지 않는다(4.7).
  - 복사본이 없으면 열릴 때 가져오지 않고 차례를 기다린다. 첫 사용, 로그아웃·401·SCHEMA 변경·화면 복구 뒤에 여러 창이 한꺼번에 열려도 스냅숏은 한 번이다. 가져오면 앞 창이 받던 스냅숏을 버리고 창마다 다시 받는다.
  - 다만 보이는 탭이 3초가 지나도 보여 줄 데이터도 로그인 화면도 얻지 못하면 그때 가져온다. 잠금 주인이 복사본을 만들지 않을 때(로그인 화면이거나, 얼었거나, 다른 SCHEMA를 저장하는 옛 빌드)다. 그래서 "불러오는 중"에 갇히지 않는다. 다시 시도·로그인·`reset` 뒤에 데이터를 기다릴 때도 같다. 이렇게 가져오는 것은 기다림 한 번에 한 번뿐이고, 그 사이 잠금을 쥔 적 있는 탭은 가져오지 않는다(그 탭의 스냅숏은 오는 중이다). 그래서 스냅숏이 느려도 서로 계속 빼앗지 않는다(4.7).
  - 빼앗긴 탭은 빼앗긴 것을 알게 되면(다시 돌기 시작해 잠금 요청의 거절을 받으면) 따르는 탭이 된다. 예약된 저장과 다시 시도, 그 실행에서 받은 거절을 버리고, 그 뒤에 오는 요청의 답은 받지 않는다(항목을 지우지도, 답을 복사본에 얹지도, 거절을 적지도 않는다). 새로 잡은 탭이 그 항목을 다시 보내고(쓰기가 멱등이라 겹쳐도 된다) 거절은 저장된 복사본의 `refused`로 이어받는다. 그다음 보통 요청으로 다시 줄을 선다. 깨어날 때 순서가 바뀌는 경우는 4.7.
- 폴링(3.9의 공유 방 확인)은 공유 방을 보고 있는 탭마다 같은 간격으로 한다. P3부터는 소켓이 열려 있는 동안 간격 대신 그 방의 신호로 확인한다(5.4). 잡은 탭은 직접 `sync(true)`, 다른 탭은 `{ type: 'sync' }`를 보내 잡은 탭이 확인하게 한다. 잡은 탭은 확인에서 남의 변경이 오면 `{ type: 'news' }`를 보내고, 방을 보는 탭은 다음 확인을 처음 간격(5초)으로 당긴다. 잡은 탭이 가려져 있어도 얼지 않았으면 다른 탭의 요청을 처리한다. 얼었으면 보이게 된 탭이 잠금을 가져간 뒤부터 그 탭이 처리한다. 잡은 탭이 실패 뒤 다시 시도를 기다리는 동안(4.2, 429 포함)에는 확인(자기 것과 다른 탭의 `{ type: 'sync' }`)을 건너뛴다. 기다림이 끝나면 그 시도가 간다.
- 잡은 탭은 상태를 저장할 때마다 `{ type: 'state' }`를 보내고, 다른 탭은 받으면 IndexedDB에서 다시 읽어 그린다.
- 잡은 탭이 닫히면 잠금이 풀려 다음 탭이 잡는다. 빼앗았을 때도 같다. 새로 잡은 탭은 IndexedDB를 다시 읽고(자기의 보내지 않은 변경을 얹어) `sync?since=`부터 한다.
- outbox 항목은 그 변경이 복사본에 한 일을 데이터로 함께 갖는다(`patch`: 목록은 새 항목 전체·바뀐 항목의 바뀐 키·빠진 id, 객체는 바뀐 키, 나머지는 새 값). 어느 탭이든 복사본 위에 **아직 outbox에 남은 변경**을 다시 얹어 그린다(구현).
  - 이 페이지가 만든 것은 그 함수를 다시 돌린다(새 데이터 위에서 다시 계산). 다른 탭이나 지난 페이지가 만든 것은 `patch`를 얹는다.
  - 바뀐 항목은 바뀐 키만 얹는다. 그래서 그 사이 다른 기기가 같은 항목의 다른 키(예: 상위 가계부의 이름)를 바꾼 것이 보낼 때까지 옛 값으로 돌아가지 않는다. 같은 키를 둘 다 바꿨으면 보낼 때까지 이 변경의 값이 보인다. 그 사이 다른 기기가 지운 항목에는 얹지 않는다.
  - `patch`는 만든 페이지의 `schema`(4.1)와 함께 적는다. 지금 SCHEMA와 다르면(그 사이 데이터 모양이 바뀌었거나, `schema`를 적기 전의 항목이면) 얹지 않고 보내기만 한다. 옛 모양의 항목이 새 복사본에 섞이지 않게 한다.
  - 얹는 것은 복사본과 같은 계정(`userId`)이 만든 항목뿐이다. 다른 계정의 항목은 화면과 복사본에 얹지 않고, 보내기만 해서 409로 지워진다(4.5).
  - 잡은 탭은 `{ type: 'outbox' }`를 받으면 다른 탭의 변경을 자기 복사본에 얹어 저장한다. 그래서 다른 탭에서 오프라인으로 쓴 것도 복사본에 들어가고, 그 탭을 새로고침해도 보인다. 보이지 않아 다시 입력하면 중복이 생기기 때문이다.
- 다른 탭이 서버에 직접 하는 일(프로필 저장, "이전 글")의 결과는 잡은 탭이 저장한다: 프로필은 `{ type: 'sync' }`로 피드를 받게 하고, 이전 글은 `{ type: 'older', messages }`로 넘긴다(구현).
- 로그아웃·401·계정 바뀜은 `{ type: 'logout' }`·`{ type: 'reset' }`으로 모든 탭에 알린다. 잡은 탭이 메모리의 상태를 다시 저장하지 않게 한다(4.5). 계정 바뀜으로 보내지 않은 변경을 지웠으면 `reset`에 그 알림(`notice`)을 함께 보낸다. 잡은 탭이 스냅숏을 받은 뒤 `{ type: 'refused', message }`로 모든 탭에 띄운다.
- Web Locks가 없거나 IndexedDB를 못 쓰면 탭마다 동기화한다(중복 전송이 멱등이라 안전).

### 4.4 서비스 워커·PWA (확정)

- `vite-plugin-pwa`(devDependency) `registerType: 'autoUpdate'`, 빌드 산출물만 사전 캐시. **`/api/*`는 절대 캐시하지 않는다.**
  - 구현: `vite-plugin-pwa` 2.0.0의 peer가 `vite ^8.0.0`이라 Vite 8.3에 그대로 설치된다(직접 쓰는 서비스 워커는 필요 없었다). `injectRegister: 'script'`로 등록 코드를 별도 파일(`registerSW.js`)로 둔다: 인라인 스크립트는 CSP `script-src 'self'`(§8.12)가 막는다.
  - 사전 캐시: `index.html`, `assets/`(빌드 산출물), 화면이 쓰는 `brand/*.svg`·반응 그림(`reactions/stickers-96`·`decorations`)·웹 매니페스트. 런타임 캐시는 두지 않는다(`/api/*`가 캐시에 들어갈 길이 없다). 주소가 화면이라(`/ledgers/:id`) 페이지 이동은 `index.html`로 답하되 `/api/`는 제외한다.
  - 개발 서버에서는 꺼 둔다(`devOptions.enabled: false`). 확인은 `npm run build` 결과로 한다.
- `public/manifest.webmanifest`: 이름 "우가 · 우리의 가계부", 짧은 이름 "우가", `display: standalone`, `theme_color`·`background_color` `#faf8f4`(`index.html`과 같음). 아이콘은 돈주머니 앱 아이콘을 배경색 위에 놓은 PNG다: 192·512와 maskable 512(`design/uga/system/source/render-app-icons.mjs`가 만든다). `index.html`에는 `<link rel="manifest">`와 iOS 홈 화면용 `apple-touch-icon`(180)을 더한다. 넷 다 서비스 워커가 미리 받는다. 앱 아이콘을 바꾸면 이 스크립트를 다시 돌린다. iOS에서 홈 화면에 추가하면 저장소 7일 정리를 피할 수 있다.
- `public/brand/manifest.json`은 브랜드 에셋 목록이지 웹 매니페스트가 아니다. 건드리지 않는다.
- 새 버전이 있으면 조용히 받아 바로 넘어간다(`workbox.skipWaiting`·`clientsClaim`). 알림 UI는 두지 않는다.
  - 배포 뒤 첫 로드는 옛 사전 캐시로 뜨면서 새 버전을 찾아 설치·활성화한다. 새 빌드는 그다음 로드(새로고침·다시 열기)부터 뜬다. 열려 있던 화면은 그대로 쓴다.
  - 브라우저는 페이지 이동 때 업데이트를 찾고, 앱은 화면이 다시 보이게 될 때마다 `registration.update()`로 찾는다(`main.tsx`). 그래서 이동 없이 오래 열어 둔 홈 화면 PWA도 다시 볼 때 새 버전을 받고, 그다음 로드부터 새 빌드가 뜬다.
  - `injectRegister: 'script'`에서는 플러그인이 `autoUpdate`에도 이 둘을 켜 주지 않는다(`auto`일 때만). 켜지 않으면 새 버전은 모든 창이 닫힐 때까지 `waiting`이고, 홈 화면 PWA는 거의 닫히지 않는다. 앱이 번들 하나라 나중에 불러올 청크가 없어, 옛 화면이 새 캐시에서 없는 파일을 찾는 일이 없다.
- CSP(§8.12)는 그대로. 서비스 워커는 같은 출처라 `script-src 'self'`로 된다.

### 4.5 지우기 (§8.16, 확정)

- 로그아웃, 탈퇴: `clearState()`, outbox 포함, 그 뒤 로그인 화면. 보내지 않은 변경이 남아 있어도 알리지 않고 지운다.
- `401` 응답(결정 8): 복사본만 지우고(`clearCopy()`) outbox는 둔 채 로그인 화면. 401을 받은 항목도 지우지 않는다.
  - 같은 계정으로 다시 로그인하면 남은 항목이 그대로 보내진다. 보내기 전에도 `patch`로 화면에 보인다(4.3).
  - 다른 계정으로 로그인하면 앞 계정의 항목이 409로 거절된다. 이때 복사본은 이미 새 계정의 것이므로, 앞 계정의 항목만 지우고 개수를 모든 탭에 알린 뒤 나머지(새 계정이 그 사이 쓴 것)를 이어 보낸다(`replay`의 `foreign`). 스냅숏을 다시 받지 않는다.
  - 다른 탭은 `{ type: 'logout' }`을 받아 로그인 화면을 보인다. 지우는 것은 401을 받은 탭이 한다.
  - 지금은 서버 세션이 없다(개발 계정). 로그아웃은 이 기기의 데이터를 지우고 로그인 화면을 보인다. Google 로그인이 붙으면 서버 세션 삭제를 더한다. 탈퇴는 아직 없다.
- 멤버에서 빠짐: 피드가 처리한다(3.9). 보관한 가계부는 그대로 둔다(보관은 삭제가 아니다).
- 계정이 바뀌면(저장된 `data.user.id`와 서버 `user.id`가 다르면) 복사본과 outbox를 모두 지우고 스냅숏부터. 지울 때 outbox에 남은 변경을 세어, 있으면 스냅숏을 받은 뒤 "보내지 못한 변경 N개를 지웠어요"를 모든 탭에 알린다(결정 8). 알리지 않고 지우면 오프라인에서 쓴 것이 사라진 줄 모른다.
  - 방법(구현): 클라이언트는 상태를 가진 동안 모든 API 요청에 `X-Cached-User: <저장된 user.id>`를 붙이고, 서버는 로그인한 사용자와 다르면 아무것도 읽거나 쓰기 전에 `409 ACCOUNT_CHANGED`로 거절한다. 시작 때의 `sync?since=`가 바로 걸러진다. 피드 답에 사용자 id를 더하는 방법은 3.4의 응답 형태를 바꾸고 outbox 전송을 막지 못해 쓰지 않았다.
  - outbox 항목은 만든 계정의 `userId`를 함께 저장하고, 보낼 때는 지금 상태가 아니라 그 값을 `X-Cached-User`로 보낸다. 그래서 저장된 복사본을 못 쓰고 스냅숏부터 받았을 때도(SCHEMA가 바뀌었거나, 상태 저장만 실패했거나, 복사본이 깨졌거나, 401 뒤 다른 계정으로 로그인했을 때) 다른 계정이 만든 변경은 409로 거절된다. 그때 복사본은 지금 계정의 것이라 그 계정의 항목만 지우고 알린다(위). 같은 계정이면 그대로 보낸다. `userId`가 없는 옛 항목도 다른 계정의 것으로 본다.

### 4.6 검증과 완료 조건

- `check-sync.mjs`에 outbox 재생 순서와 `skip` 계산 검사를 더한다. `patch`를 만들고 얹는 것, 저장된 복사본의 모양 검사도 넣는다. 401·계정 바뀜에서 항목이 남는 것, 다른 계정의 항목만 지우고 이어 보내는 것, 잠금을 빼앗긴 뒤의 답을 버리는 것도 본다.
- 손으로: 오프라인(브라우저 DevTools)에서 내역 셋 추가·하나 삭제 → 온라인 → 서버에 셋 중 둘만 있고 순서가 맞는지. 탭 둘에서 번갈아 쓸 때 중복 전송이 없는지(`wrangler dev` 로그). 새로고침 직후 서버 요청 없이 화면이 뜨는지(네트워크 탭). 로그아웃 뒤 IndexedDB가 비는지.
- 설치 가능: Chrome DevTools Application 패널의 Manifest에 설치 가능 오류(Installability)가 없는지. (Lighthouse는 PWA 항목을 없애 이 검사에 쓸 수 없다.) 서비스 워커는 `npm run build` 결과로 확인한다.

### 4.7 알려진 한계

P2를 닫으며 고치지 않고 남긴 것이다. 생기는 때와 남긴 이유를 함께 적는다.

- **키 안에서 바뀐 것은 덮인다.**
  - 다른 탭이나 지난 페이지의 변경은 `patch`로 얹는다(4.3). `reactions`·`childIds`·`values`처럼 목록·객체인 키는 그 탭이 본 값으로 통째로 얹힌다.
  - 그래서 그 사이 다른 기기가 같은 키 안을 바꾼 것(같은 내역에 남이 단 반응, 같은 상위에 더한 다른 하위)은 보낼 때까지 그 탭에서 안 보인다.
  - 같은 이유로, 글 삭제 patch를 새 수정 위에 얹으면 보낼 때까지 `editedAt`이 남는다.
  - 남긴 이유: 보내면 답이 바로잡는다. 키 안까지 합치려면 키마다 합치는 규칙이 필요하다.
- **화면 복구는 데이터와 상관없는 그리기 버그에도 돈다(4.1).**
  - 복사본을 지우고, 모든 탭을 다시 시작한다. 로드마다 스냅숏을 1–2번(약 10–20K행) 받는다.
  - 남긴 이유: 오류만으로는 데이터 탓인지 가릴 수 없다. 사용자가 새로고침할 때만 되풀이되므로 상한이 있다.
- **얼었다가 깨어난 탭은 빼앗긴 것을 늦게 알 수 있다.**
  - 깨어날 때 잠금 요청의 거절보다 진행 중이던 요청의 답이나 예약된 저장이 먼저 돌면, 그 탭이 항목을 한 번 더 지우고 복사본을 한 번 더 저장한다.
  - 거절을 2–4초 늦춰 흉내 낸 결과, 저장된 복사본은 맞았다(그 답에 새 주인의 변경도 실려 온다). 서버에도 중복이 없었다.
  - `replay`는 보내기 직전에는 `held()`를 보지 않는다. 그래서 답을 받는 중에 빼앗기면 다음 항목을 한 번 더 보낸다(멱등).
  - 남긴 이유: 탭이 잠금을 아직 쥐었는지 바로 알 API가 없다. `navigator.locks.query()`는 그 잠금이 자기 것인지 알려 주지 않는다.
- **계속 보이던 창은 잠금을 가져오지 않는다.**
  - 잡은 창이 최소화된 채 얼면, 그동안 계속 보이던 다른 창은 다음에 보이게 될 때 가져온다.
  - 남긴 이유: 전환 때만 가져와야 나란히 보이는 창이 서로 빼앗지 않는다(결정 12).
- **다른 탭에서 방금 만든 변경이 잠깐 사라질 수 있다.**
  - 따르는 탭이 `{ type: 'state' }`로 다시 읽는 도중에 변경을 만드는 경우다. 그 읽기가 끝날 때 방금 만든 변경이 사라졌다가, 잡은 탭이 저장한 뒤(0.5초 남짓) 돌아온다. 데이터는 그대로다.
  - 남긴 이유: outbox에 넣는 중인 변경을 따로 들고 있다가 다시 얹어야 한다. 넣기가 끝난 뒤 읽기가 끝나기 전까지의 경합까지 막으려면 고칠 곳이 커진다.
- **알림이 데이터보다 먼저 올 수 있다.**
  - 잠금이 없는 탭에서는 계정 바뀜과 화면 복구 뒤의 알림이 데이터보다 약 0.5초 먼저 온다. 그 사이 "불러오는 중" 대신 알림과 "다시 시도" 단추가 보인다.
  - 남긴 이유: 알림은 스냅숏 직후에, 데이터는 잡은 탭이 저장한 뒤(디바운스 500ms)에 온다. 작고 해가 없다.
- **복사본 없이 여러 창이 함께 기다리는데 스냅숏이 3초보다 느리면 스냅숏을 더 받는다.**
  - 기다리던 창이 한 번씩 잠금을 가져가므로, 창 N개면 많아야 N번이다(창 3개, 9초 지연: 3번, 빼앗기 2번).
  - 빼앗긴 창이 받던 스냅숏은 그 창에만 그려지고 저장되지 않는다. 그래서 다른 창은 새 주인의 스냅숏을 기다린다(같은 예에서 모두 그려지기까지 약 12초).
  - 남긴 이유: 잠금 주인이 복사본을 만들지 못할 때(로그인 화면, 동결, 옛 빌드) 갇히지 않으려면 가져와야 한다.
- ~~같은 방을 여러 탭으로 보면 확인이 탭 수만큼 간다(3탭이면 70초에 13회).~~ P3가 대체했다: 소켓이 열려 있는 동안 폴링은 0회이고, 탭이 몇 개든 신호 하나에 피드는 한 번이다(5.6). 소켓이 끊긴 동안은 지금처럼 탭마다 폴링한다.
- **outbox도 브라우저가 지울 수 있다.**
  - Safari ITP의 7일 정리(홈 화면에 추가하지 않은 경우)와 저장소 정리는 outbox도 지운다. 그러면 보내지 않은 변경이 사라진다. 1장의 "기기 저장은 언제든 지워져도 된다"는 복사본에만 맞는다.
  - 남긴 이유: 브라우저가 정하는 일이다. 대책은 `persist()`(결정 13)와 홈 화면 추가다.
- **iOS 홈 화면 아이콘이 화면 캡처가 된다.**
  - iOS는 매니페스트 아이콘을 쓰지 않고 `apple-touch-icon`이 필요한데, 지금은 없다.
  - 남긴 이유: `index.html`과 매니페스트는 화면 쪽 후속 작업의 범위다.
- **화면이 보일 때마다 탭마다 `sw.js`를 한 번 받는다(4.4).**
  - `update()`는 조건부 요청이 아니라 바이트를 비교하려고 늘 받는다.
  - 남긴 이유: 오래 열어 둔 PWA가 새 빌드를 찾는 길이다. 운영 `wrangler` 설정 때 `sw.js`를 Worker가 아니라 정적 자산으로 내보내는지 확인한다. Worker를 거치면 하루 요청 한도에 들어간다.
- **첫 방문 사전 캐시가 99개, 약 2.3MB다.**
  - 반응 그림과 브랜드 SVG를 모두 미리 받기 때문이다.
  - 남긴 이유: 줄이려면 런타임 캐시가 필요하다. 그러려면 `/api/*`를 캐시하지 않는 원칙(4.4)과 함께 설계해야 한다.
- **돌려 보지 못한 환경이 있다.**
  - Safari·Firefox·iOS에서는 돌려 보지 않았다(설치된 Playwright 1.63에 맞는 WebKit·Firefox 빌드가 없다).
  - iOS IndexedDB의 "connection lost" 회복, 실제 저장 공간 부족(쓰기 실패를 흉내 냄), 실제 동결(디버거 정지와 늦춘 거절로 흉내 냄), Cloudflare가 실제로 주는 429·1015 응답, 운영 CSP는 추론이나 흉내로만 확인했다.

## 5. P3 — Durable Object 푸시

### 5.1 설계 요지 (확정)

- 가계부마다 Durable Object `Room` 하나. **내용을 들고 있지 않다.** 하는 일은 둘: 연결된 소켓에 `{ seq }`를 쏘는 것(poke), 멤버에서 빠진 사람의 소켓을 닫는 것(kick).
- 쓰기는 지금처럼 HTTP로 D1에 간다(원본 하나, 로그 하나). 쓰기 뒤 Worker가 그 가계부의 `Room`에 poke → 클라이언트는 `sync?since=`로 받는다. 대화뿐 아니라 **모든 가계부 범위 쓰기**가 poke한다(남의 내역·반응도 즉시).
- 신호는 "확인하라"는 것(`{ seq }`)뿐이다. 데이터를 실으면 계정 경계(`X-Cached-User`, 409, 4.5)와 요청마다의 권한 확인을 건너뛴다. 데이터는 늘 피드로 받는다.
- 권한은 HTTP 계층(연결 시 멤버 확인, 쓰기마다 확인)이 전부 맡는다. DO는 사용자 id 태그만 안다.
- 받는 길과 보내는 길은 P2의 `sync()`·`queue`·`poll()` 하나다. 신호는 `poll()`을 깨울 뿐이고 새 쓰기 경로는 없다.

### 5.2 구성

`wrangler.jsonc`(로컬 개발 설정. 운영 설정은 Google 로그인과 함께 만든다):

```jsonc
"durable_objects": { "bindings": [{ "name": "ROOMS", "class_name": "Room" }] },
"migrations": [{ "tag": "room-v1", "new_sqlite_classes": ["Room"] }]
```

무료 플랜은 SQLite 저장소 클래스만 받는다. `Room`은 저장소를 쓰지 않는다. `npm run dev`(`wrangler dev`)가 DO를 로컬에서 함께 띄운다. Vite 프록시는 `/api`의 WebSocket도 넘긴다(`ws: true`).

`src/server/room.ts`(구현):

- 생성자: `setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))`. DO를 깨우지 않는 keepalive다.
- `fetch`: `X-User`가 있으면 소켓 연결이다. `acceptWebSocket(server, [userId])`(hibernatable, kick용 태그)로 받고 101로 답한다. 없으면 신호다. 본문(`{"seq":n}`)을 **모든** 소켓에 보낸 뒤, `?kick=<user id>`가 있으면 그 사람의 소켓을 `close(4403, 'removed')`로 닫는다.
  - 신호를 먼저 보내는 이유: 빠진 사람도 그 신호로 바로 피드를 받아 가계부를 지운다. 닫기가 끝나기를 기다리지 않는다(로컬 런타임에서는 서버가 닫은 소켓의 `close` 이벤트가 Chrome에 약 2초 뒤에 왔다).
  - poke와 kick을 DO 요청 하나로 합쳤다(처음 안은 `/poke`·`/kick` 둘).
- `webSocketMessage`: 아무것도 하지 않는다(클라이언트는 ping만 보내고 자동 응답이 답한다).
- `webSocketClose`: `close(1000)`으로 닫기에 답한다. 답하지 않으면 페이지가 먼저 닫은 소켓(방을 나갈 때)이 닫기 응답을 기다리다 약 35초 뒤 1006으로 끝났다(로컬 `wrangler dev`, 호환 날짜 2026-09-16). 이미 닫힌 소켓이면 무시한다.

### 5.3 Worker (확정)

- `GET /api/ledgers/:id/socket`(구현):
  - `signedIn` → 출처 확인(`checkOrigin`, §8.7) → `Upgrade: websocket`이 아니면 404 → `SELECT 1 FROM ledger_members WHERE ledger_id = ? AND user_id = ?`(1행)가 없으면 404 → `env.ROOMS.idFromName(ledgerId)`의 stub에 **서버가 새로 만든 요청**(`Upgrade`와 `X-User: <로그인한 사용자>` 헤더만)을 보낸다. 클라이언트가 보낸 헤더는 하나도 DO에 닿지 않는다(`X-User`를 보내도 무시된다).
  - 출처 확인을 하는 이유: 브라우저는 어느 사이트에서든 이 주소로 쿠키와 함께 소켓을 연다(CORS가 막지 않는다). 신호에는 `seq`뿐이지만 남의 사이트가 "언제 바뀌었는지"를 엿보지 못하게 한다.
  - 브라우저 WebSocket은 헤더를 붙일 수 없어 `X-Cached-User`가 없다. 신호만 오므로 괜찮다: 이어지는 피드 요청이 409로 걸러진다(4.5).
- 쓰기 디스패처(구현):
  - 검증용 `load()`와 함께 `SELECT max(seq) FROM changes`(1행)로 쓰기 전 로그 끝을 읽는다.
  - 쓰기가 끝나면 답 피드와 함께 `touchedSince`로 그 뒤의 로그 행을 가계부별로 묶는다: `SELECT ledger_id, max(seq) FROM changes NOT INDEXED WHERE seq > ? AND ledger_id IS NOT NULL GROUP BY ledger_id`. `NOT INDEXED`가 없으면 SQLite가 `GROUP BY` 때문에 `changes_ledger` 인덱스 전체를 훑는다(2년치 로그 40,000행). 있으면 rowid 범위로 그 쓰기의 행만 읽는다(`ANALYZE` 전후 같음).
  - 가계부마다 `ctx.waitUntil(stub.fetch('https://room/poke', { method: 'POST', body: '{"seq":<그 가계부의 마지막 seq>}' }))`. 응답을 기다리지 않는다.
  - 처음 안은 "핸들러마다 어느 가계부를 건드렸는지"였으나, 로그 행이 이미 그것을 적고 있어(3.3) 디스패처 한 곳에서 읽는다. 그 사이에 들어온 남의 쓰기도 함께 poke될 수 있다(신호가 하나 늘 뿐이다).
  - `removeMember`(내보내기·나가기): 그 가계부의 poke에 `?kick=<빠진 사람>`을 붙인다. 나가는 사람의 다른 기기도 닫힌다.
  - `setMemberRole`: kick하지 않는다. 보기 권한으로 내려도 연결은 남고 쓰기만 서버가 거절한다. `members` 행이 poke한다.
  - `seen`처럼 `ledger_id`가 없는 로그 행만 쓰는 요청은 poke하지 않는다.

### 5.4 클라이언트 (확정)

- `src/client/app/socket.ts`의 `watchRoom(ledgerId, { poke, open, removed })`: 열린 공유 방 하나에 소켓 하나. 방을 바꾸면 닫고 새로 연다. 메모(혼자)와 상위 가계부(늘 소유자 혼자)는 열지 않는다(지금의 폴링 조건과 같음).
- **누가 여는가 (결정): 방을 보고 있는 탭마다 연다. 잠금 주인이 열지 않는다.**
  - 잠금 주인은 탭을 바꿀 때마다 바뀐다(결정 12). 주인이 열면 전환마다 다시 연결해야 하고(연결마다 Worker 요청 1 + DO 요청 1), 주인은 다른 탭이 어느 방을 보는지도 알아야 한다.
  - 탭마다 열면 소켓은 그 탭의 방에만 묶이고 잠금과 상관없다. 탭 전환 10번에 다시 연결 0번(5.6).
  - 한 신호에 탭 여럿이 각자 피드를 받지 않게: 피드를 받는 것은 늘 잡은 탭 하나다. 잡은 탭은 `poll(seq)`, 다른 탭은 `{ type: 'sync', seq }`를 보낸다. 잡은 탭은 `queue` 안에서 차례가 왔을 때 복사본의 `seq`가 이미 신호의 `seq` 이상이면 피드를 묻지 않는다. 같은 신호를 여러 탭이 넘겨도 피드는 한 번이고, 자기 쓰기의 신호는 쓰기의 답이 이미 가져와서 0번이다.
  - 얼어 있는 탭의 소켓은 서버에서 한동안 열려 있다. DO는 신호를 보내기만 하고(실패는 무시) 깨어난 탭은 위와 같이 거른다. 늦게 안 옛 주인(4.7)이 신호로 `sync(true)`를 불러도 `poll()`을 거치므로 다시 시도 대기를 지키고, 중복은 `seq`로 걸러진다.
  - 가려진 탭도 소켓을 닫지 않는다(전환마다 다시 연결하지 않게). 다만 신호에 반응하지 않고 가장 큰 `seq`만 기억했다가, 보이게 되면 한 번 확인한다. 소켓이 열려 있었고 놓친 신호가 없으면 보일 때 확인하지 않는다.
- 소켓이 열리면(처음과 다시 연결) 한 번 확인한다: 열리기 전과 끊긴 동안의 변경. 그 뒤로는 신호로만 확인하고 폴링하지 않는다. 받은 `{ seq }`가 로컬 `seq`보다 크면 `sync?since=`(outbox가 비어 있을 때; 아니면 비운 뒤. P2의 `sync()`가 하던 대로).
- 30초마다 `ping`. 다음 ping 때까지 아무 답(`pong`이나 신호)이 없으면 끊긴 것으로 보고 닫는다. 잠들었다 깨거나 네트워크가 바뀌면 `close` 이벤트가 몇 분 동안 오지 않을 수 있다.
- 끊기면 1 → 2 → 5 → 30초(마지막이 반복)로 다시 연결하고, 그동안은 P0-a 폴링으로 돌아간다. 열리면 대기 횟수를 처음으로 돌린다. 코드 `4403`이면 다시 연결하지 않고 확인해서 맞춘다(가계부가 사라진다).
- 다시 시도를 기다리는 동안(4.2, 429·5xx) 온 신호는 요청을 내지 않고 "확인이 밀렸다"(`retry.feed`)만 적는다. 기다림이 끝나 가는 시도가 outbox만 보내는 것이었어도 피드까지 묻는다. 그래서 신호가 기다림을 깨지 않고, 기다림 동안의 신호도 잃지 않는다. 폴링만 하던 P2는 다음 폴링이 이를 메웠지만, 신호만 기다리는 동안에는 메울 것이 없다.
- `WebSocket`이 없으면 소켓을 열지 않고 지금처럼 폴링한다. Web Locks가 없으면 탭마다 따로 동기화하므로(4.3) 탭마다 자기 신호에 피드를 받는다.
- 저장 모양(SCHEMA)과 outbox `patch` 형식은 바꾸지 않았다. `TabMessage`의 `sync`에 `seq?`를 더했다(옛 빌드 탭은 무시하고 지금처럼 확인한다).

### 5.5 비용·한도

- 연결 1 = Worker 요청 1 + DO 요청 1, poke(+kick) 1 = DO 요청 1. 클라이언트가 보내는 메시지는 ping뿐이고 자동 응답이라 DO를 깨우지 않는다. 쉬는 연결은 Hibernation으로 시간 요금이 없다.
- 혼자 쓰는 가계부의 쓰기도 poke한다(5.3의 확정대로). DO 요청은 쓰기와 연결 수만큼이라 Worker 요청 수를 넘지 않는다. 그래서 무료 한도에서 먼저 닿는 것은 여전히 Workers 요청 10만/일이다.
- D1 읽기(§6, 2년치·가계부 24개):
  - 신호로 시작된 `sync?since=`(변경 1건): 28행(멤버십 24 + `pruned_to` 1 + `max(seq)` 1 + 로그 1 + 내역 재조회 1). 로그인 확인 3을 더하면 31행. 변경 없는 폴링(26행)과 거의 같다.
  - 쓰기마다 더해지는 것: 쓰기 전 `max(seq)` 1 + `touchedSince`가 읽는 그 쓰기의 로그 행(내역 하나면 1).
  - 소켓 연결: 로그인 확인 3 + 멤버 확인 1.
- 로컬 `wrangler dev`는 SQLite DO를 지원한다(확인함).

### 5.6 검증 결과

Chromium(Playwright 1.63), `wrangler dev` + Vite 프록시, 두 계정(dev, bobby)이 가계부 하나를 함께 쓴다. bobby의 브라우저는 모든 요청(소켓 포함)에 `X-Dev-User: bobby`를 붙인다.

| 확인 | 결과 |
| --- | --- |
| A의 쓰기가 B 화면에 보이기까지 | 두 번 돌려 API로 쓴 내역 10번 41–74ms, A 화면에서 보낸 대화 6번 66–89ms. B는 신호마다 `GET /api/sync` 1번, 쓴 A는 자기 신호에 0번 |
| 소켓이 열린 60초 | B의 폴링 0회(요청 0, pong 2). 소켓이 없는 같은 화면은 60초에 3회 |
| 같은 기기 탭 둘, 둘 다 보임 | 신호 3번에 피드 3번(잡은 탭만), 두 탭 모두 보임 |
| 한 탭이 가려짐 | 가려진 탭은 반응하지 않음, 신호 3번에 피드 3번. 다시 보이면 잠금을 가져오며 피드 1번(놓친 신호는 `seq`로 걸러짐) |
| 잠금 주인이 바뀜 | 탭 전환 10번에 소켓 다시 연결 0, 닫힘 0. 피드 9번은 P2의 잠금 가져오기 비용(4.3) |
| 소켓이 끊김 | 1초 뒤 다시 연결, 열리며 피드 1번, 끊긴 사이의 쓰기가 보임 |
| 20초 동안 연결 실패 | 폴링으로 돌아감(10·15·25·30초), 그 사이 쓰기 둘이 폴링으로 보임, 38초에 다시 연결(1+2+5+30초) 뒤 폴링 멈춤 |
| 보기 권한으로 내림 | 소켓 유지, 신호로 피드 1번, 복사본의 권한이 viewer |
| 멤버에서 뺌 | 신호로 피드 → 41–46ms에 화면에서 가계부가 사라짐(복사본에도 없음), 이어 4403으로 닫힘, 다시 연결 0 |
| 비멤버·다른 출처·`X-User` 위조 | 비멤버 404, 다른 사이트 `Origin` 403, 클라이언트의 `X-User: dev`는 무시되고 bobby로 태그됨 |
| 피드가 429·503을 받는 동안 | 신호 8번(1초 간격)에도 확인은 0·5·15초뿐(RETRY 대기 그대로), 15.1초에 8개 모두 보임 |
| Web Locks 없음 | 두 탭 모두 보임, 탭마다 피드 1번(4.3대로) |

재현 스크립트는 구현 PR 설명에 적은 위치에 있다(`repro-p3.mjs`의 인자 `latency idle60 idle60-nows tabs drop outage kick retry-429 retry-503 nolocks`).

`docs/ledger-baseline.md` §8.4·§8.14를 이에 맞춰 고쳤다.

### 5.7 알려진 한계

- **방 하나의 신호만 받는다.** 방에 앉아 있는 동안 그 가계부 밖의 변경(친구, 받은 초대, 다른 가계부)은 오지 않는다. P2까지는 폴링이 전체 피드를 받아 이것도 함께 왔다. 다음 확인(잠금 가져오기, 내 쓰기의 답, 방 열기·다시 연결) 때 온다. 남긴 이유: 사용자 범위의 소켓은 연결·DO를 하나 더 둔다.
- **연결하는 순간과 빼내는 순간이 겹치면 빠진 사람의 소켓이 남을 수 있다.** 멤버 확인을 지난 뒤, DO가 소켓을 받기 전에 빼내고 kick하면 그 소켓은 닫히지 않는다. 신호(`seq`)만 받고, 그 신호로 받은 피드가 가계부를 지우면 클라이언트가 스스로 닫는다. 데이터는 새지 않는다.
- **쓰기와 쓰기 전 `max(seq)` 사이에 들어온 남의 쓰기도 poke된다.** 신호가 하나 늘고, 클라이언트가 `seq`로 거른다.
- **방을 열 때마다(그리고 다시 연결할 때마다) 피드 한 번.** 같은 방을 두 탭이 동시에 열면 두 번이다(이때는 `seq`가 없어 거르지 못한다).
- **끊긴 직후의 첫 폴링은 그때까지 늘어난 간격을 따른다.** 신호로 확인한 결과 새 것이 없었으면 간격이 늘어 있어서, 20초 장애 시험에서 첫 폴링이 10초 뒤였다. 다시 연결은 1초 뒤에 먼저 시도한다.
- **가려진 탭의 소켓도 열어 둔다.** 얼어 있는 탭의 소켓은 TCP가 끊길 때까지 서버에 남는다. DO에는 신호 하나 보낼 곳이 늘 뿐이다.
- **ping은 가려진 탭에서 늦을 수 있다.** 브라우저가 배경 타이머를 1분까지 늦추면 조용히 끊긴 소켓을 알아채는 데 1–2분 걸린다. 보이게 될 때 놓친 신호가 없으면 확인하지 않으므로, 그 사이의 변경은 다음 신호나 다시 연결 때 온다.
- **로컬 런타임의 닫기.** 서버가 닫은 소켓(kick)은 Chrome에 약 2초 뒤에 `close`가 온다. 신호를 먼저 보내므로 화면은 바로 바뀐다. 페이지가 닫는 쪽은 `webSocketClose`에서 답해 바로 닫힌다. Cloudflare 운영 환경에서 같은지(닫기 자동 응답 호환 플래그 포함)는 확인하지 않았다.
- **돌려 보지 못한 것.** Safari·Firefox·iOS(설치된 Playwright 빌드가 맞지 않음), 운영 배포(CSP `connect-src 'self'`가 같은 출처의 `wss:`를 허용하는지, Cloudflare의 유휴 연결 끊기와 30초 ping), 실제 네트워크 끊김(페이지에서 닫기와 연결 거절로 흉내 냄), 실제 동결.

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
