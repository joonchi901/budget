import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { RecordReactions } from '../../client/ledger';
import type { Reactions } from '../../shared/ledger';
import { members } from '../fixtures';

const meta = {
  title: '04 Organisms · 유기체/RecordReactions',
  component: RecordReactions,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Slack처럼 내역 아래에 다는 우가 스티커 반응. 스티커마다 누른 사람 수를 칩으로 보이고, 내가 누른 반응은 강조되며 다시 누르면 취소됩니다. 칩에 올리거나 길게 누르면 누가 눌렀는지 보입니다. 웃는 얼굴 버튼은 대화 12종·감정 18종 스티커와 장식 23종 고르기를 엽니다. 가계부 멤버라면 보기 권한이어도 반응할 수 있습니다. 반응이 많아지면 칩이 여러 줄로 넘어가고 내역 줄도 그만큼 길어집니다.',
      },
    },
  },
  args: {
    reactions: { 'cracking-up': ['u2'], thanks: ['u2', 'u1'] },
    memberId: 'u1',
    members,
    onToggle: () => {},
  },
  render: function Controlled(args) {
    const [reactions, setReactions] = useState<Reactions>(args.reactions ?? {});
    const toggle = (reaction: string) =>
      setReactions((all) => {
        const who = (all[reaction] ?? []).filter((id) => id !== args.memberId);
        const next = {
          ...all,
          [reaction]: all[reaction]?.includes(args.memberId) ? who : [...who, args.memberId],
        };
        if (!next[reaction].length) delete next[reaction];
        return next;
      });
    return (
      <div style={{ maxWidth: 390 }}>
        <RecordReactions {...args} reactions={reactions} onToggle={toggle} />
      </div>
    );
  },
} satisfies Meta<typeof RecordReactions>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Reacted: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const thanks = c.getByRole('button', { name: '고마워요 2명' });
    await expect(thanks).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(thanks);
    await expect(c.getByRole('button', { name: '고마워요 1명' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await userEvent.click(c.getByRole('button', { name: '반응 추가' }));
    const picker = within(page.getByRole('dialog', { name: '반응 고르기' }));
    await userEvent.click(picker.getByRole('button', { name: '좋아요' }));
    await expect(c.getByRole('button', { name: '좋아요 1명' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};
export const NoReactions: Story = { args: { reactions: {} } };
export const Many: Story = {
  args: {
    reactions: Object.fromEntries(
      [
        'agree',
        'aha',
        'all-done',
        'thanks',
        'cracking-up',
        'encourage',
        'nodding',
        'party-popper',
        'proud',
        'relieved',
        'see-you',
        'empathy',
      ].map((id, index) => [id, index % 3 ? ['u2'] : ['u2', 'u1']]),
    ),
  },
  play: async ({ canvasElement }) => {
    // Like Slack's, the chips wrap onto more lines and the add button follows the last one.
    const chips = [...canvasElement.querySelectorAll('.ledger-reaction')];
    const add = canvasElement.querySelector('.ledger-reaction-add')!;
    await expect(chips.at(-1)!.getBoundingClientRect().top).toBeGreaterThan(
      chips[0].getBoundingClientRect().top,
    );
    await expect(add.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      chips.at(-1)!.getBoundingClientRect().top,
    );
  },
};
