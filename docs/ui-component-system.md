# UI 컴포넌트와 살아있는 명세

기준일: 2026-09-17

## 현재 상태

기존 앱은 토큰·달력·선택창·태그 등 일부 공통 요소를 갖추고 있었지만, 버튼·필터·배치가 페이지 JSX와 큰 CSS 파일에 남아 있었다. 모든 화면이 독립적인 컴포넌트로 조립되어 있던 상태는 아니다.

이번 구성은 **실제 앱 소스를 Storybook에서 그대로 실행**하고, 적용 현황과 남은 전환 대상을 함께 관리한다. [컴포넌트 목록](../src/stories/catalog.json)이 현황의 기준이며 Storybook의 `00 Guide`가 이를 읽어 표시한다. 시각적으로 비슷한 복제품을 별도 구현하지 않는다.

| 계층           | 책임                                   | 위치                                           |
| -------------- | -------------------------------------- | ---------------------------------------------- |
| 01 Foundations | 의미 색·글자·간격·모션·브랜드 자산     | `src/client/brand/`                            |
| 02 Components  | 버튼·선택·날짜·태그·툴팁·모달·요약     | `src/client/ui/Button.tsx`, 기존 공통 컴포넌트 |
| 03 Layout      | 세로 흐름·가로 흐름·격자·내용 경계     | `src/client/ui/Layout.tsx`                     |
| 04 Patterns    | 현재 방과 계위·보기 전환 등 UI 조합    | `src/client/RoomHeader.tsx`                    |
| 05 Domain      | 가계부 방 목록·달력·계위·태그 입력     | 기존 도메인 컴포넌트                           |
| 앱 연결        | 데이터 요청·권한·라우팅·저장·공동 편집 | `App.tsx`, 훅·폼·페이지                        |

의존 방향은 위에서 아래가 아니라 **앱 → 도메인/패턴 → 기본 요소/배치 → 토큰**이다. 기본 요소가 앱·API·라우터를 가져오지 않는다. 업무 규칙을 공통 Button/Grid 안에 넣지 않는다.

### 조립 규칙

- `Stack`: 세로 흐름, `Inline`: 줄바꿈 가능한 가로 흐름, `Grid`: 같은 너비의 카드, `Surface`: 내용의 경계.
- `gap`/`padding`은 토큰 번호를 받는다. 예: `gap={4}`는 `--brand-space-4`(16px).
- Grid는 데스크톱 `columns`, 761~1000px `tabletColumns`, 760px 이하 `mobileColumns`를 받는다. 기본 모바일 1열. 달력의 7일 열과 표는 전용 배치를 유지한다.
- `as`로 HTML 의미를 유지한다. `ul`/`ol`을 쓰면 자식은 `li`로 만든다.
- Button 기본 `type`은 `button`. 저장은 명시적 `type="submit"`. `busy`는 중복 클릭을 차단한다. IconButton은 `aria-label` 필수.
- 날짜·선택·색상은 기존 자체 컨트롤을 사용한다. 태그는 사용자 색상과 배지 표현을 유지한다.
- 앱과 Storybook은 같은 [app-styles.css](../src/client/app-styles.css)를 같은 순서로 읽는다. Storybook 전용 CSS는 캔버스 여백만 정한다.

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

- `npm run build:storybook`: `storybook-static/` 생성. 앱 `dist/`와 별개다.
- `npm run test:storybook`: **현재 정적 빌드**를 임시 루프백 서버에서 검사하고 종료한다. 소스를 바꿨다면 먼저 빌드하거나 `check:ui`를 실행한다.
- 빠른 재검증: `UI_TEST_WIDTHS=390 npm run test:storybook`.
- Controls로 props, Docs로 사용 규칙, 접근성 패널로 위반, Viewport로 화면 너비를 확인한다.

## 검증과 데이터 경계

1. **단위 테스트**: 기존 Vitest가 금액 계산·서버 업무 규칙을 검사한다.
2. **컴포넌트 명세**: 실제 Chromium에서 모든 story를 렌더링하고 `play` 조작을 실행한다. 320/390/1440px에서 WCAG 2 A/AA·2.1 AA 자동 검사와 페이지 가로 넘침 검사를 수행한다. 자동 검사는 모든 접근성·디자인 품질을 증명하지 않으며 중요한 패턴은 눈으로도 확인한다.
3. **앱 E2E**: 폼 저장·실시간 변경·권한·뒤로가기 등 앱 전체 흐름은 기존 Playwright가 담당한다.

Storybook 10.6의 Vitest addon은 현재 Vitest 5와 peer 범위가 맞지 않아 기존 테스트 도구를 유지하고 공식 [test-runner](https://storybook.js.org/docs/writing-tests/integrations/test-runner)를 사용한다. 스토리는 표준 CSF와 `storybook/test` API로 작성해 향후 전환할 수 있다. 현재 Storybook 설정 로더의 `module.register()`와 Jest 30.5의 충돌은 공식 Jest 확장 설정에서 typed hook을 불러와 해결한다. `.storybook/browser-checks.ts`가 브라우저·접근성 검증을 맡는다.

테스트 도구 아래 `uuid`는 설치 당시 확인된 구버전 advisory를 해결하기 위해 11.1.1로 제한했다. 런타임 앱 의존성을 바꾸지 않는다.

- [fixtures.ts](../src/stories/fixtures.ts)는 손으로 만든 가상 자료다. 실제 XLSX·DB·계정·쿠키를 가져오지 않는다.
- Storybook은 `App`과 `useBudget`을 마운트하지 않으며 Vite의 Worker 프록시를 상속하지 않는다.
- `/api` 요청은 preview에서 저장하지 않고 오류 응답을 돌려준다. 테스트 브라우저도 `/api/**`를 차단한다.
- TagFields의 기존 옵션 선택은 검증하지만 서버 옵션 생성은 앱 E2E 범위다. callback 확인을 실제 DB 저장 성공으로 표현하지 않는다.
- CI는 비밀값 없이 실행하고 정적 결과를 GitHub Actions artifact로 보관한다. 인터넷에 공개 호스팅하지 않는다. 로컬 Storybook이 필요하면 `npm run storybook`으로 시작한다.

## 변경 작업의 완료 기준

1. 새로운 컴포넌트를 만들기 전에 목록과 기존 요소를 확인한다.
2. 공유 요소는 토큰·native props·접근 이름·키보드·반응형 동작을 정의한다.
3. 같은 작업 커밋에 실제 소스를 import한 story, props 설명, 필요한 상태 예시를 넣는다. 기본/빈 값/긴 내용/비활성/오류/권한 상태 중 해당되는 것만 추가한다.
4. 유의미한 클릭·선택·포커스·콜백을 `play`로 검증한다. 모든 story에 테스트를 형식적으로 복제하지 않는다.
5. `catalog.json`의 실제 적용 상태를 갱신하고 `check:ui`를 통과시킨다. 앱 연결을 바꾸면 관련 E2E도 실행한다.
6. 의미·동작·props가 바뀌면 소비 위치와 story를 함께 수정한다. 이전 예시를 남겨 다른 규칙을 가르치지 않는다.
7. CI 실패는 수정 후 반영한다. 저장소 branch protection의 필수 검사 설정은 별도 저장소 관리 범위이며 이 문서만으로 강제되지 않는다.

## 남은 전환

- Stack/Inline/Surface는 새 UI 조립에 쓸 수 있지만 모든 기존 페이지에 적용한 것은 아니다.
- 텍스트/숫자 입력, Checkbox, 세그먼트 선택 일부는 페이지 JSX와 공통 CSS에 남아 있다.
- 자산·카드/통장·통계·계획·데이터 관리 전체 화면과 폼은 API 결합을 분리한 뒤 별도 화면 명세로 확장해야 한다.
- `styles.css`/`design-system.css`의 기존 오버라이드는 일괄 삭제하지 않았다. 화면을 전환할 때 해당 규칙을 소유 컴포넌트로 이동하고 중복을 정리한다.
- 과거 브랜드 보드는 시각 참고 자료다. 현재 컴포넌트의 동작·상태 기준은 Storybook과 실제 앱 소스다.

## 이번 변경의 로컬 검증

2026-09-17 macOS·Chromium 기준으로 타입 검사와 제품/Storybook 빌드, 95개 상태 × 320·390·1440px(총 285회)의 조작·접근성·가로 넘침 검사를 통과했다. 기존 단위 검사는 235개 통과·선택적 원본 XLSX 검사 1개 제외, 방 이동·컨트롤·모바일 화면 E2E 17개 통과다. 개발 서버의 시작 화면·버튼 API 문서와 모바일 가계부·헤더도 직접 확인했다.

검사 중 발견한 빈 선택 목록의 ARIA 역할, 날짜/월 필수 입력 안내, 색상 입력의 첫 편집 초기화 문제를 실제 공통 컴포넌트에서 수정했다. CI 설정 추가는 원격 실행 성공을 의미하지 않으므로 실제 실행 결과는 해당 커밋의 GitHub Actions 기록으로 확인한다.
