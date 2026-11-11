import type { KeyboardEvent, ReactNode } from 'react';
import { Button } from './Button';
import { Popover } from './Popover';

export type MenuItem = {
  label: string;
  icon?: ReactNode;
  onSelect(): void;
  tone?: 'danger';
  disabled?: boolean;
};
type TriggerProps = Parameters<Parameters<typeof Popover>[0]['trigger']>[0];

/**
 * Dropdown menu of actions, such as a room's ⋯ menu. The trigger receives the popover props
 * (spread them onto an IconButton). Arrow keys, Home and End move; Escape and Tab close.
 */
export function Menu({
  label,
  items,
  trigger,
}: {
  label: string;
  items: MenuItem[];
  trigger(props: TriggerProps): ReactNode;
}) {
  function move(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ),
    ];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = {
      ArrowDown: index + 1,
      ArrowUp: index < 0 ? buttons.length - 1 : index - 1,
      Home: 0,
      End: buttons.length - 1,
    }[event.key];
    if (next === undefined || !buttons.length) return;
    event.preventDefault();
    buttons[(next + buttons.length) % buttons.length].focus();
  }
  return (
    <Popover
      label={label}
      role="menu"
      matchTriggerWidth={false}
      preferredWidth={220}
      trigger={trigger}
    >
      {({ close }) => (
        <div role="none" className="ui-menu" onKeyDown={move}>
          {items.map((item) => (
            <Button
              key={item.label}
              variant="plain"
              role="menuitem"
              className="ui-menu-item"
              data-tone={item.tone}
              disabled={item.disabled}
              onClick={() => {
                close();
                item.onSelect();
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </Button>
          ))}
        </div>
      )}
    </Popover>
  );
}
