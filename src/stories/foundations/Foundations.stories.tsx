import type { Meta, StoryObj } from '@storybook/react-vite';
import tokens from '../../client/brand/tokens.css?raw';
import {
  UGA_REACTIONS,
  UgaIcon,
  UgaLogo,
  UgaMascot,
  UgaAvatar,
  UgaReaction,
  type UgaIconName,
} from '../../client/brand/Uga';
import reactionAssets from '../../../public/brand/reactions/manifest.json';
import { Grid, Inline, Stack, Surface } from '../../client/ui';

const declarations = [...tokens.matchAll(/(--brand-[\w-]+):\s*([^;]+);/g)].map((match) => ({
  name: match[1],
  value: match[2].trim(),
}));
const colors = declarations.filter(({ value }) => value.startsWith('#') && !value.includes(' '));
function Foundations() {
  return (
    <Stack gap={6}>
      <header>
        <h1>한 곳에서 관리하는 디자인 기준</h1>
        <p>
          아래 값은 앱의 tokens.css에서 읽습니다. 색상·간격·글꼴을 바꾸면 실제 화면과 명세가 함께
          바뀝니다.
        </p>
      </header>
      <Grid columns={4} tabletColumns={3} mobileColumns={1} gap={3}>
        {colors.map(({ name, value }) => (
          <Surface key={name} padding={4} raised>
            <Stack gap={3}>
              <div
                aria-hidden="true"
                style={{
                  height: 44,
                  borderRadius: 'var(--brand-radius-sm)',
                  background: `var(${name})`,
                  border: '1px solid var(--brand-line)',
                }}
              />
              <strong style={{ overflowWrap: 'anywhere' }}>{name}</strong>
              <code>{value}</code>
            </Stack>
          </Surface>
        ))}
      </Grid>
    </Stack>
  );
}
const meta = {
  title: '01 Foundations · 기초/Tokens',
  component: Foundations,
  parameters: {
    docs: {
      description: {
        component:
          '단일 기준 파일 src/client/brand/tokens.css. 사용자 태그·가계부에 저장된 색상은 브랜드 토큰으로 덮어쓰지 않습니다. 밝은 브랜드 색은 장식·배경에 쓰고, 본문은 semantic text 토큰을 사용합니다.',
      },
    },
  },
} satisfies Meta<typeof Foundations>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Colors: Story = {};
export const Typography: Story = {
  render: () => (
    <Stack gap={4}>
      <h1>읽기 쉬운 가계부</h1>
      {declarations
        .filter(({ name }) => name.startsWith('--brand-font-size'))
        .map(({ name }) => (
          <Surface key={name} padding={4}>
            <p style={{ fontSize: `var(${name})`, overflowWrap: 'anywhere' }}>
              우리 집의 기록 123,456원
            </p>
            <code>{name}</code>
          </Surface>
        ))}
      <p>시스템 한글 글꼴을 사용합니다. 금액·날짜는 tabular-nums로 자릿수를 맞춥니다.</p>
    </Stack>
  ),
};
export const Spacing: Story = {
  render: () => (
    <Stack gap={4}>
      <h1>4px 기반 간격</h1>
      {declarations
        .filter(({ name }) => name.startsWith('--brand-space'))
        .map(({ name, value }) => (
          <Inline key={name} gap={3}>
            <div
              aria-hidden="true"
              style={{ width: `var(${name})`, height: 24, background: 'var(--brand-primary)' }}
            />
            <code>
              {name}: {value}
            </code>
          </Inline>
        ))}
      <Surface padding={4}>
        <p>
          Stack/Inline/Grid의 gap과 Surface의 padding은 이 토큰의 번호를 받습니다. 버튼은 최소 44px,
          기본 입력 필드는 48px를 기준으로 합니다.
        </p>
      </Surface>
    </Stack>
  ),
};
export const BrandAssets: Story = {
  render: () => (
    <Stack gap={6}>
      <h1>앱과 같은 브랜드 자산</h1>
      <UgaLogo alt="우가" />
      <Inline gap={4}>
        <UgaMascot pose="wave" size={100} />
        <UgaMascot pose="record" size={100} />
        <UgaAvatar mood="happy" size={48} />
      </Inline>
      <Inline gap={4}>
        {(
          [
            'home',
            'ledger',
            'assets',
            'payments',
            'analytics',
            'planning',
            'tags',
            'data',
          ] as UgaIconName[]
        ).map((name) => (
          <Stack key={name} gap={2}>
            <UgaIcon name={name} size={32} />
            <span>{name}</span>
          </Stack>
        ))}
      </Inline>
      <p>장식 이미지는 빈 alt, 정보가 있는 이미지는 의미 있는 alt를 제공합니다.</p>
    </Stack>
  ),
};

const decorations = reactionAssets.assets.filter((asset) => asset.kind === 'decoration');
export const ReactionAssets: Story = {
  render: () => (
    <Stack gap={6}>
      <h1>반응 스티커와 장식</h1>
      <p>
        내역에 다는 반응과 대화에 보내는 것은 우가 스티커 30종(대화 12 · 감정 18)과 장식 23종입니다.
        스티커 원본은 256px이고 96px로 줄인 사본을, 장식은 128px 원본을 22px(칩)·44px(고르기)로
        씁니다.
      </p>
      {(['대화', '감정'] as const).map((group) => (
        <section key={group}>
          <h2>{group} 스티커</h2>
          <Grid columns={4} tabletColumns={4} mobileColumns={3} gap={3}>
            {UGA_REACTIONS.filter((item) => item.group === group).map((item) => (
              <Stack key={item.id} gap={1}>
                <UgaReaction id={item.id} size={44} />
                <span>{item.label}</span>
              </Stack>
            ))}
          </Grid>
        </section>
      ))}
      <section>
        <h2>장식</h2>
        <Grid columns={4} tabletColumns={4} mobileColumns={3} gap={3}>
          {decorations.map((asset) => (
            <Stack key={asset.id} gap={1}>
              <img src={asset.file} width={24} height={24} alt="" />
              <span>{asset.label}</span>
            </Stack>
          ))}
        </Grid>
      </section>
    </Stack>
  ),
};
