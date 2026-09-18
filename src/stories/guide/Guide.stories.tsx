import type { Meta, StoryObj } from '@storybook/react-vite';
import catalog from '../catalog.json';
import { Grid, Stack, Surface } from '../../client/ui';

const statuses: Record<string, string> = {
  shared: '앱 연동',
  partial: '일부 적용',
  ready: '조립 준비',
  legacy: '전환 대기',
};
function Guide() {
  return (
    <Stack gap={6}>
      <header>
        <p className="eyebrow">UGA · LIVING UI SPECIFICATION</p>
        <h1>화면과 함께 바뀌는 UI 명세</h1>
        <p>실제 React 컴포넌트, 디자인 토큰, 상태별 예시와 조작 검증을 한 곳에서 관리합니다.</p>
      </header>
      <Surface padding={5}>
        <Stack gap={3}>
          <h2>구성 순서</h2>
          <p>
            기초 규칙 → 기본 컴포넌트 → 배치 → 화면 패턴 → 도메인 → 전체 화면 → 앱의 데이터·라우팅
            연결
          </p>
          <p>
            세로 흐름은 Stack, 가로 흐름은 Inline, 같은 너비의 카드는 Grid로 조립합니다. 달력과
            데이터 표는 정보 구조에 맞는 전용 배치를 유지합니다.
          </p>
        </Stack>
      </Surface>
      <Grid columns={3} mobileColumns={1} gap={4}>
        <Surface padding={5}>
          <Stack gap={3}>
            <h2>살펴보기</h2>
            <p>
              각 항목의 Docs에서 props·사용 규칙을 확인하고 Controls로 값을 바꿔 보세요. 모바일
              320/390·태블릿·데스크톱 너비를 선택할 수 있습니다.
            </p>
          </Stack>
        </Surface>
        <Surface padding={5}>
          <Stack gap={3}>
            <h2>상태와 동작</h2>
            <p>
              빈 값·긴 이름·비활성·저장 중·권한·보관 상태를 확인합니다. play 시나리오는 실제
              Chromium에서 선택·클릭·키보드와 콜백을 검사합니다.
            </p>
          </Stack>
        </Surface>
        <Surface padding={5}>
          <Stack gap={3}>
            <h2>변경 관리</h2>
            <p>
              컴포넌트를 바꾸는 커밋에 상태 예시·사용 규칙·검증을 함께 넣습니다. CI에서 빌드, 조작,
              접근성, 가로 넘침을 확인합니다.
            </p>
          </Stack>
        </Surface>
      </Grid>
      <Surface padding={5} tone="subtle">
        <Stack gap={3}>
          <h2>데이터 경계</h2>
          <p>
            여기에는 합성 예시만 있습니다. 로그인·실제 금융 데이터·운영 API 연결은 없습니다. 서버에
            저장하는 동작과 공동 편집은 별도의 앱 E2E로 검증합니다.
          </p>
          <p>
            전체 주요 화면과 편집창이 공통 버튼·입력·폼·탭·표 영역을 사용합니다. 달력·차트·거래표의
            정보 구조에 맞는 전용 배치는 유지합니다.
          </p>
        </Stack>
      </Surface>
      <h2>컴포넌트 적용 현황</h2>
      <Grid columns={2} tabletColumns={2} mobileColumns={1} gap={3}>
        {catalog.map((item) => (
          <Surface key={item.name} padding={4} raised>
            <Stack gap={2}>
              <p className="small muted">
                {item.layer} · {statuses[item.status]}
              </p>
              <h3>{item.name}</h3>
              <p>{item.usage}</p>
              <a
                style={{ overflowWrap: 'anywhere' }}
                href={`https://github.com/joonchi901/budget/blob/main/${item.source}`}
                target="_blank"
                rel="noreferrer"
              >
                {item.source}
              </a>
            </Stack>
          </Surface>
        ))}
      </Grid>
    </Stack>
  );
}
const meta = {
  title: '00 Guide/시작하기',
  component: Guide,
  parameters: {
    docs: {
      description: {
        component:
          'src/stories/catalog.json이 적용 현황의 기준입니다. 공통 요소와 실제 소비 화면을 함께 등록하고, 새 화면의 원시 입력 요소 재도입을 CI에서 검사합니다.',
      },
    },
  },
} satisfies Meta<typeof Guide>;
export default meta;
export const Overview: StoryObj<typeof meta> = {};
