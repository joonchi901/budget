import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';
import { ChatThread } from '../../client/ledger';
import type { ChatMessage } from '../../shared/ledger';
import { me, members, messages, yedi } from '../fixtures';

const meta = {
  title: '04 Organisms · 유기체/ChatThread',
  component: ChatThread,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '가계부 방의 대화. 메신저처럼 날짜별로 묶고, 다른 멤버 글은 왼쪽에 프로필 사진과 이름, 그 아래 말풍선, 말풍선 옆에 시간이 보입니다. 카카오톡처럼 같은 사람이 이어 쓰면 사진·이름은 처음 한 번만 붙고, 그 사이 분이 바뀌면 분마다 마지막 말풍선 옆에 시간을 붙이고 다음 분의 첫 말풍선은 꼬리 모양 모서리로 시작합니다. 내 글은 오른쪽에 사진·이름 없이 보입니다. 말풍선 아래에는 Slack처럼 우가 스티커 반응이 붙고, 누르면 내 반응을 넣고 뺍니다. 마우스를 올리면 이름 옆(이어 쓴 글은 말풍선 옆)에 반응 추가·답장·⋯가 나타나고, 휴대폰은 길게 누르면 같은 메뉴(반응 추가·답장·복사, 내 글이면 수정·삭제)가 열립니다. 글 또는 우가 스티커·장식 하나를 보내고, 웃는 얼굴 버튼은 반응과 같은 고르기(대화·감정 스티커와 장식)를 엽니다. 답장은 원래 글을 인용하고(지워지면 \"삭제된 메시지\"), 수정한 글에는 \"수정됨\"이 붙고, 삭제는 앱이 한 번 묻습니다. 대화 탭을 보는 동안 앱이 몇 초마다 새 글을 확인합니다.',
      },
    },
  },
  args: { messages, memberId: 'u1', members, people: [me, yedi], onSend: () => {} },
  render: function Controlled(args) {
    const [list, setList] = useState<ChatMessage[]>(args.messages);
    const [log, setLog] = useState('');
    return (
      <div style={{ maxWidth: 390 }}>
        <p role="status" className="sr-only">
          {log}
        </p>
        <ChatThread
          {...args}
          messages={list}
          onToggleReaction={(message, reaction) => {
            setList((all) =>
              all.map((item) => {
                if (item.id !== message.id) return item;
                const who = item.reactions?.[reaction] ?? [];
                const next = who.includes(args.memberId)
                  ? who.filter((id) => id !== args.memberId)
                  : [...who, args.memberId];
                return { ...item, reactions: { ...item.reactions, [reaction]: next } };
              }),
            );
            setLog(`반응: ${reaction}`);
          }}
          onEdit={(message, text) => {
            setList((all) =>
              all.map((item) =>
                item.id === message.id ? { ...item, text, editedAt: '2026-11-01T23:41:00Z' } : item,
              ),
            );
            setLog(`수정: ${text}`);
          }}
          onDelete={(message) => {
            setList((all) => all.filter((item) => item.id !== message.id));
            setLog(`삭제: ${message.text ?? message.sticker}`);
          }}
          onSend={(content) =>
            setList((all) => [
              ...all,
              {
                id: `new-${all.length}`,
                ledgerId: 'nov',
                authorId: args.memberId,
                createdAt: '2026-11-01T23:40:00.000Z',
                ...content,
              },
            ])
          }
        />
      </div>
    );
  },
} satisfies Meta<typeof ChatThread>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Conversation: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await expect(c.getByText('11월 고정지출 다 넣었어')).toBeVisible();
    await expect(c.getByRole('img', { name: '고마워요' })).toBeVisible();
    await expect(c.getByRole('button', { name: '보내기' })).toBeDisabled();
    await userEvent.type(c.getByRole('textbox', { name: '메시지' }), '영수증 고마워{Enter}');
    await expect(c.getByText('영수증 고마워')).toBeVisible();
    await expect(c.getByRole('textbox', { name: '메시지' })).toHaveValue('');
    await userEvent.click(c.getByRole('button', { name: '스티커 보내기' }));
    await userEvent.click(
      within(page.getByRole('dialog', { name: '스티커 고르기' })).getByRole('button', {
        name: '좋아요',
      }),
    );
    await expect(c.getByRole('img', { name: '좋아요' })).toBeVisible();
  },
};
export const FirstMessage: Story = { args: { messages: [] } };
export const Memo: Story = {
  args: { messages: [], memo: true },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByText(/아직 메모가 없어요/)).toBeVisible();
    await expect(c.getByRole('textbox', { name: '메모' })).toBeVisible();
  },
};
export const MessageMenu: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByRole('textbox', { name: '메시지' }), '관리비 넣었어{Enter}');
    // A right click on a message offers what a messenger does; mine can be changed and deleted.
    const mine = c.getByText('관리비 넣었어').closest('.ledger-chat-line')!;
    fireEvent.contextMenu(mine);
    const menu = within(await c.findByRole('menu', { name: '메시지 메뉴' }));
    await expect(menu.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      '반응 추가',
      '답장',
      '복사',
      '수정',
      '삭제',
    ]);
    await userEvent.click(menu.getByRole('menuitem', { name: '수정' }));
    const box = c.getByRole('textbox', { name: '메시지' });
    await expect(box).toHaveValue('관리비 넣었어');
    await userEvent.clear(box);
    await userEvent.type(box, '관리비 다 넣었어');
    await userEvent.click(c.getByRole('button', { name: '수정' }));
    await expect(c.getByRole('status')).toHaveTextContent('수정: 관리비 다 넣었어');
    await expect(c.getByText(/수정됨/)).toBeVisible();
    // Someone else's message: 답장 quotes it; there is no 수정 or 삭제.
    fireEvent.contextMenu(c.getByText('11월 고정지출 다 넣었어').closest('.ledger-chat-line')!);
    const theirs = within(await c.findByRole('menu', { name: '메시지 메뉴' }));
    await expect(theirs.queryByRole('menuitem', { name: '삭제' })).toBeNull();
    await userEvent.click(theirs.getByRole('menuitem', { name: '답장' }));
    await expect(c.getByText(/에게 답장/)).toBeVisible();
    await userEvent.type(c.getByRole('textbox', { name: '메시지' }), '확인!{Enter}');
    await expect(c.getByRole('button', { name: /· 11월 고정지출 다 넣었어$/ })).toBeVisible();
    // A touch held on a message opens the same menu; 삭제 hands it to the app, which asks first.
    c.getByText('관리비 다 넣었어')
      .closest('.ledger-chat-line')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    await waitFor(() => expect(c.getByRole('menu', { name: '메시지 메뉴' })).toBeVisible());
    await userEvent.click(c.getByRole('menuitem', { name: '삭제' }));
    await expect(c.getByRole('status')).toHaveTextContent('삭제: 관리비 다 넣었어');
  },
};
export const Decorations: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    // Decorations sit beside the stickers.
    await userEvent.click(c.getByRole('button', { name: '스티커 보내기' }));
    const picker = within(page.getByRole('dialog', { name: '스티커 고르기' }));
    await expect(picker.getByRole('group', { name: '장식' })).toBeVisible();
    await userEvent.click(picker.getByRole('button', { name: '도토리' }));
    await expect(c.getByRole('img', { name: '도토리' })).toBeVisible();
  },
};
export const Messenger: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    // Like KakaoTalk: a run of one person's messages starts with their name (and picture) once,
    // and each minute in it shows its time once, after its last message.
    await expect(c.getAllByText('예디')).toHaveLength(3);
    await expect(c.queryByText('준상')).toBeNull();
    const line = (text: string) => c.getByText(text).closest('li')!;
    await expect(line('코스트코 영수증은 내일 올릴게').querySelector('time')).toBeNull();
    await expect(line('주말에 같이 정리하자').querySelector('time')).toBeVisible();
    await expect(line('영수증 사진도 같이 올릴게').querySelector('time')).toBeVisible();
    await expect(line('영수증 사진도 같이 올릴게')).toHaveAttribute('data-tail');
    await expect(line('주말에 같이 정리하자')).not.toHaveAttribute('data-tail');
    // Reactions under a message: pressing mine takes it back; 반응 추가 beside the name adds one.
    await userEvent.click(c.getByRole('button', { name: '고마워요 1명' }));
    await expect(c.getByRole('status')).toHaveTextContent('반응: thanks');
    await expect(c.queryByRole('button', { name: '고마워요 1명' })).toBeNull();
    await userEvent.click(c.getByRole('button', { name: '11월 고정지출 다 넣었어 반응 추가' }));
    await userEvent.click(
      within(page.getByRole('dialog', { name: '반응 고르기' })).getByRole('button', {
        name: '좋아요',
      }),
    );
    await expect(c.getByRole('button', { name: '좋아요 1명' })).toBeVisible();
  },
};
