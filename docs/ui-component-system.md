# UI 컴포넌트와 살아있는 명세

기준일: 2026-11-02

## 컴포넌트 계위 (기준)

원자 컴포넌트부터 단계적으로 조립해 View까지 구성한다. 화면이 다루는 제품·데이터 기준은 [가계부 재설계 기준](./ledger-baseline.md)을 따른다.

| 단계           | 역할                                                    | 가계부를 아는지 | 데이터      |
| -------------- | ------------------------------------------------------- | --------------- | ----------- |
| 01 Foundations | 토큰(색·글자·간격·모서리·그림자·모션), 우가 브랜드 자산 | 모름            | 없음        |
| 02 Atoms       | 더 쪼갤 수 없는 단일 요소                               | 모름            | props만     |
| 03 Molecules   | 원자를 묶어 기능 하나를 하는 요소                       | 모름            | props만     |
| 04 Organisms   | 내역·필드·태그·가계부·묶음 개념을 아는 블록             | 앎              | props만     |
| 05 Templates   | 모바일 화면의 틀. 위치만 정하고 내용은 슬롯으로 비운다  | 모름            | 없음        |
| 06 Views       | Templates에 Organisms를 넣고 합성 데이터로 완성한 화면  | 앎              | 합성 데이터 |

- 아래 단계는 위 단계를 import하지 않는다. 업무 규칙을 Atoms·Molecules 안에 넣지 않는다.
- Views까지 API 호출·저장 로직이 없다. 서버 연결과 상태 관리는 이후 앱 연결 층이 맡는다. 그래서 모든 화면 상태(빈 값·오류·긴 이름 등)를 Storybook에서 재현한다.
- 사이드바 이름은 영문 단계명에 한글 설명을 붙인다. 예: `02 Atoms · 원자`. Views의 기본 너비는 모바일 390px이다.

### 단계별 구성

기존 컴포넌트를 재분류하고, 화면에 필요한 신규 컴포넌트(＋)를 더한다.

| 단계        | 기존                                                                                                                                                                                                | 신규                                                                                                                                                                                                                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundations | tokens.css, UgaLogo·UgaIcon·UgaAvatar·UgaMascot·UgaIllustration                                                                                                                                     | —                                                                                                                                                                                                                                                                                                                                       |
| Atoms       | Button, IconButton, Input, Textarea, Checkbox, Radio, TagBadge(→ `Tag`), Tooltip, Popover, Stack, Inline, Grid, Surface                                                                             | Amount(금액 표시), CountBadge(새 내역 수), Bar(통계 막대), Switch(켜기/끄기), Slider(범위 값)                                                                                                                                                                                                                                           |
| Molecules   | Field·TextField, SelectField, DateField, MonthField, ColorField, FileField, SegmentedControl, Tabs, Stat, Empty, Panel, Toolbar, SummaryGrid, TableScroll, FormBody·FormFooter·FormGrid·FormSection | AmountInput(큰 금액 입력), ChipSelect(단일·다중 선택과 옵션 즉석 추가), SearchField, FilterChip, Menu(드롭다운 메뉴: 트리거·항목·키보드), List·ListRow(목록과 한 줄: 아이콘·제목·보조 줄·끝 정보), StatBar(라벨·막대·금액·비율)                                                                                                         |
| Organisms   | —                                                                                                                                                                                                   | 방: RoomListItem, RoomHeader, SummaryStrip · 내역: RecordRow, RecordDayGroup, RecordList, RecordTable, RecordFilterBar · 캘린더: PeriodCalendar, DayRecords · 통계: StatsBreakdown · 입력: DynamicField(필드 정의 → 입력 위젯), RecordForm · 설정: FieldSchemaEditor, TagOptionEditor · 묶음: LedgerCardList, GroupPicker, LedgerPicker |
| Templates   | Dialog(FullScreenSheet의 바탕)                                                                                                                                                                      | ListScreen(방 목록 틀), RoomScreen(고정 헤더·보기 전환·본문·하단 고정 버튼), FullScreenSheet(입력·설정), BottomSheet(날짜별 내역 등)                                                                                                                                                                                                    |
| Views       | —                                                                                                                                                                                                   | RoomListView, CreateLedgerView, LedgerRoomView(표·캘린더·통계), RecordEntryView(추가·수정), GroupRoomView, LedgerSettingsView, GroupSettingsView, LoginView                                                                                                                                                                             |

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

`check:ui-spec`은 단계 폴더 밖(`src/client/` 바로 아래)의 TS 파일과 허용되지 않은 방향의 import를 실패로 처리한다. 허용: `ui` → brand, `ledger`·`templates` → brand·ui, `views` → 전부. `views/`의 파일은 화면 목록과 story에 등록해야 한다. 합성 데이터는 Organisms가 받는 타입(가계부·필드 정의·태그 옵션·내역·묶음)과 같은 모양으로 둔다.

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

1단계(기존 컴포넌트 이동)와 2단계(신규 Atoms)를 마쳤다. 기존 요소는 `brand/`·`ui/`·`templates/`에 있고, Storybook은 `00 Guide`~`05 Templates` 제목으로 정리했다. TagBadge는 `Tag`로 이름을 바꿨다(CSS 클래스는 그대로). 2단계에서 Amount·CountBadge·Bar·Switch·Slider를 추가하고 Input·Textarea·Checkbox·Radio를 `02 Atoms/Inputs` 스토리로 분리했다. 금액 서식 `won`은 Amount에 있고 Stat이 이를 사용한다. [컴포넌트 목록](../src/stories/catalog.json)은 21개 항목이 모두 `ready`(조립 준비)이며 [화면 목록](../src/stories/screens.json)은 비어 있다. 다음은 3단계(신규 Molecules: 드롭다운 메뉴·목록 포함)다.

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
