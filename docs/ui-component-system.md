# UI 컴포넌트와 살아있는 명세

기준일: 2026-11-03

## 컴포넌트 계위 (기준)

원자 컴포넌트부터 단계적으로 조립해 View까지 구성한다. 화면이 다루는 제품·데이터 기준은 [가계부 재설계 기준](./ledger-baseline.md)을 따른다.

| 단계           | 역할                                                    | 가계부를 아는지 | 데이터      |
| -------------- | ------------------------------------------------------- | --------------- | ----------- |
| 01 Foundations | 토큰(색·글자·간격·모서리·그림자·모션), 우가 브랜드 자산 | 모름            | 없음        |
| 02 Atoms       | 더 쪼갤 수 없는 단일 요소                               | 모름            | props만     |
| 03 Molecules   | 원자를 묶어 기능 하나를 하는 요소                       | 모름            | props만     |
| 04 Organisms   | 내역·필드·태그·가계부(상위·하위) 개념을 아는 블록       | 앎              | props만     |
| 05 Templates   | 모바일 화면의 틀. 위치만 정하고 내용은 슬롯으로 비운다  | 모름            | 없음        |
| 06 Views       | Templates에 Organisms를 넣고 합성 데이터로 완성한 화면  | 앎              | 합성 데이터 |

- 아래 단계는 위 단계를 import하지 않는다. 업무 규칙을 Atoms·Molecules 안에 넣지 않는다.
- Views까지 API 호출·저장 로직이 없다. 서버 연결과 상태 관리는 이후 앱 연결 층이 맡는다. 그래서 모든 화면 상태(빈 값·오류·긴 이름 등)를 Storybook에서 재현한다.
- 사이드바 이름은 영문 단계명에 한글 설명을 붙인다. 예: `02 Atoms · 원자`. Views의 기본 너비는 모바일 390px이다.

### 단계별 구성

기존 컴포넌트를 재분류하고, 화면에 필요한 신규 컴포넌트(＋)를 더한다.

| 단계        | 기존                                                                                                                                                                                                | 신규                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundations | tokens.css, UgaLogo·UgaIcon·UgaAvatar·UgaMascot·UgaIllustration                                                                                                                                     | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Atoms       | Button, IconButton, Input, Textarea, Checkbox, Radio, TagBadge(→ `Tag`), Tooltip, Popover, Stack, Inline, Grid, Surface                                                                             | Amount(금액 표시), CountBadge(새 내역 수), Bar(통계 막대), Switch(켜기/끄기), Slider(범위 값)                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Molecules   | Field·TextField, SelectField, DateField, MonthField, ColorField, FileField, SegmentedControl, Tabs, Stat, Empty, Panel, Toolbar, SummaryGrid, TableScroll, FormBody·FormFooter·FormGrid·FormSection | AmountInput(큰 금액 입력), ChipSelect(단일·다중 선택과 옵션 즉석 추가), SearchField, FilterChip, Menu(드롭다운 메뉴: 트리거·항목·키보드), List·ListRow(목록과 한 줄: 아이콘·제목·보조 줄·끝 정보), StatBar(라벨·막대·금액·비율), Notice(페이지 위 알림: 저장 실패·복사 완료)                                                                                                                                                                                                                                                                                                |
| Organisms   | —                                                                                                                                                                                                   | 방: RoomListItem, RoomHeader, RoomTabBar(하단 내역·통계·대화·설정 탭), SummaryStrip · 내역: RecordRow, RecordDayGroup, RecordList, RecordTable, RecordFilterBar(검색·조회 조건·표/캘린더 전환) · 캘린더: PeriodCalendar, DayRecords · 통계: StatsBreakdown · 입력: DynamicField(필드 정의 → 입력 위젯), RecordForm · 설정: FieldSchemaEditor, TagOptionEditor, KindOptionEditor(유형) · 상위·하위: ChildPicker, ParentPicker, LedgerPicker · 사람: PersonRow, ProfilePicture, AvatarPicker(사진 올리기·기본 우가 그림), FriendList, MemberList, FriendPicker, RoomInviteRow |
| Templates   | Dialog(FullScreenSheet의 바탕)                                                                                                                                                                      | Screen(첫 화면 탭·방 공통 틀: 고정 상단·본문·하단 탭 막대), FullScreenSheet(입력·설정), BottomSheet(날짜별 내역 등), StatusScreen(앱 불러오는 중·불러오기 실패)                                                                                                                                                                                                                                                                                                                                                                                                             |
| Views       | —                                                                                                                                                                                                   | RoomListView, CreateLedgerView, LedgerRoomView(표·캘린더·통계·대화, 상위는 내역마다 원본 가계부 링크), RecordEntryView(추가·수정), LedgerSettingsView, LoginView(가입 초대 포함), SignupView, FriendsView·SignupLinkSheet, LedgerMembersView(멤버·하위 전부 공유), InviteAcceptView, AccountView, LeaveAccountView                                                                                                                                                                                                                                                          |

**자체 UI 원칙**: 브라우저 기본 모양이 드러나는 컨트롤을 두지 않는다. 모든 컨트롤은 디자인 토큰으로 그린다.

- 펼쳐지는 컨트롤(선택·날짜·색상·파일·드롭다운 메뉴·툴팁)은 Popover 위에 자체 구현한다. native `<select>`·날짜 선택기·색상 선택기를 쓰지 않는다.
- 값 하나를 바꾸는 컨트롤(체크박스·라디오·스위치·슬라이더)은 native 요소를 유지하고 토큰으로 다시 그린다. 키보드·폼 제출·접근성을 그대로 얻기 위해서다.
- 목록·표·스크롤 영역도 공통 컴포넌트(List·ListRow·TableScroll)로 그린다.

FileField·MonthField는 지금 쓸 화면이 없지만 남기고 catalog에 미사용으로 표시한다.

### 폴더와 경계

```
src/client/
  brand/       01 Foundations
  ui/          02 Atoms · 03 Molecules   (가계부를 모름)
  ledger/      04 Organisms              (가계부 도메인)
  templates/   05 Templates
  views/       06 Views
src/stories/<단계>/                       스토리도 같은 단계로
```

`check:ui-spec`은 단계 폴더 밖(`src/client/` 바로 아래)의 TS 파일과 허용되지 않은 방향의 import를 실패로 처리한다. 허용: `ui` → brand, `ledger` → brand·ui·shared, `templates` → brand·ui, `views` → 전부, `app` → 전부. `src/shared`는 도메인 계약이라 `ledger`·`views`·`app`만 가져온다. `app/`은 화면 밖의 앱 층(데이터 불러오기·저장, 어떤 화면을 열지)이고 Storybook에 올리지 않는다. `views/`의 파일은 화면 목록과 story에 등록해야 한다. 합성 데이터는 Organisms가 받는 타입(가계부·필드 정의·태그 옵션·내역)과 같은 모양으로 둔다.

### 조립 순서

각 단계마다 `check:ui`를 통과한 뒤 다음 단계로 넘어간다.

1. 기존 컴포넌트를 새 폴더·스토리 제목으로 옮긴다(동작 변화 없음).
2. 신규 Atoms
3. 신규 Molecules
4. 도메인 타입과 합성 데이터
5. Organisms
6. Templates
7. Views

### 현재 상태

1–7단계를 마쳤다. Storybook은 `00 Guide`부터 `06 Views`까지 단계 제목으로 정리했다. 2단계 Atoms: Amount·CountBadge·Bar·Switch·Slider와 `02 Atoms/Inputs`. 3단계 Molecules: AmountInput·SearchField·FilterChip·ChipSelect·Menu·List·ListRow·StatBar(`ui/molecules.css`, Menu를 위한 Popover `role="menu"`). 4단계: 도메인 타입과 검증·합계 함수(`src/shared/ledger.ts`), Notion 샘플 기반 합성 데이터(`src/stories/fixtures.ts`), `00 Guide/데이터 모델`. 5단계 Organisms(`src/client/ledger/`): 방(RoomListItem·RoomHeader·RoomTabBar·HomeTabBar·SummaryStrip), 내역(RecordRow·RecordDayGroup·RecordList·RecordTable·RecordFilterBar·RecordReactions), 캘린더(PeriodCalendar·DayRecords), 통계(StatsBreakdown), 입력(DynamicField·RecordForm), 설정(FieldSchemaEditor·TagOptionEditor), 상위·하위(ChildPicker·ParentPicker·LedgerPicker). 통계·조건 함수 `statAxes`·`breakdown`·`filterRecords`를 `src/shared`에 더했다. 6단계 Templates(`src/client/templates/`): Screen(방 목록·방 공통 틀), FullScreenSheet·BottomSheet(Dialog 위). 7단계 Views(`src/client/views/`): 로그인, 방 목록, 가계부 방(하위가 있으면 상위 가계부 상태), 내역 입력, 가계부 만들기·설정. 화면은 [화면 목록](../src/stories/screens.json)에 등록하고 기본 너비는 모바일 390px이다. Views까지 API·저장은 없고 상위 콜백만 부른다. `06 Views/전체 흐름`은 화면을 메모리 상태로 연결해, 추가한 내역이 표·캘린더·통계·방 목록에 반영되는지 검증한다. 1차 검토로 태그 옵션의 색 견본(ColorField `compact`), 새 내역의 금액 포커스와 기간 안 기본 날짜, 둥근 넓게 보기 표(최신순·한 줄), 중복 표현 정리(지출 표시·통계 합계·로고 제목), 검색+조회 조건 한 줄 도구, 알약형 태그, 통계 기본 기준(옵션이 가장 많은 단일 선택 필드)과 상위 가계부의 가계부별 기준을 반영했다. 이후 가계부와 묶음을 하나로 합쳐, 하위 가계부가 있는 가계부(상위 가계부)가 아래 모든 내역을 모아 보여주도록 바꿨다(여러 단계, 순환 금지, 상위는 자기 내역 없음). 앱 연결을 시작했다: `src/client/app/`이 Views를 API에 연결하고, `src/server/`(Cloudflare Worker)와 D1(`migrations/`)이 가계부·상위 연결·내역을 저장한다. 서버는 요청마다 멤버십을 확인하고 색·아이콘·순환·상위 내역 금지를 검사한다. 로그인은 아직 없고 로컬에서만 개발 계정으로 동작한다. 계정·친구·공유 화면(가입, 친구·가입 초대 링크, 멤버·하위 전부 공유, 받은 초대, 프로필·탈퇴, 앱 설정, 자산)과 앱 상태(StatusScreen, Notice)도 Storybook에 더했다. 이후 캔버스 검토를 반영해 유형 태그, 태그 조건, 방 하단 탭(내역·통계·대화·설정), 첫 화면 하단 탭(친구·가계부·자산·설정), 우가 스티커 반응, 자산, 대화를 더했다. 실제 앱(`src/client/app/`)은 프로필(사진 포함)·친구·멤버 초대·받은 초대·가입 초대 링크·새 내역 배지까지 서버(`src/server/people.ts`)에 연결했다. 남은 것은 Google 로그인과 계정 만들기(가입 화면), 로그아웃·탈퇴, 가입 링크로 들어오는 화면, 대화 새 글 배지, 동시 편집(`version`)이다.

### 조립 규칙

- `Stack`: 세로 흐름, `Inline`: 줄바꿈 가능한 가로 흐름, `Grid`: 같은 너비의 카드, `Surface`: 내용의 경계.
- `gap`/`padding`은 토큰 번호를 받는다. 예: `gap={4}`는 `--brand-space-4`(16px).
- Grid는 데스크톱 `columns`, 761~1000px `tabletColumns`, 760px 이하 `mobileColumns`를 받는다. 기본 모바일 1열. 달력의 7일 열과 표는 전용 배치를 유지한다.
- `as`로 HTML 의미를 유지한다. `ul`/`ol`을 쓰면 자식은 `li`로 만든다.
- Button 기본 `type`은 `button`. 저장은 명시적 `type="submit"`. `busy`는 중복 클릭을 차단한다. IconButton은 `aria-label` 필수.
- `Input`/`Textarea`/`Checkbox`/`Radio`/`Field`는 native props·ref·라벨·폼 검증을 유지한다. 설명과 오류 연결이 필요한 새 폼은 `TextField`로 조립한다.
- `FormBody`/`FormFooter`/`FormGrid`/`FormSection`은 모든 편집창의 공통 구조다. `Panel`/`SummaryGrid`/`Toolbar`/`TableScroll`은 화면의 내용 경계·요약·도구·표 영역을 담당한다. 가로로 긴 표는 이름이 있는 키보드 스크롤 영역에 둔다.
- `SegmentedControl`은 선택 상태를 `aria-pressed`로, `Tabs`는 tablist/tab/tabpanel 계약으로 표현한다. 방향키·Home·End는 비활성 옵션을 건너뛴다. 별도 시각 패턴이 있으면 `appearance="plain"`을 사용한다.
- `Dialog dirty`와 `CloseButton`은 미저장 내용을 버릴지 확인한다. 계속 작성 시 값과 포커스를 유지하고, 버리면 원래 열기 버튼으로 돌아간다. 저장 성공은 화면의 `onClose`/`onSaved`로 직접 닫는다. `locked` 동안은 닫기와 Escape를 막는다.
- 날짜·선택·색상은 기존 자체 컨트롤을 사용한다. 태그는 사용자 색상과 배지 표현을 유지한다.
- Dialog를 열면 `[data-autofocus]`가 붙은 칸에 포커스를 둔다. 새 내역은 금액부터 시작해 휴대폰에서 숫자 키패드가 바로 열린다.
- 다른 사람이 저장했을 수 있는 값(색·아이콘·우가 그림·프로필 사진)은 컴포넌트가 다시 검증한다. 색은 `isHexColor`를 통과한 `#RRGGBB`만 CSS로 보내고, Uga 이미지는 알려진 이름만 경로로 만들며, 프로필 사진은 `isProfilePhotoUrl`을 통과한 이 앱의 경로만 그린다. 사용자 글자는 HTML로 넣지 않는다.
- Storybook과 이후 앱은 같은 [app-styles.css](../src/client/app-styles.css)를 같은 순서로 읽는다. Storybook 전용 CSS는 캔버스 여백만 정한다.

```tsx
<Surface padding={4}>
  <Stack gap={4}>
    <h2>가계부 요약</h2>
    <Grid columns={3} tabletColumns={2} mobileColumns={1} gap={3}>
      {/* 실제 요약 컴포넌트 */}
    </Grid>
    <Inline gap={2} justify="end">
      <Button variant="primary" onClick={onCreate}>
        내역 추가
      </Button>
    </Inline>
  </Stack>
</Surface>
```

## 실행

```sh
npm ci
npm run storybook
# http://127.0.0.1:6006

npm run check:ui
# 타입 → 목록 검사 → 정적 빌드 → Chromium 320 / 390 / 1440px
```

- `npm run build:storybook`: `storybook-static/` 생성.
- `npm run test:storybook`: **현재 정적 빌드**를 임시 루프백 서버에서 검사하고 종료한다. 소스를 바꿨다면 먼저 빌드하거나 `check:ui`를 실행한다.
- 빠른 재검증: `UI_TEST_WIDTHS=390 npm run test:storybook`.
- Controls로 props, Docs로 사용 규칙, 접근성 패널로 위반, Viewport로 화면 너비를 확인한다.

## 검증과 데이터 경계

실제 Chromium에서 모든 story를 렌더링하고 `play` 조작을 실행한다. 320/390/1440px에서 WCAG 2 A/AA·2.1 AA 자동 검사와 페이지 가로 넘침 검사를 수행한다. 자동 검사는 모든 접근성·디자인 품질을 증명하지 않으며 중요한 패턴은 눈으로도 확인한다.

Storybook 공식 [test-runner](https://storybook.js.org/docs/writing-tests/integrations/test-runner)를 사용한다. 스토리는 표준 CSF와 `storybook/test` API로 작성해 향후 전환할 수 있다. 현재 Storybook 설정 로더의 `module.register()`와 Jest 30.5의 충돌은 공식 Jest 확장 설정에서 typed hook을 불러와 해결한다. `.storybook/browser-checks.ts`가 브라우저·접근성 검증을 맡는다.

테스트 도구 아래 `uuid`는 설치 당시 확인된 구버전 advisory를 해결하기 위해 11.1.1로 제한했다. 런타임 앱 의존성을 바꾸지 않는다.

- Storybook에는 합성 예시만 있다. 실제 XLSX·DB·계정·쿠키를 가져오지 않으며 `App`을 마운트하지 않는다.
- CI는 비밀값 없이 실행하고 정적 결과를 GitHub Actions artifact로 보관한다. 인터넷에 공개 호스팅하지 않는다. 로컬 Storybook이 필요하면 `npm run storybook`으로 시작한다.

## 변경 작업의 완료 기준

1. 새로운 컴포넌트를 만들기 전에 목록과 기존 요소를 확인한다.
2. 공유 요소는 토큰·native props·접근 이름·키보드·반응형 동작을 정의한다.
3. 같은 작업 커밋에 실제 소스를 import한 story, props 설명, 필요한 상태 예시를 넣는다. 기본/빈 값/긴 내용/비활성/오류/권한 상태 중 해당되는 것만 추가한다.
4. 유의미한 클릭·선택·포커스·콜백을 `play`로 검증한다. 모든 story에 테스트를 형식적으로 복제하지 않는다.
5. `catalog.json`의 실제 적용 상태를 갱신하고 `check:ui`를 통과시킨다.
6. 의미·동작·props가 바뀌면 소비 위치와 story를 함께 수정한다. 이전 예시를 남겨 다른 규칙을 가르치지 않는다.
7. CI 실패는 수정 후 반영한다. 저장소 branch protection의 필수 검사 설정은 별도 저장소 관리 범위이며 이 문서만으로 강제되지 않는다.

## 공통화 유지와 검증 범위

`check:ui-spec`은 다음을 검사한다.

- 컴포넌트와 화면 목록의 소스·스토리가 실제로 존재하는지
- 새 화면이 화면 목록과 살아있는 명세에 등록되었는지
- 화면에서 raw button/input/textarea/select/label이나 중복 panel/form/grid 컨테이너를 다시 만들지 않는지
- Storybook에서 App을 마운트하지 않는지

native HTML은 공통 기본 요소 내부에서 사용한다. 업무별 표·달력·차트·내비게이션 구조는 전용 패턴으로 만든다. 공통 구조 규칙은 `ui/`에, 업무별 배치 규칙은 각 화면 CSS에 둔다.

CI는 타입 검사, 명세 목록 검사, Storybook 빌드, 모든 story의 320/390/1440px 검사를 실행한다. 결과는 비밀값 없는 정적 artifact로 남긴다. 이 구성 자체가 GitHub branch protection을 설정하지는 않는다.
