import type { ComponentProps } from 'react';
import { SmilePlus } from 'lucide-react';
import { UGA_REACTIONS, UgaReaction } from '../brand/Uga';
import { Button, IconButton, Popover, Tooltip } from '../ui';
import type { Id, LedgerRecord, Member, Reactions } from '../../shared/ledger';

/** Who is reacting, and how a reaction is sent; given to record rows that take reactions. */
export type ReactionContext = {
  memberId: Id;
  /** Names for the members who reacted; unknown ids show as "알 수 없음". */
  members?: Member[];
  onToggleReaction(record: LedgerRecord, reaction: string): void;
};

const labelOf = (id: string) => UGA_REACTIONS.find((item) => item.id === id)?.label;
const groups = ['대화', '감정', '장식'] as const;

/**
 * Slack-like reactions under a record: one chip per Uga sticker with how many reacted (mine
 * highlighted, pressing toggles mine), then a button that opens the sticker picker.
 */
export function RecordReactions({
  reactions = {},
  memberId,
  members = [],
  onToggle,
}: {
  reactions?: Reactions;
  memberId: Id;
  members?: Member[];
  onToggle(reaction: string): void;
}) {
  const nameOf = (id: Id) =>
    id === memberId ? '나' : (members.find((member) => member.id === id)?.name ?? '알 수 없음');
  const shown = Object.entries(reactions).filter(([id, who]) => labelOf(id) && who.length > 0);
  return (
    <div className="ledger-reactions">
      {shown.map(([id, who]) => {
        const mine = who.includes(memberId);
        return (
          <Tooltip key={id} content={`${labelOf(id)} · ${who.map(nameOf).join(', ')}`}>
            <Button
              variant="plain"
              className="ledger-reaction"
              aria-pressed={mine}
              aria-label={`${labelOf(id)} ${who.length}명`}
              onClick={() => onToggle(id)}
            >
              <UgaReaction id={id} size={22} />
              <span aria-hidden="true">{who.length}</span>
            </Button>
          </Tooltip>
        );
      })}
      <StickerPicker
        label="반응 고르기"
        chosen={Object.keys(reactions).filter((id) => reactions[id]?.includes(memberId))}
        onPick={onToggle}
        trigger={(props) => (
          <IconButton {...props} aria-label="반응 추가" className="ledger-reaction-add">
            <SmilePlus size={18} />
          </IconButton>
        )}
      />
    </div>
  );
}

/** The Uga sticker grid (대화, then 감정) in a popover; used for reactions and chat stickers. */
export function StickerPicker({
  label,
  chosen = [],
  onPick,
  trigger,
}: {
  label: string;
  /** Stickers shown as already picked. */
  chosen?: string[];
  onPick(sticker: string): void;
  trigger: ComponentProps<typeof Popover>['trigger'];
}) {
  return (
    <Popover label={label} matchTriggerWidth={false} preferredWidth={312} trigger={trigger}>
      {({ close }) => (
        <div className="ledger-reaction-picker">
          {groups.map((group) => (
            <div key={group} role="group" aria-label={group}>
              <p className="ledger-reaction-group">{group}</p>
              <div className="ledger-reaction-grid">
                {UGA_REACTIONS.filter((item) => item.group === group).map((item) => (
                  <Button
                    key={item.id}
                    variant="plain"
                    aria-label={item.label}
                    aria-pressed={chosen.includes(item.id)}
                    onClick={() => {
                      onPick(item.id);
                      close();
                    }}
                  >
                    <UgaReaction id={item.id} size={44} />
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Popover>
  );
}
