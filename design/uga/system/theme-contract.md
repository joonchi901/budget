# 우가 디자인시스템 테마 계약

이 문서는 디자인시스템 보드와 앱이 공유하는 시각 기준이다. 기반은 첫 번째 참고 이미지의 크림·브라운·코랄 팔레트와 구성 체계, 두 번째 참고 이미지에서 추출한 수염 있는 우가 캐릭터와 승인된 로고다. 부드러운 표면, 둥근 컨트롤, 친근한 그림을 사용하되 가계부의 숫자·입력·탐색 위계는 또렷하게 유지한다.

## 단일 토큰 소스

`src/client/brand/tokens.css`가 색·서체·간격·모서리·그림자·모션의 원본이다. 보드 생성기가 이 파일을 읽어 HTML에 포함하고, 앱도 같은 파일을 불러온다. CSS custom property 이름은 모두 `--brand-`로 시작한다. 자산 SVG의 캐릭터 색은 승인된 원형을 보존하고, UI 테마 변경을 이유로 SVG 색을 일괄 치환하지 않는다.

보드의 자산과 실제 크기 견본을 먼저 완성·검토한 뒤, 같은 토큰과 SVG를 앱 CSS 및 공통 컴포넌트에 연결했다.

## 컬러

| 원색 토큰          | 값        | 역할                 |
| ------------------ | --------- | -------------------- |
| `--brand-brown`    | `#5B4636` | 로고·메인 액션       |
| `--brand-coral`    | `#F08A5D` | 일러스트·강조 면     |
| `--brand-sand`     | `#F6E1C7` | 장식 배경            |
| `--brand-mint`     | `#A7D7C5` | 아바타·성공 보조 면  |
| `--brand-sky`      | `#7CC7F2` | 정보 보조 면         |
| `--brand-cream`    | `#FAF8F4` | 앱 캔버스            |
| `--brand-charcoal` | `#4B4B4B` | 원본 팔레트의 중립색 |

| 의미 토큰                                          | 값                    | 사용                              |
| -------------------------------------------------- | --------------------- | --------------------------------- |
| `--brand-primary` / `--brand-on-primary`           | `#5B4636` / `#FFFFFF` | 저장·기록 등 가장 중요한 버튼     |
| `--brand-primary-hover` / `--brand-primary-active` | `#493528` / `#3A281D` | 메인 버튼 포인터·누름 상태        |
| `--brand-accent` / `--brand-accent-soft`           | `#AD4F2C` / `#FFF0E6` | 선택된 메뉴·탭·필터·링크          |
| `--brand-accent-hover` / `--brand-accent-line`     | `#FBE4D3` / `#DFAD8E` | 선택 면의 상호작용·보조 경계      |
| `--brand-text` / `--brand-text-secondary`          | `#382B23` / `#69574A` | 본문·보조 본문                    |
| `--brand-muted` / `--brand-subtle`                 | `#75665A` / `#77685C` | 설명·자리표시자                   |
| `--brand-canvas` / `--brand-surface`               | `#FAF8F4` / `#FFFEFA` | 페이지·카드                       |
| `--brand-surface-subtle` / `--brand-surface-muted` | `#FBF6EE` / `#F3ECE2` | 입력·보조 버튼·분리 영역          |
| `--brand-surface-hover`                            | `#F7F0E7`             | 중립 행·컨트롤 hover              |
| `--brand-line` / `--brand-line-strong`             | `#E9DFD2` / `#9B8674` | 구분선·경계 식별이 필요한 입력    |
| `--brand-success` / `--brand-success-soft`         | `#38735B` / `#EAF5EF` | 수입·정상·완료                    |
| `--brand-danger` / `--brand-danger-soft`           | `#AE393B` / `#FFF0ED` | 오류·삭제·지출 의미가 필요한 수치 |
| `--brand-warning` / `--brand-warning-soft`         | `#8B611C` / `#FFF4D8` | 주의·확인 필요                    |
| `--brand-info` / `--brand-info-soft`               | `#286588` / `#EAF6FD` | 중립적인 안내                     |

밝은 코랄·민트·하늘색은 흰 바탕 위 작은 글자색으로 쓰지 않는다. 선택 상태와 수입·성공 의미를 분리한다. 차트에서 범주를 나누는 색, 사용자·태그·카드/통장·가계부가 저장한 색은 데이터이므로 브랜드 색으로 다시 저장하거나 덮어쓰지 않는다. 의미를 색만으로 전달하지 않고 라벨·아이콘·금액 부호를 함께 둔다.

아래 값은 sRGB 상대휘도 계산으로 확인한 대비다. 이는 정적 토큰 쌍의 검증이며 실제 화면의 모든 조합과 작은 아이콘 가독성은 별도로 확인한다.

| 전경 / 배경              | 대비    |
| ------------------------ | ------- |
| 흰색 / primary           | 8.85:1  |
| accent / surface         | 5.29:1  |
| accent / accent-soft     | 4.80:1  |
| text / canvas            | 12.87:1 |
| text-secondary / surface | 6.79:1  |
| muted / canvas           | 5.20:1  |
| subtle / surface-subtle  | 4.98:1  |
| success / success-soft   | 4.99:1  |
| danger / danger-soft     | 5.49:1  |
| warning / warning-soft   | 5.02:1  |
| info / info-soft         | 5.78:1  |
| focus-ring / canvas      | 5.04:1  |

## 타이포그래피와 금액

별도 폰트 의존성을 추가하지 않고 기존 한국어 OS 글꼴을 유지한다. 로고의 글자 모양은 로고 SVG가 담당한다. 본문에는 손글씨나 돌 질감 글꼴을 적용하지 않는다.

| 역할        | 토큰                        | 규칙                       |
| ----------- | --------------------------- | -------------------------- |
| 페이지 제목 | `--brand-font-size-title`   | 30px, 750, 줄높이 1.35     |
| 섹션 제목   | `--brand-font-size-section` | 19px, 650–750, 줄높이 1.35 |
| 주요 금액   | `--brand-font-size-amount`  | 36px, 750, 줄높이 1.25     |
| 본문·입력   | `--brand-font-size-body`    | 15px, 400–500, 줄높이 1.5  |
| 버튼        | `--brand-font-size-sm`      | 14px, 650                  |
| 보조 설명   | `--brand-font-size-caption` | 13px, 줄높이 1.6           |
| 짧은 배지   | `--brand-font-size-xs`      | 12px, 650                  |

루트 기준은 16px이다. 모든 동적 금액·날짜·카운트에는 `font-variant-numeric: tabular-nums`를 유지한다. 제목은 `text-wrap: balance`, 문단은 `text-wrap: pretty`, macOS는 `-webkit-font-smoothing: antialiased`를 사용한다. 표와 목록의 의미 있는 열 정렬을 유지하며 작은 화면에서 강제로 금액을 축소해 맞추지 않는다.

## 형태·간격·상호작용

- 간격은 `--brand-space-{1,2,3,4,5,6,8,10,12}` = 4·8·12·16·20·24·32·40·48px. 아이콘의 시각적 중심에 한해 2px 보정이 가능하다.
- 카드 22px, 컨트롤 14px, 다이얼로그 28px. 카드 내부 8px 여백으로 맞닿는 컨트롤은 14px을 사용해 중심이 같은 곡률을 만든다. 중첩 반경은 공간 관계에 맞추며 무조건 같은 값을 적용하지 않는다.
- 주요 조작과 아이콘 버튼은 44px 이상, 입력은 48px 이상. 작은 그림 자체를 확대하는 대신 주변 터치 영역을 확보한다.
- 표면은 따뜻한 옅은 다중 그림자를 사용한다. 진한 테두리를 모든 카드에 둘러 시각적 밀도를 높이지 않는다. 입력 경계, 오류, 초점처럼 식별이 필요한 곳은 명확한 선을 둔다.
- 포커스는 `--brand-focus-ring`의 불투명 3px 외곽선과 3px 간격. 옅은 focus shadow만으로 대체하지 않는다. 어두운 버튼에서도 외곽선은 주변 밝은 표면과 구분되도록 떨어뜨린다.
- 상태는 기본·hover·active·focus-visible·disabled·invalid를 보드에 표시한다. disabled는 비활성 스타일과 실제 `disabled` 동작을 함께 사용한다. 읽기 전용 값은 disabled와 혼동하지 않는다.
- 전환은 배경·글자·그림자 등의 실제 변화 속성만 120–220ms로 지정한다. `transition: all`은 사용하지 않는다. 가계부 첫 로드에 등장 애니메이션을 추가하지 않는다.
- `prefers-reduced-motion: reduce`는 모션 토큰을 0ms로 바꾼다. 기존 컴포넌트의 reduced-motion 규칙도 유지한다.

## 보드의 필수 컴포넌트 견본

브랜드 자산(대표 캐릭터·로고·앱 아이콘·아바타·단색·스티커)과 함께 다음 실사용 견본을 제공한다. 보드의 정적 견본은 공통 토큰을 쓰며 실제 조작 동작은 앱과 브라우저 테스트에서 검증한다.

1. 브랜드 행: 아바타, 서비스명, 짧은 설명, 이동 표시.
2. 메인/보조/텍스트/아이콘 버튼과 각 상태. 뼈다귀 FAB는 기능 라벨을 접근 이름으로 제공.
3. 이번 달 금액 요약 카드, 캐릭터 헤더 카드, PICK 배지.
4. 빈 상태: 작은 상황 일러스트, 제목, 한 문장 안내, 한 개의 관련 행동.
5. 입력·열린 선택창·달력·오류 안내의 예시. 폼 텍스트와 선택 상태 가독성 우선.
6. PC 선택 메뉴와 모바일 하단 탐색. 선택 라벨과 캐릭터 기반 기능 아이콘의 일관성.
7. 성공·주의·오류·정보, 수입·지출 금액의 의미 구분.
8. 16·20·24·32px 아이콘, 40px 아바타, 작은 앱 아이콘 등 실제 사용 크기.

## 보드 완료 후 앱에 합치는 순서

`main.tsx`는 `brand/tokens.css → styles.css → design-system.css → controls.css → date-fields.css` 순으로 불러온다. 각 화면 CSS와 태그·툴팁 스타일은 컴포넌트에서 추가로 불러온다. 기존 중복 팔레트는 공통 토큰과 호환 alias로 정리했다. 아래 순서가 적용과 후속 변경의 기준이다.

1. `main.tsx`에 `brand/tokens.css`를 공통 스타일보다 먼저 연결한다.
2. `styles.css`의 레이아웃·반응형 구조는 보존하고 중복된 root 색상 정의를 제거한다. `design-system.css`가 공통 컴포넌트의 최종 시각 규칙을 담당하도록 정리한다.
3. `design-system.css`에는 필요한 기존 변수 이름의 호환 alias만 둔다. `--text/--ink → --brand-text`, `--muted → --brand-muted`, `--canvas → --brand-canvas`, `--surface → --brand-surface`, `--line → --brand-line`, `--blue → --brand-accent`, `--blue-strong → --brand-primary`, `--blue-soft → --brand-accent-soft`, `--green → --brand-success`, `--sage → --brand-success-soft`, `--danger → --brand-danger`, `--shadow → --brand-shadow-card`, `--radius-card/control → 해당 brand 토큰`으로 연결한다. 신규 CSS에서는 의미가 분명한 brand 토큰을 직접 사용한다.
4. 기본 버튼에서 사용하던 `--green` 등은 버튼 역할에 맞게 `--brand-primary`로 직접 옮긴다. `.positive` 등의 재무 의미는 `--brand-success`로 둔다. 옛 변수 이름만 보고 일괄 치환해 의미를 섞지 않는다.
5. `controls.css`, `date-fields.css`, `color-field.css`, `tag-badge.css`, `tooltip.css`의 표면·열린 상태·포커스·오류를 같은 토큰으로 정리한다. 기존 키보드·Escape·바깥 클릭·초점 복귀 동작은 유지한다.
6. `assets.css`, `payments.css`, `planning.css`, `data.css`, `management.css`, `tags.css`의 옛 하드코딩 색을 용도별 semantic 토큰으로 교체한다. 저장 데이터와 차트의 독립 범주색은 범위에서 제외한다.
7. 캐릭터는 브랜드·아바타·빈 상태·가벼운 안내에 사용하고 반복 거래 행마다 대형 장식을 넣지 않는다. 메뉴/액션 아이콘은 기능별 식별성, 투명 배경, 공통 굵기, 실제 20–24px 크기를 확인한다.
8. PC와 390px/320px의 주요 7개 화면 및 열린 편집창·선택창을 확인한다. 오버플로·금액 가독성·포커스·disabled·저장 오류·의미 색을 확인한 뒤 필요한 기존 자동 검사를 실행한다.

## 범위 보존

이번 변경은 브랜드와 표시 계층이다. 거래 종류·자산 분류·카드 구매/납부 계산·태그 계층·동시 편집·저장·이관 계약을 변경하지 않는다. 사용자 저장 색, 실제 가계부 데이터, 원본 Excel을 변경하지 않는다. 새 의존성이나 배포는 이 테마 계약에 포함하지 않는다.
