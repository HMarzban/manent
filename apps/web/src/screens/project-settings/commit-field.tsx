// A field that hands over what was typed once it is left or Enter is pressed; Escape puts the value back.
import { Input } from "@manent/ui";
import { useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export function CommitField(props: {
  value: string;
  /** The field's accessible name. */
  label: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  /** Called only with text that differs from `value`, once per edit. */
  onCommit(typed: string): void;
  /** Called once the field is left, or Enter or Escape is pressed, after any commit. */
  onEnd?(): void;
}): ReactNode {
  const {
    value,
    label,
    disabled,
    autoFocus,
    className = "w-48",
    onCommit,
    onEnd,
  } = props;
  // null while the field shows `value`; a ref as well, so the blur of a field that Enter just closed commits nothing
  const [typed, setTyped] = useState<string | null>(null);
  const pending = useRef<string | null>(null);
  const type = (text: string | null): void => {
    pending.current = text;
    setTyped(text);
  };
  const end = (commit: boolean): void => {
    const text = pending.current;
    type(null);
    if (commit && text !== null && text !== value) onCommit(text);
    onEnd?.();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") end(true);
    if (event.key === "Escape") {
      // the field's own Escape: it never closes the screen
      event.stopPropagation();
      end(false);
    }
  };
  return (
    <Input
      className={className}
      value={typed ?? value}
      aria-label={label}
      disabled={disabled}
      autoFocus={autoFocus}
      onChange={(event) => type(event.target.value)}
      onBlur={() => end(true)}
      onKeyDown={onKeyDown}
    />
  );
}
