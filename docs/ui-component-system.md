# UI 컴포넌트와 살아있는 명세

기준일: 2026-11-02

## 현재 상태

이전 앱 화면은 핵심 UX 재설계를 위해 제거했다. 남은 것은 토큰·기본 컴포넌트·배치·화면 패턴과 이를 실행하는 Storybook이다. 새 화면은 이 요소로 조립하고, 만들 때마다 화면 목록과 story에 등록한다.

[컴포넌트 목록](../src/stories/catalog.json)은 14개 항목을 등록하며 모두 `ready`(조립 준비) 상태다. [화면 목록](../src/stories/screens.json)은 비어 있다.

| 계층           | 책임                               | 위치                                           |
| -------------- | ---------------------------------- | ---------------------------------------------- |
| 01 Foundations | 의미 색·글자·간격·모션·브랜드 자산 | `src/client/brand/`                            |
| 02 Components  | 버튼·선택·날짜·태그·툴팁·모달·요약 | `src/client/ui/Button.tsx`, 기존 공통 컴포넌트 |
| 03 Layout      | 세로 흐름·가로 흐름·격자·내용 경계 | `src/client/ui/Layout.tsx`                     |
| 04 Patterns    | 버튼 조합·폼·패널·요약·표 영역     | `src/client/ui/Patterns.tsx`                   |
| 05 Domain      | (재설계 후) 업무 단위 컴포넌트     | 새 도메인 컴포넌트                             |
| 06 Screens     | (재설계 후) 전체 화면              | `src/stories/screens/`                         |

의존 방향은 위에서 아래가 아니라 **앱 → 도메인/패턴 → 기본 요소/배치 → 토큰**이다. 기본 요소가 앱·API·라우터를 가져오지 않는다. 업무 규칙을 공통 Button/Grid 안에 넣지 않는다.

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
