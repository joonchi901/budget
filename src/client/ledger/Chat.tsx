import { useId, useState } from 'react';
import { SendHorizontal, SmilePlus } from 'lucide-react';
import { UGA_REACTIONS, UgaReaction } from '../brand/Uga';
import { Button, Empty, IconButton, Input } from '../ui';
import type { ChatMessage, Id, Member } from '../../shared/ledger';
import { dayLabel, localDate } from './format';
import { StickerPicker } from './Reactions';

const labelOf = (id: string) => UGA_REACTIONS.find((item) => item.id === id)?.label;
const dayOf = (createdAt: string) => localDate(new Date(createdAt));
const timeOf = (createdAt: string) => {
  const at = new Date(createdAt);
  const hour = at.getHours();
  return `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}:${String(at.getMinutes()).padStart(2, '0')}`;
};

/**
 * A ledger's 대화: messages oldest first, mine on the right and others on the left with their
 * name, grouped by day; then a box to write and a button for Uga stickers.
 */
export function ChatThread({
  messages,
  memberId,
  members = [],
  onSend,
}: {
  messages: ChatMessage[];
  memberId: Id;
  /** Names for authors; unknown ids show as "알 수 없음". */
  members?: Member[];
  onSend(message: { text: string } | { sticker: string }): void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const nameOf = (authorId: Id) =>
    members.find((member) => member.id === authorId)?.name ?? '알 수 없음';
  const send = () => {
    if (!text.trim()) return;
    onSend({ text: text.trim() });
    setText('');
  };
  const days = [...new Set(messages.map((message) => dayOf(message.createdAt)))];
  return (
    <div className="ledger-chat">
      <div className="ledger-chat-messages">
        {messages.length ? (
          days.map((day) => (
            <section key={day} aria-labelledby={`${id}-${day}`} className="ledger-chat-day">
              <h2 id={`${id}-${day}`} className="ledger-chat-day-label">
                {dayLabel(day)}
              </h2>
              <ol className="ledger-chat-list" aria-labelledby={`${id}-${day}`}>
                {messages
                  .filter((message) => dayOf(message.createdAt) === day)
                  .map((message) => {
                    const mine = message.authorId === memberId;
                    return (
                      <li
                        key={message.id}
                        className="ledger-chat-message"
                        data-mine={mine || undefined}
                      >
                        {!mine && (
                          <span className="ledger-chat-author">{nameOf(message.authorId)}</span>
                        )}
                        {message.sticker ? (
                          <UgaReaction
                            id={message.sticker}
                            size={88}
                            alt={labelOf(message.sticker) ?? '스티커'}
                          />
                        ) : (
                          <p className="ledger-chat-bubble">{message.text}</p>
                        )}
                        <time className="ledger-chat-time" dateTime={message.createdAt}>
                          {timeOf(message.createdAt)}
                        </time>
                      </li>
                    );
                  })}
              </ol>
            </section>
          ))
        ) : (
          <Empty>아직 대화가 없어요. 먼저 말을 건네 보세요.</Empty>
        )}
      </div>
      <form
        className="ledger-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <StickerPicker
          label="스티커 고르기"
          onPick={(sticker) => onSend({ sticker })}
          trigger={(props) => (
            <IconButton {...props} aria-label="스티커 보내기">
              <SmilePlus size={20} />
            </IconButton>
          )}
        />
        <Input
          aria-label="메시지"
          placeholder="메시지"
          value={text}
          maxLength={1000}
          onChange={(event) => setText(event.target.value)}
        />
        <Button variant="primary" type="submit" aria-label="보내기" disabled={!text.trim()}>
          <SendHorizontal size={18} />
        </Button>
      </form>
    </div>
  );
}
