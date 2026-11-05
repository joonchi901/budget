# 우가 디자인시스템

기준일: 2026-09-17. 첫 번째 참고 이미지의 밝은 브랜드 보드 구성과 일곱 가지 색상을 유지하고, 두 번째 이미지의 수염 있는 우가 캐릭터와 확정한 Primary Logo Lockup을 기준으로 완성했다.

## 살아있는 컴포넌트 명세

현재 UI 동작·상태·props의 기준은 React 컴포넌트를 그대로 실행하는 **Storybook**이다. `npm run storybook`으로 실행하며, [UI 컴포넌트 체계](./ui-component-system.md)에서 계층·적용 현황·검증 규칙을 확인한다. 아래 정적 보드는 브랜드 방향과 시각 참고 자료로 유지한다.

## 보드와 원본

- [브랜드 보드](../design/uga/system/brand-board.png): 기본 로고, 앱 아이콘, 아바타, 단색 아이콘, 팔레트, 주요 카피, 키워드, 카드 헤더, PICK 배지, FAB, 빈 상태, 스티커, 컴포넌트 사용 예시.
- [UI 규칙 보드](../design/uga/system/ui-board.png): 글자·금액 위계, 버튼 상태, 입력·선택, 열린 선택창·달력, 오류·파일 선택, 표면·간격, 기능 아이콘, 표정, 상황별 캐릭터.
- [반응형 HTML 보드](../design/uga/system/index.html). 앱 정적 경로 `/brand/design-system.html`에서도 동일한 보드를 제공한다.
- [테마 계약](../design/uga/system/theme-contract.md): 색상 의미, 대비, 크기, 초점, 모션, 사용 원칙.
- [SVG 에셋 목록](../public/brand/manifest.json): 40종의 파일·출처·제작 방식.
- [우가 워드마크 아이콘](../public/brand/uga-wordmark-icon.svg): 웹 아이콘에 쓸 수 있도록 ‘우가’ 두 글자를 정사각형 투명 캔버스에 배치한 SVG.
- [돈주머니와 뼈다귀 아이콘](../public/brand/uga-app-icon-moneybag-imagegen.svg): ImageGen 시안을 벡터로 옮긴 투명 배경의 웹 아이콘.
- [감정·대화 스티커와 장식](../design/uga/reactions/README.md): 스티커 30종과 장식 23종의 개별 투명 PNG, 표시 크기 미리보기, 생성 프롬프트.

브랜드 원형은 [대표 캐릭터](../design/uga/representative/uga-character-v1.png)와 [Primary Logo Lockup](../design/uga/primary-logo/uga-primary-logo.svg)이다. 앱용 SVG는 `public/brand/`에 둔다. Primary 로고는 승인된 SVG와 바이트가 동일하다. 나머지 캐릭터는 같은 참고 이미지의 얼굴·수염·머리·점박이 옷·뼈다귀를 유지해 벡터화하거나 조합했다. UI 아이콘은 브라운 윤곽과 뼈·돌·가죽·종이 모티브로 구성했다. 명암과 질감은 벡터 면으로 단순화했다.

40종은 캐릭터 1, 로고·워드마크 4, 앱 아이콘·단색·머리 4, 아바타 4, 스티커 9, 기능·모티브 아이콘 15, 배지·카드 헤더·빈 상태 3종이다. SVG 안에는 래스터 이미지, 실행 스크립트, 외부 글꼴이나 외부 연결이 없다. 한글 로고·배지 글자도 경로다.

## 앱의 공통 기준

[tokens.css](../src/client/brand/tokens.css)가 보드와 앱의 공통 원본이다. 보드 생성기는 이 파일을 읽어 HTML에 포함하고, Storybook과 이후 앱은 `app-styles.css`에서 다른 CSS보다 먼저 불러온다. 토큰을 변경하면 보드도 다시 생성한다.

| 역할          | 기준                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| 브랜드 팔레트 | 브라운 `#5B4636`, 코랄 `#F08A5D`, 샌드 `#F6E1C7`, 민트 `#A7D7C5`, 스카이 `#7CC7F2`, 크림 `#FAF8F4`, 차콜 `#4B4B4B` |
| 행동·선택     | 주요 행동은 브라운, 선택·링크는 대비를 높인 코랄 `#AD4F2C`                                                         |
| 의미 색       | 수입·성공, 지출·오류, 주의, 안내를 각각 라벨과 색으로 구별                                                         |
| 글자          | 한국어 OS 글꼴, 본문 15px, 제목 30px, 주요 금액 최대 36px, 숫자 고정 폭                                            |
| 형태          | 카드 22px, 컨트롤 14px, 다이얼로그 28px, 따뜻한 표면과 얕은 그림자                                                 |
| 조작          | 주요 조작 44px, 입력 48px, 불투명 3px 키보드 초점                                                                  |
| 모션          | 120–220ms 속성별 전환, 동작 줄이기 설정 지원                                                                       |

기존 `--blue` 같은 변수는 호환용 이름이며 실제 값은 의미에 맞는 `--brand-*` 토큰으로 연결한다. 사용자·태그·카드·통장·가계부에 저장된 색상은 브랜드 팔레트로 덮어쓰지 않는다. 차트의 기본 색상만 브랜드 팔레트를 사용한다.

[Uga.tsx](../src/client/brand/Uga.tsx)는 로고·캐릭터·아바타·기능 아이콘·일러스트를 공통으로 제공한다. 이미지의 크기를 예약하고, 장식은 빈 대체 텍스트로 처리한다. 탐색 버튼에는 기존 기능 이름을 유지한다. 가계부의 기존 emoji 저장값은 표시할 때만 브랜드 SVG로 대응한다.

## 재생성과 검증

보드 생성은 Python 표준 라이브러리만 사용한다. 보드 렌더링은 프로젝트의 Playwright와 Chromium을 사용한다.

```sh
python3 design/uga/system/source/build-board.py
node design/uga/system/source/render-board.mjs
npm run check:ui
```

에셋은 `design/uga/system/source/build-assets.py`와 `render-assets.mjs`로 재현한다. 에셋 제작용 Python 도구는 Pillow, NumPy, vtracer 0.6.12이며 앱 의존성에는 추가하지 않았다. 원본 참고 자료와 기능 아이콘 원형은 같은 source 폴더에 보관했다. 승인된 로고는 `design/uga/primary-logo/`에서 가져온다.

브랜드 보드와 Storybook의 금액은 합성 예시다.
