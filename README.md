# 우리의 가계부 · 우가 디자인 시스템

핵심 UX부터 앱을 다시 설계하기 위해 이전 앱(서버·DB·화면·테스트·문서)을 모두 제거했습니다. 지금 저장소에는 디자인 시스템만 남아 있습니다. 이전 앱은 Git 기록 `d3509d5`에서 확인할 수 있습니다.

재설계의 제품·데이터·화면 기준은 [가계부 재설계 기준](./docs/ledger-baseline.md), 컴포넌트 계위는 [UI 컴포넌트 체계](./docs/ui-component-system.md)에 있습니다.

## 구성

| 위치                        | 내용                                                                     |
| --------------------------- | ------------------------------------------------------------------------ |
| `design/uga/`               | 브랜드 원본: 로고, 대표 캐릭터, 브랜드·UI 보드와 생성 스크립트           |
| `public/brand/`             | 앱용 SVG 38종과 HTML 브랜드 보드                                         |
| `src/client/brand/`         | 디자인 토큰 `tokens.css`, 로고·캐릭터·아이콘 컴포넌트 `Uga.tsx`          |
| `src/client/ui/`            | 버튼, 입력, 선택 그룹, 레이아웃(Stack·Inline·Grid·Surface), 폼·화면 패턴 |
| `src/client/*.tsx`          | 자체 선택·날짜·월·색상·파일 입력, 툴팁·팝오버, 태그 배지, 다이얼로그 등  |
| `src/client/app-styles.css` | 공통 스타일 진입점. 토큰 → 기본 요소 → 컨트롤 순서로 불러옵니다          |
| `src/stories/`              | Storybook 명세: 가이드, 기초 규칙, 컴포넌트, 배치, 패턴                  |

## 실행

Node.js 24와 npm을 준비합니다.

```sh
npm ci
npm run storybook
```

[http://127.0.0.1:6006](http://127.0.0.1:6006)에서 명세를 확인합니다.

| 명령                | 역할                                                             |
| ------------------- | ---------------------------------------------------------------- |
| `npm run storybook` | 로컬 Storybook 실행                                              |
| `npm run check:ui`  | 타입 → 명세 목록 검사 → 정적 빌드 → Chromium 320/390/1440px 검사 |
| `npm run typecheck` | TypeScript 검사                                                  |
| `npm run format`    | 소스·설정 서식 정리                                              |

브라우저 검사 전에 `npx playwright install chromium`으로 Chromium을 설치합니다. 규칙과 계층은 [UI 컴포넌트 체계](./docs/ui-component-system.md), 브랜드 기준은 [우가 디자인시스템](./docs/uga-design-system.md)을 따릅니다.

## 운영 환경

Cloudflare 운영 Worker `our-budget-production`과 운영 D1의 실제 데이터는 이 정리와 별개로 그대로 남아 있습니다. 새 앱을 배포하기 전에 기존 데이터를 어떻게 옮길지 먼저 정하세요.
