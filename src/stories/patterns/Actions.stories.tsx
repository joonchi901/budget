import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Plus, Settings2 } from 'lucide-react';
import { Button, IconButton, Inline, Stack } from '../../client/ui';

const meta = {
  title: '02 Components/Actions',
  component: Button,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '실제 방 헤더와 가계부 만들기에서 사용하는 버튼입니다. 기본 type은 button이며 폼 제출은 type="submit"으로 명시합니다. busy는 접근성 상태를 알리고 중복 클릭을 막습니다. plain은 방 탭처럼 상위 패턴이 모양을 정하는 경우에만 사용합니다. 아이콘만 표시할 때는 필수 aria-label을 가진 IconButton을 사용하세요.',
      },
    },
  },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'text', 'plain'] },
    type: { control: 'select', options: ['button', 'submit', 'reset'] },
    busy: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
  args: { children: '새 가계부', variant: 'primary', onClick: fn() },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: '새 가계부' });
    await expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const Variants: Story = {
  render: () => (
    <Inline gap={3}>
      <Button variant="primary">
        <Plus size={18} aria-hidden="true" />새 가계부
      </Button>
      <Button>취소</Button>
      <Button variant="text">자세히 보기</Button>
      <IconButton aria-label="가계부 설정">
        <Settings2 size={20} aria-hidden="true" />
      </IconButton>
    </Inline>
  ),
};

export const Busy: Story = {
  args: { children: '저장 중', busy: true },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: '저장 중' });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

export const Disabled: Story = { args: { disabled: true } };

export const LongLabel: Story = {
  args: { children: '우리 가족의 2026년 생활비를 기록할 새 가계부 만들기' },
  decorators: [
    (Story) => (
      <div style={{ width: 240, maxWidth: '100%' }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story:
          '긴 행동 이름은 줄바꿈합니다. 320px 모바일에서도 고정 너비나 nowrap으로 화면을 밀어내지 않습니다.',
      },
    },
  },
};

export const ExplicitFormSubmission: Story = {
  render: () => (
    <form aria-label="버튼 기본 동작 예시" onSubmit={(event) => event.preventDefault()}>
      <Stack gap={3}>
        <p>같은 폼 안에서도 보조 행동은 제출하지 않아요.</p>
        <Inline>
          <Button variant="secondary">보조 행동</Button>
          <Button variant="primary" type="submit">
            명시적으로 제출
          </Button>
        </Inline>
      </Stack>
    </form>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const form = canvas.getByRole('form');
    const submitted = fn();
    form.addEventListener('submit', submitted);
    await userEvent.click(canvas.getByRole('button', { name: '보조 행동' }));
    await expect(submitted).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole('button', { name: '명시적으로 제출' }));
    await expect(submitted).toHaveBeenCalledOnce();
    form.removeEventListener('submit', submitted);
  },
};
