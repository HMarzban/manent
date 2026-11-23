// A demo bar button that is not a command, drawn as a command button with an icon is.
import {
  Button,
  PopoverTrigger,
  READOUT_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@manent/ui";
import type { LucideIcon } from "lucide-react";
import { LoaderCircleIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

/**
 * Whether the bar, short of room, has hidden `label` from sight, leaving its button only its icon. The bar's rules draw
 * a hidden label as a clipped box taken out of the row, so its size changes as they start and stop applying.
 */
function useIconOnly(label: RefObject<HTMLElement | null>): boolean {
  const [iconOnly, setIconOnly] = useState(false);
  useEffect(() => {
    const element = label.current;
    if (element === null) return undefined;
    const observer = new ResizeObserver(() =>
      setIconOnly(getComputedStyle(element).position === "absolute"),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [label]);
  return iconOnly;
}

/**
 * Its icon, then its label. Its tooltip, also its accessible description, says what its label does not: while
 * `unavailable` holds a reason, "{label} — {reason}", when it is disabled and still focusable (`aria-disabled`);
 * otherwise its `hint`, and without one it has no tooltip. While `busy` holds the work's progressive label it reads
 * that beside a spinner and cannot be pressed. With `opens`, it is the trigger of the popover around it. Short of room
 * the bar keeps only its icon, `drops` saying how soon, and its tooltip then names it too.
 */
export function BarButton(props: {
  label: string;
  icon: LucideIcon;
  drops?: "first" | "later";
  tour?: string;
  hint?: string;
  unavailable?: string;
  busy?: string;
  disabled?: boolean;
  opens?: boolean;
  onClick?: () => void;
}): ReactNode {
  const { label, unavailable, busy, opens = false } = props;
  const describedId = useId();
  const labelRef = useRef<HTMLSpanElement>(null);
  const iconOnly = useIconOnly(labelRef);
  const reason =
    unavailable === undefined
      ? null
      : READOUT_WORDS.unavailable(label, unavailable);
  const description = reason ?? props.hint ?? null;
  const acts = reason === null && busy === undefined;
  const shown = busy ?? label;
  const Icon = busy === undefined ? props.icon : LoaderCircleIcon;
  const button = (
    <Button
      variant="outline"
      size="sm"
      data-tour={props.tour}
      data-drops={props.drops}
      disabled={props.disabled}
      aria-disabled={acts ? undefined : true}
      aria-busy={busy === undefined ? undefined : true}
      aria-describedby={description === null ? undefined : describedId}
      onClick={acts ? props.onClick : undefined}
    />
  );
  // a reason already starts with the label
  const named = iconOnly && reason === null;
  // the description sits beside the button, not in it, so that it describes the button without joining its name
  return (
    <>
      <Tooltip disabled={description === null && !named}>
        <TooltipTrigger
          render={opens && acts ? <PopoverTrigger render={button} /> : button}
        >
          <Icon
            aria-hidden="true"
            className={
              busy === undefined ? "size-icon" : "size-icon animate-spin"
            }
          />
          <span ref={labelRef} data-slot="button-label">
            {shown}
          </span>
        </TooltipTrigger>
        {/* gone at once when focus or the pointer moves on, so the next control's tooltip is never drawn over it */}
        <TooltipContent className="flex-col items-start data-closed:hidden">
          {named && <span className="font-medium">{shown}</span>}
          {description}
        </TooltipContent>
      </Tooltip>
      {description === null ? null : (
        <span id={describedId} className="sr-only">
          {description}
        </span>
      )}
    </>
  );
}
