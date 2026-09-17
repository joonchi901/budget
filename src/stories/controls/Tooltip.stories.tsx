import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within, waitFor } from 'storybook/test';
import { Info } from 'lucide-react';
import { Tooltip } from '../../client/Tooltip';

const meta = {
  title: '02 Components/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '아이콘의 부가 설명을 제공하는 공통 툴팁. 마우스를 잠시 올리거나 키보드로 포커스하면 표시됩니다. Escape로 닫은 상태에서는 포커스가 남아 있어도 즉시 다시 열리지 않습니다. 필수 정보는 툴팁 밖에도 제공해야 합니다.',
      },
    },
  },
  args: {
    content: '하위 가계부의 내역을 함께 포함해요.',
    children: (
      <button type="button" className="icon-button" aria-label="조회 대상 도움말">
        <Info size={20} />
      </button>
    ),
  },
  argTypes: { content: { control: 'text' }, children: { control: false } },
} satisfies Meta<typeof Tooltip>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const LongDescription: Story = {
  args: {
    content:
      '현재 가계부와 하위 가계부의 내역을 함께 보여줘요. 원본 내역은 해당 내역이 작성된 가계부에서 수정할 수 있어요.',
  },
};
export const NoDescription: Story = { args: { content: undefined } };
export const KeyboardAndEscape: Story = {
  render: (args) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <button type="button" className="secondary">
        포커스 시작
      </button>
      <Tooltip {...args} />
      <button type="button" className="secondary">
        다음 항목
      </button>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: '포커스 시작' }));
    await userEvent.tab();
    const trigger = canvas.getByRole('button', { name: '조회 대상 도움말' });
    await expect(trigger).toHaveFocus();
    await expect(await page.findByRole('tooltip')).toHaveTextContent(
      '하위 가계부의 내역을 함께 포함해요.',
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('tooltip')).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
    await expect(trigger).not.toHaveAttribute('aria-describedby');
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: '다음 항목' })).toHaveFocus();
  },
};
