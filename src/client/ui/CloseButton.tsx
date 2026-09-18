import { createContext, useContext } from 'react';
import { Button, type ButtonProps } from './Button';
export const DialogCloseContext = createContext<(() => void) | null>(null);
/** Routes every user-initiated close through its dialog's unsaved-change guard. */
export function CloseButton({ onClick, ...props }: ButtonProps) {
  const close = useContext(DialogCloseContext);
  return (
    <Button
      {...props}
      type="button"
      onClick={(event) => {
        if (close) close();
        else onClick?.(event);
      }}
    />
  );
}
