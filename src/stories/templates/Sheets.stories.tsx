import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { BottomSheet, FullScreenSheet } from '../../client/templates';
import { Button, Surface, TextField } from '../../client/ui';

const meta = {
  title: '05 Templates · 템플릿/Sheets',
  component: FullScreenSheet,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Dialog 위의 두 가지 틀. FullScreenSheet는 입력·설정용으로 휴대폰에서 전체 화면, 저장 버튼은 하단에 고정합니다. BottomSheet는 날짜별 내역처럼 짧은 내용을 아래에서 올립니다. 넓은 화면에서는 둘 다 가운데 대화상자입니다. 닫기·Escape·바깥 어두운 곳 누르기·미저장 확인은 Dialog 규칙을 따릅니다(바깥을 눌러도 닫기와 같이, 입력 중이면 먼저 묻습니다).',
      },
    },
  },
  args: { title: '', onClose: () => {}, footer: null, children: null },
} satisfies Meta<typeof FullScreenSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FullScreen: Story = {
  render: function Open() {
    const [open, setOpen] = useState(true);
    const [name, setName] = useState('');
    return (
      <>
        <Button onClick={() => setOpen(true)}>열기</Button>
        {open && (
          <FullScreenSheet
            title="내역 추가"
            subtitle="11월"
            dirty={name !== ''}
            onClose={() => setOpen(false)}
            footer={
              <>
                <Button onClick={() => setOpen(false)}>저장하고 계속</Button>
                <Button variant="primary" onClick={() => setOpen(false)}>
                  저장
                </Button>
              </>
            }
          >
            <TextField
              label="입력 영역"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {Array.from({ length: 6 }, (_, index) => (
              <Surface key={index} padding={4} tone="subtle" style={{ minHeight: 80 }}>
                <span className="small muted">입력 영역 {index + 2}</span>
              </Surface>
            ))}
          </FullScreenSheet>
        )}
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(page.getByRole('textbox', { name: '입력 영역' }), '작성 중');
    await userEvent.click(page.getByRole('button', { name: '닫기' }));
    await expect(page.getByRole('dialog', { name: '입력 내용을 버릴까요?' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: '계속 작성' }));
    await expect(page.getByRole('textbox', { name: '입력 영역' })).toHaveValue('작성 중');
  },
};
export const Bottom: Story = {
  render: function Open() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <Button onClick={() => setOpen(true)}>열기</Button>
        {open && (
          <BottomSheet title="10월 29일 (목)" onClose={() => setOpen(false)}>
            <Surface padding={4} tone="subtle">
              <span className="small muted">짧은 내용</span>
            </Surface>
          </BottomSheet>
        )}
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    // Escape reaches <dialog> as a native cancel event, which synthetic key presses do not fire.
    await userEvent.click(page.getByRole('button', { name: '닫기' }));
    await expect(page.queryByRole('dialog')).toBeNull();
    // A tap on the dimmed area above closes it too, but a press that only ends there does not.
    await userEvent.click(page.getByRole('button', { name: '열기' }));
    const sheet = page.getByRole('dialog', { name: '10월 29일 (목)' });
    const inside = sheet.getBoundingClientRect();
    await userEvent.pointer([
      {
        keys: '[MouseLeft>]',
        target: sheet,
        coords: { clientX: inside.left + 8, clientY: inside.top + 8 },
      },
      { keys: '[/MouseLeft]', target: sheet, coords: { clientX: 1, clientY: 1 } },
    ]);
    await expect(sheet).toBeVisible();
    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: sheet,
      coords: { clientX: 1, clientY: 1 },
    });
    await expect(page.queryByRole('dialog')).toBeNull();
  },
};
