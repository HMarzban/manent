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
import { useId } from "react";
import type { ReactNode } from "react";

/**
 * Its icon, then its label. Its tooltip, also its accessible description, says what its label does not: while
 * `unavailable` holds a reason, "{label} — {reason}", when it is disabled and still focusable (`aria-disabled`);
 * otherwise its `hint`, and without one it has no tooltip. While `busy` holds the work's progressive label it reads
 * that beside a spinner and cannot be pressed. With `opens`, it is the trigger of the popover around it.
 */
export function BarButton(props: {
  label: string;
  icon: LucideIcon;
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
  const reason =
    unavailable === undefined
      ? null
      : READOUT_WORDS.unavailable(label, unavailable);
  const description = reason ?? props.hint ?? null;
  const acts = reason === null && busy === undefined;
  const Icon = busy === undefined ? props.icon : LoaderCircleIcon;
  const button = (
    <Button
      variant="outline"
      size="sm"
      data-tour={props.tour}
      disabled={props.disabled}
      aria-disabled={acts ? undefined : true}
      aria-busy={busy === undefined ? undefined : true}
      aria-describedby={description === null ? undefined : describedId}
      onClick={acts ? props.onClick : undefined}
    />
  );
  // the description sits beside the button, not in it, so that it describes the button without joining its name
  return (
    <>
      <Tooltip disabled={description === null}>
        <TooltipTrigger
          render={opens && acts ? <PopoverTrigger render={button} /> : button}
        >
          <Icon
            aria-hidden="true"
            className={
              busy === undefined ? "size-icon" : "size-icon animate-spin"
            }
          />
          {busy ?? label}
        </TooltipTrigger>
        {/* gone at once when focus or the pointer moves on, so the next control's tooltip is never drawn over it */}
        <TooltipContent className="data-closed:hidden">
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
