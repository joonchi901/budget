import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import SessionScreen from '../../client/SessionScreen';
const meta = {
  title: '06 Screens/Session',
  component: SessionScreen,
  tags: ['root-screens'],
  args: { onDemoLogin: fn(), loginHref: '#storybook-login' },
  parameters: {
    ownsMain: true,
    docs: {
      description: {
        component:
          '실제 로그인/불러오기 화면입니다. Storybook에서는 세션을 생성하지 않고, Google 로그인 링크도 내부 예시 앵커로 대체합니다.',
      },
    },
  },
} satisfies Meta<typeof SessionScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Production: Story = { args: { oidcEnabled: true } };
export const Demo: Story = {
  args: { demoEnabled: true },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /나로 시작하기/ }));
    await expect(args.onDemoLogin).toHaveBeenCalledWith('u1');
  },
};
export const Loading: Story = { args: { loading: true }, parameters: { ownsMain: false } };
export const Busy: Story = {
  args: { demoEnabled: true, busy: true },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: /나로 시작하기/ }),
    ).toBeDisabled();
  },
};
export const Error: Story = {
  args: { oidcEnabled: true, error: '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.' },
};
export const Unconfigured: Story = {};
