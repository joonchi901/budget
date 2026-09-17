import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { FileField } from '../../client/FileField';

const meta = {
  title: '02 Components/FileField',
  component: FileField,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '파일 입력의 접근성과 브라우저 선택 기능을 유지하면서 우가 버튼·파일명 표현을 적용합니다. 이 컴포넌트는 파일 선택만 담당하며, 내용 검증·미리보기·업로드는 상위 흐름의 책임입니다. 아래 테스트 파일은 메모리에서 만든 공개 예시 데이터입니다.',
      },
    },
  },
  args: {
    'aria-label': '가계부 파일',
    accept: '.csv,.xlsx',
    disabled: false,
    multiple: false,
    onChange: fn(),
  },
  argTypes: {
    accept: { control: 'text' },
    disabled: { control: 'boolean' },
    multiple: { control: 'boolean' },
    onChange: { control: false },
  },
  decorators: [
    (Story) => (
      <div className="form-body">
        <label>
          가계부 파일
          <Story />
        </label>
      </div>
    ),
  ],
} satisfies Meta<typeof FileField>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const SelectedFile: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('가계부 파일', { selector: 'input' }) as HTMLInputElement;
    const file = new File(
      ['date,description,amount\n2026-09-17,예시 식사,12000\n'],
      'example-budget.csv',
      { type: 'text/csv' },
    );
    await userEvent.upload(input, file);
    await expect(input.files?.[0]?.name).toBe('example-budget.csv');
    await expect(canvas.getByText('example-budget.csv')).toBeVisible();
    await expect(args.onChange).toHaveBeenCalledOnce();
  },
};
export const MultipleFiles: Story = {
  args: { multiple: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('가계부 파일', { selector: 'input' }) as HTMLInputElement;
    await userEvent.upload(input, [
      new File(['date,amount\n2026-08-01,1000'], 'august-example.csv', { type: 'text/csv' }),
      new File(['date,amount\n2026-09-01,2000'], 'september-example.csv', { type: 'text/csv' }),
    ]);
    await expect(input.files).toHaveLength(2);
    await expect(canvas.getByText('august-example.csv, september-example.csv')).toBeVisible();
  },
};
