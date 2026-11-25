// The pitch field popover anchored to the state bar: Enter pitches one alternate line, Escape or click outside closes.
import { Input, ROOM_WORDS } from "@manent/ui";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export interface PitchPopoverProps {
  place: { left: number; top: number };
  onSubmit(text: string): void;
  onClose(): void;
}

const EDGE_PX = 8;

export function PitchPopover(props: PitchPopoverProps): ReactNode {
  const { place, onSubmit, onClose } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const finishedRef = useRef(false);

  const finish = (action: () => void): void => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    action();
  };

  useLayoutEffect(() => {
    const element = rootRef.current;
    if (element === null) return;
    const width = element.offsetWidth || element.getBoundingClientRect().width;
    const height =
      element.offsetHeight || element.getBoundingClientRect().height;
    const maxLeft = Math.max(EDGE_PX, window.innerWidth - width - EDGE_PX);
    const maxTop = Math.max(EDGE_PX, window.innerHeight - height - EDGE_PX);
    const left = Math.min(Math.max(place.left, EDGE_PX), maxLeft);
    const top = Math.min(Math.max(place.top, EDGE_PX), maxTop);
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  });

  useEffect(() => {
    fieldRef.current?.focus();
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const element = rootRef.current;
      if (event.target instanceof Node && element?.contains(event.target))
        return;
      finish(onClose);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [onClose]);

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    finish(onClose);
  };

  const onFieldKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    const value = fieldRef.current?.value ?? "";
    if (value.trim().length === 0) return;
    finish(() => onSubmit(value));
  };

  return (
    <div
      ref={rootRef}
      role="dialog"
      data-open=""
      data-tour="pitch_field"
      aria-label={ROOM_WORDS.pitchFieldLabel}
      onKeyDown={onDialogKeyDown}
      className="fixed z-50 flex w-popover animate-in flex-col overflow-hidden rounded-lg bg-overlay px-4 py-3 text-ui text-fg shadow-overlay ring-1 ring-line duration-(--dur-fast) ease-out fade-in-0 zoom-in-95"
      style={{ left: place.left, top: place.top }}
    >
      <Input
        ref={fieldRef}
        aria-label={ROOM_WORDS.pitchFieldLabel}
        placeholder={ROOM_WORDS.pitchFieldPlaceholder}
        onKeyDown={onFieldKeyDown}
      />
    </div>
  );
}
