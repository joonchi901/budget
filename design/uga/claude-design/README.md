우가는 혼자 써도, 함께 써도 되는 가계부예요. 가계부 하나가 메신저의 방 하나처럼 열리고, 그 안에서 내역을 적고 표·캘린더·통계로 봐요. 이 시스템은 앱 코드(`src/client/brand/tokens.css`, `src/client/ui`, `src/client/ledger`)에서 그대로 옮겨 왔고, 컴포넌트는 Atoms → Molecules → Organisms 순서로 쌓여요. 화면(Views)은 이 컴포넌트를 조립해서 만들어요.

## 문구

- 해요체로, 짧게 써요. "아직 친구가 없어요. 아이디로 찾거나 가입 초대 링크를 보내 보세요."
- 버튼은 하는 일을 동사로 써요: "저장", "저장하고 계속", "초대", "수락", "보관". 결과가 바로 보이면 따로 완료 문구를 띄우지 않아요.
- 오류는 무엇이 틀렸고 어떻게 고치는지 말해요: "이름을 입력해 주세요.", "아이디는 영문 소문자·숫자·밑줄 4–20자로 정해 주세요." 사과하거나 뭉뚱그리지 않아요.
- 되돌릴 수 없는 동작은 한 번 더 누르게 해요: "삭제" → "한 번 더 누르면 삭제".
- 금액은 쉼표와 "원": `9,550원`. 지출은 `−9,550원`, 0은 부호 없이 `0원`. 날짜는 `11월 3일 (화)`, 기간은 `10/23 – 11/22`, 아이디는 `@yedi_kim`.
- 사용자에게 보이는 말로 이름 붙여요: "상위 가계부", "하위 가계부", "멤버", "가입 초대 링크". 내부 용어(parent, childIds, role)는 쓰지 않아요.
- 이모지와 느낌표는 쓰지 않아요.

## 색

- 바탕은 `brand-canvas`, 카드·목록·시트는 `brand-surface`, 입력칸은 `brand-surface-subtle`, 세그먼트와 비활성 면은 `brand-surface-muted`예요.
- 글자는 `brand-text`, 보조 글자는 `brand-text-secondary`, 흐린 안내는 `brand-muted`. 세 가지 모두 `brand-canvas`와 `brand-surface` 위에서 4.5:1 이상이에요.
- 주 동작은 `brand-primary`(갈색) 바탕에 `brand-on-primary` 글자로, 한 화면에 하나만 둬요. 나머지 버튼은 기본(테두리) 또는 plain이에요.
- 강조 글자·선택된 칩·배지는 `brand-accent`와 `brand-accent-soft`. `brand-coral`은 그림과 차트용이라 글자로 쓰지 않아요.
- 금액: 수입은 `brand-success`, 지출은 `brand-danger`. 오류·삭제·탈퇴도 `brand-danger`예요. 성공과 오류는 색만으로 구분하지 않고 부호(+/−)나 문구를 같이 둬요.
- 사용자가 고른 태그 색은 `#RRGGBB`만 받아 `Tag`가 대비를 맞춘 바탕·글자로 그려요. 저장된 태그·가계부 색을 브랜드 색으로 바꾸지 않아요. 새 태그는 12색 팔레트(`TAG_PALETTE`)에서 같은 필드가 가장 적게 쓴 색을 받아요.
- `brand-character-*`는 우가 그림 전용이에요.

## 글자

- 글꼴은 와구리체(`Waguri`, © 구리시, 공공누리 제1유형 출처표시) 하나예요. 불러오기 전에는 시스템 한글 글꼴이 대신해요.
- 와구리체는 Regular 하나뿐이고 굵기 흉내를 막아 두어(`font-synthesis: none`) 굵게 지정해도 같은 굵기로 보여요. 위계는 크기(`section`, `md`, `body`, `sm`, `caption`)와 색으로 만들어요.
- 큰 금액 입력은 `amount`, 화면 큰 제목은 `title`, 방·시트 제목은 `section`, 목록 제목과 버튼은 `md`, 본문은 `body`, 보조 글자는 `sm`, 기간·힌트는 `caption`, 배지는 `xs`예요.
- 숫자는 표 숫자(tabular-nums)로 자리를 맞춰요.

## 간격·모서리·그림자

- 4px 리듬(`brand-space-1`–`brand-space-12`). 화면 좌우 여백과 카드 안쪽은 `brand-space-4`, 섹션 사이는 `brand-space-6`.
- 각진 모서리를 두지 않아요. 버튼·입력칸은 `brand-radius-control`, 카드·목록 묶음은 `brand-radius-card`, 시트는 `brand-radius-dialog`, 칩·태그·배지는 `brand-radius-pill`. 안쪽 요소일수록 반경이 작아져요.
- 그림자는 갈색 기운의 옅은 두 겹: 카드 `brand-shadow-card`, 떠 있는 막대 `brand-shadow-raised`, 팝오버 `brand-shadow-popover`, 주 버튼 `brand-shadow-button`. 테두리는 `brand-line`.
- 터치 대상은 최소 `brand-control-size`(44px), 입력칸 높이는 `brand-field-size`.

## 화면 구성

- 모바일 390px이 기준이에요. 넓은 화면에서도 같은 구조를 가운데에 둬요.
- 첫 화면 탭과 방은 `Screen`: 위는 고정(제목·요약·검색), 아래는 엄지가 닿는 탭 막대예요. 첫 화면은 `HomeTabBar`(친구·가계부·자산·설정), 방은 `RoomTabBar`(내역·통계·하위·설정)이고, 내역 추가는 방 탭 막대 바로 위 가로 전체 버튼이에요.
- 입력·설정·멤버는 전체 화면 시트(`FullScreenSheet`)로 열고, 동작 버튼은 아래에 고정해요. 짧은 내용(그날 내역, 가입 초대 링크)은 아래에서 올라오는 시트(`BottomSheet`)예요.
- 저장 실패 같은 알림은 화면 위에 뜨는 `Notice`, 앱 전체 불러오기·실패는 `StatusScreen`이에요.

## 상태와 움직임

- 키보드 포커스는 `brand-focus-ring` 색 3px 링(`brand-focus-width`), 컨트롤에서 3px 떨어져(`brand-focus-offset`) 모든 바탕에서 3:1 이상이에요.
- 비활성은 `brand-disabled-bg`와 `brand-disabled-text`로, 누를 수 없음을 모양으로도 보여요.
- 들어올 때 움직이는 효과는 없어요. 누름·열림 반응만 120–220ms이고, 움직임 줄이기 설정에서는 0이에요.

## 브라우저 기본 컨트롤 금지

선택·날짜·색·파일·스위치·슬라이더까지 모든 컨트롤을 이 시스템의 컴포넌트로 그려요(`SelectField`, `DateField`, `MonthField`, `ColorField`, `FileField`, `Switch`, `Slider`). 화면 코드에서 `<button>`, `<input>`, `<select>`, `<label>`을 직접 쓰지 않아요.

## 아이콘과 그림

- 가계부 아이콘은 `Icons` 그룹의 우가 그림 15종(`UgaIcon`)이에요. 여러 색이라 CSS로 색이 바뀌지 않아요. 저장된 아이콘 이름은 정해진 목록만 받아요.
- 뒤로·메뉴·설정·추가 같은 조작 아이콘은 lucide-react 선 아이콘을 `brand-icon-sm`/`md`/`lg` 크기로 써요.
- 프로필은 사용자가 올린 사진을 쓰고(`ProfilePicture`), 없으면 `Avatars`의 기본 우가 그림 4종(`UgaAvatar`) 중 고른 것을 써요. 사진은 둥글게 잘라 보여주고, 이 앱이 제공하는 경로의 사진만 그려요.
- 우가 캐릭터와 스티커(`Mascot`)는 빈 상태·첫 사용·안내처럼 감정이 있는 순간에 하나만 써요. 로고(`Logos`)는 원본 그대로 쓰고 다시 그리지 않아요.

## 컴포넌트 쓰기

컴포넌트는 `components/bundle.js`가 `window.Uga`로 내놓아요. React 19(`components/lib/react.js`, `components/lib/react-dom.js`)가 먼저 있어야 해요. 각 컴포넌트 카드의 README에 props가 있고, 미리보기는 Storybook과 같은 샘플 데이터(`Uga.samples`: 11월·12월·일본여행 가계부, 2026·하반기·여행 상위 가계부, 준상·예디·예미·민호·서연)를 써요.

## 디자인 캔버스에서 쓰기

- 불러오는 순서: `tokens.css` → `components/bundle.css` → `components/bundle.js`. React는 캔버스가 제공해요.
- 우가 그림은 `brand/` 폴더에 두고, `bundle.js`가 자기 위치에서 찾아요(`components/`의 형제 폴더). `fonts/Waguri.woff2`는 `tokens.css`가 불러요.
- 컴포넌트는 `Uga.<이름>`으로 붙이고, 데이터가 필요한 Organisms에는 `Uga.samples`의 가계부·내역·사람을 넘겨요.
- 컴포넌트는 React 19로 만들었어요. React 18인 캔버스에서도 그려지지만, 메뉴·선택 팝업처럼 위치를 잡아 여는 요소는 열리지 않을 수 있어요.
