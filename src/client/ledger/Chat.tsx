import { useId, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import {
  Copy,
  MoreHorizontal,
  Pencil,
  Reply,
  SendHorizontal,
  SmilePlus,
  Trash2,
  X,
} from 'lucide-react';
import { UGA_REACTIONS, UgaReaction } from '../brand/Uga';
import { Button, Empty, IconButton, Input, Menu, type MenuItem } from '../ui';
import type { ChatMessage, Id, Member } from '../../shared/ledger';
import type { Profile } from '../../shared/people';
import { dayLabel, localDate } from './format';
import { ProfilePicture } from './People';
import { RecordReactions, StickerPicker } from './Reactions';

const labelOf = (id: string) => UGA_REACTIONS.find((item) => item.id === id)?.label;
const dayOf = (createdAt: string) => localDate(new Date(createdAt));
const timeOf = (createdAt: string) => {
  const at = new Date(createdAt);
  const hour = at.getHours();
  return `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}:${String(at.getMinutes()).padStart(2, '0')}`;
};
/** A message in a few words: its text, or which sticker it is. */
const summaryOf = (message: ChatMessage) =>
  message.text ?? `${labelOf(message.sticker ?? '') ?? ''} 스티커`;
/** How long a finger rests on a message before its menu opens. */
const LONG_PRESS = 500;
/** One person's messages in a row read as one: picture and name once. */
const sameAuthor = (a?: ChatMessage, b?: ChatMessage) =>
  Boolean(a && b && a.authorId === b.authorId);
/** Within that, each minute gets its time once, after its last message. */
const sameMinute = (a?: ChatMessage, b?: ChatMessage) =>
  sameAuthor(a, b) && a!.createdAt.slice(0, 16) === b!.createdAt.slice(0, 16);

/**
 * A ledger's 대화, like a messenger: messages oldest first and grouped by day; others on the left
 * with their picture and name, then the bubble with its time beside it; mine on the right. Under a
 * message, Slack-like sticker reactions. Under the pointer the name (or bubble) shows options:
 * 반응 추가, 답장 and ⋯ (복사, and on one's own 수정 and 삭제); a long press or right click opens
 * the same menu. Then a box to write and a button for Uga stickers and decorations.
 */
export function ChatThread({
  messages,
  memberId,
  members = [],
  onSend,
  onEdit,
  onDelete,
  people = [],
  onToggleReaction,
  memo = false,
}: {
  messages: ChatMessage[];
  memberId: Id;
  /** Names for authors; unknown ids show as "알 수 없음". */
  members?: Member[];
  /** Pictures for authors; anyone missing gets the default Uga. */
  people?: Pick<Profile, 'id' | 'avatar' | 'photo'>[];
  /** Adds or takes back the person's sticker on a message. */
  onToggleReaction?(message: ChatMessage, reaction: string): void;
  /** `replyTo`: the message this one answers. */
  onSend(message: ({ text: string } | { sticker: string }) & { replyTo?: Id }): void;
  /** Changes the text of a message the person wrote. */
  onEdit?(message: ChatMessage, text: string): void;
  /** Deletes a message the person wrote; the app asks first. */
  onDelete?(message: ChatMessage): void;
  /** A ledger used alone: the thread is the person's own 메모. */
  memo?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [replying, setReplying] = useState<ChatMessage>();
  const [editing, setEditing] = useState<ChatMessage>();
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  /** A touch hold under way, and whether it has opened the menu already. */
  const press = useRef<{ timer?: number; held: boolean }>({ held: false });
  const nameOf = (authorId: Id) =>
    members.find((member) => member.id === authorId)?.name ?? '알 수 없음';
  const pictureOf = (authorId: Id) =>
    people.find((person) => person.id === authorId) ?? { avatar: 'happy' as const };
  const write = () => requestAnimationFrame(() => input.current?.focus());
  const reply = (message: ChatMessage) => {
    if (editing) setText('');
    setEditing(undefined);
    setReplying(message);
    write();
  };
  const send = () => {
    if (!text.trim()) return;
    if (editing) onEdit?.(editing, text.trim());
    else onSend({ text: text.trim(), ...(replying ? { replyTo: replying.id } : {}) });
    setText('');
    setReplying(undefined);
    setEditing(undefined);
  };
  /** Opens a message's menu from its ⋯. */
  const openMenu = (from: Element) =>
    from.closest('li')?.querySelector<HTMLButtonElement>('.ledger-chat-more')?.click();
  const holdFor = (event: PointerEvent<HTMLElement>) => {
    press.current.held = false;
    if (event.pointerType === 'mouse') return;
    const target = event.currentTarget;
    press.current.timer = window.setTimeout(() => {
      press.current.held = true;
      openMenu(target);
    }, LONG_PRESS);
  };
  const letGo = () => window.clearTimeout(press.current.timer);
  // A right click, or the context menu a phone fires on its own long press: one menu per gesture.
  const contextMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    letGo();
    if (!press.current.held) openMenu(event.currentTarget);
    press.current.held = false;
  };
  const itemsFor = (message: ChatMessage, mine: boolean): MenuItem[] => [
    ...(onToggleReaction
      ? [
          {
            label: '반응 추가',
            icon: <SmilePlus size={18} />,
            // The picker opens from the message's own 반응 추가, once the menu has closed.
            onSelect: () =>
              requestAnimationFrame(() =>
                document
                  .getElementById(`${id}-${message.id}`)
                  ?.querySelector<HTMLButtonElement>('.ledger-chat-react')
                  ?.click(),
              ),
          },
        ]
      : []),
    { label: '답장', icon: <Reply size={18} />, onSelect: () => reply(message) },
    ...(message.text
      ? [
          {
            label: '복사',
            icon: <Copy size={18} />,
            onSelect: () => {
              void navigator.clipboard?.writeText(message.text!);
              setNotice('복사했어요');
              window.setTimeout(() => setNotice(''), 2000);
            },
          },
        ]
      : []),
    ...(mine && message.text && onEdit
      ? [
          {
            label: '수정',
            icon: <Pencil size={18} />,
            onSelect: () => {
              setReplying(undefined);
              setEditing(message);
              setText(message.text!);
              write();
            },
          },
        ]
      : []),
    ...(mine && onDelete
      ? [
          {
            label: '삭제',
            icon: <Trash2 size={18} />,
            tone: 'danger' as const,
            onSelect: () => onDelete(message),
          },
        ]
      : []),
  ];
  const days = [...new Set(messages.map((message) => dayOf(message.createdAt)))];
  const context = editing ?? replying;
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
                  .map((message, index, list) => {
                    const mine = message.authorId === memberId;
                    const quoted =
                      message.replyTo && messages.find((item) => item.id === message.replyTo);
                    // Like KakaoTalk: picture and name start one person's run; a new minute in
                    // it starts with a pointed bubble and the minute's time follows its last one.
                    const start = !sameAuthor(list[index - 1], message);
                    const head = !mine && start;
                    const tail = !sameMinute(list[index - 1], message);
                    const time = !sameMinute(message, list[index + 1]);
                    const summary = summaryOf(message);
                    const tools = (
                      <span className="ledger-chat-tools">
                        {onToggleReaction && (
                          <StickerPicker
                            label="반응 고르기"
                            chosen={Object.keys(message.reactions ?? {}).filter((sticker) =>
                              message.reactions?.[sticker]?.includes(memberId),
                            )}
                            onPick={(sticker) => onToggleReaction(message, sticker)}
                            trigger={(props) => (
                              <IconButton
                                {...props}
                                className="ledger-chat-react"
                                aria-label={`${summary} 반응 추가`}
                              >
                                <SmilePlus size={16} />
                              </IconButton>
                            )}
                          />
                        )}
                        <IconButton aria-label={`${summary} 답장`} onClick={() => reply(message)}>
                          <Reply size={16} />
                        </IconButton>
                        <Menu
                          label="메시지 메뉴"
                          items={itemsFor(message, mine)}
                          trigger={(props) => (
                            <IconButton
                              {...props}
                              className="ledger-chat-more"
                              aria-label={`${summary} 메시지 메뉴`}
                            >
                              <MoreHorizontal size={16} />
                            </IconButton>
                          )}
                        />
                      </span>
                    );
                    return (
                      <li
                        key={message.id}
                        id={`${id}-${message.id}`}
                        className="ledger-chat-message"
                        data-mine={mine || undefined}
                        data-start={start || undefined}
                        data-tail={tail || undefined}
                      >
                        {!mine && (
                          <span className="ledger-chat-avatar">
                            {head && (
                              <ProfilePicture profile={pictureOf(message.authorId)} size={36} />
                            )}
                          </span>
                        )}
                        <div className="ledger-chat-main">
                          {head && (
                            <div className="ledger-chat-head">
                              <span className="ledger-chat-author">{nameOf(message.authorId)}</span>
                              {tools}
                            </div>
                          )}
                          {message.replyTo && (
                            <Button
                              variant="plain"
                              className="ledger-chat-quote"
                              disabled={!quoted}
                              onClick={() =>
                                document
                                  .getElementById(`${id}-${message.replyTo}`)
                                  ?.scrollIntoView({ block: 'center' })
                              }
                            >
                              <Reply size={14} aria-hidden="true" />
                              <span>
                                {quoted
                                  ? `${nameOf(quoted.authorId)} · ${summaryOf(quoted)}`
                                  : '삭제된 메시지'}
                              </span>
                            </Button>
                          )}
                          <div
                            className="ledger-chat-line"
                            onContextMenu={contextMenu}
                            onPointerDown={holdFor}
                            onPointerUp={letGo}
                            onPointerLeave={letGo}
                            onPointerCancel={letGo}
                          >
                            {message.sticker ? (
                              <UgaReaction
                                id={message.sticker}
                                size={88}
                                alt={labelOf(message.sticker) ?? '스티커'}
                              />
                            ) : (
                              <p className="ledger-chat-bubble">{message.text}</p>
                            )}
                            {(time || message.editedAt) && (
                              <time className="ledger-chat-time" dateTime={message.createdAt}>
                                {message.editedAt && '수정됨 '}
                                {time && timeOf(message.createdAt)}
                              </time>
                            )}
                            {!head && tools}
                          </div>
                          {onToggleReaction &&
                            Object.values(message.reactions ?? {}).some((who) => who.length) && (
                              <RecordReactions
                                reactions={message.reactions}
                                memberId={memberId}
                                members={members}
                                onToggle={(sticker) => onToggleReaction(message, sticker)}
                              />
                            )}
                        </div>
                      </li>
                    );
                  })}
              </ol>
            </section>
          ))
        ) : (
          <Empty>
            {memo
              ? '아직 메모가 없어요. 이 가계부에 남겨 둘 이야기를 적어 보세요.'
              : '아직 대화가 없어요. 먼저 말을 건네 보세요.'}
          </Empty>
        )}
      </div>
      <form
        className="ledger-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        {notice && (
          <p className="ledger-chat-notice" role="status">
            {notice}
          </p>
        )}
        {context && (
          <div className="ledger-chat-context">
            {editing ? (
              <Pencil size={16} aria-hidden="true" />
            ) : (
              <Reply size={16} aria-hidden="true" />
            )}
            <span>
              <strong>{editing ? '메시지 수정' : `${nameOf(context.authorId)}에게 답장`}</strong>{' '}
              {summaryOf(context)}
            </span>
            <IconButton
              aria-label={editing ? '수정 취소' : '답장 취소'}
              onClick={() => {
                if (editing) setText('');
                setEditing(undefined);
                setReplying(undefined);
              }}
            >
              <X size={18} />
            </IconButton>
          </div>
        )}
        {!editing && (
          <StickerPicker
            label="스티커 고르기"
            onPick={(sticker) => {
              onSend({ sticker, ...(replying ? { replyTo: replying.id } : {}) });
              setReplying(undefined);
            }}
            trigger={(props) => (
              <IconButton {...props} aria-label="스티커 보내기">
                <SmilePlus size={20} />
              </IconButton>
            )}
          />
        )}
        <Input
          ref={input}
          aria-label={memo ? '메모' : '메시지'}
          placeholder={memo ? '메모' : '메시지'}
          value={text}
          maxLength={1000}
          onChange={(event) => setText(event.target.value)}
        />
        <Button
          variant="primary"
          type="submit"
          aria-label={editing ? '수정' : '보내기'}
          disabled={!text.trim()}
        >
          <SendHorizontal size={18} />
        </Button>
      </form>
    </div>
  );
}
