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
import { useId } from "react";
import type { ReactNode } from "react";

/**
 * Its icon, then its label, which a bar short of room hides from sight while it stays the button's name; the tooltip
 * says the label. While `unavailable` holds a reason it is disabled and still focusable (`aria-disabled`), and
 * "{label} — {reason}" is its tooltip and its accessible description. With `opens`, it is the trigger of the popover
 * around it.
 */
export function BarButton(props: {
  label: string;
  icon: LucideIcon;
  tour?: string;
  unavailable?: string | null;
  disabled?: boolean;
  opens?: boolean;
  onClick?: () => void;
}): ReactNode {
  const { label, icon: Icon, unavailable = null, opens = false } = props;
  const reasonId = useId();
  const reason =
    unavailable === null ? null : READOUT_WORDS.unavailable(label, unavailable);
  const button = (
    <Button
      variant="outline"
      size="sm"
      data-tour={props.tour}
      disabled={props.disabled}
      aria-disabled={reason === null ? undefined : true}
      aria-describedby={reason === null ? undefined : reasonId}
      onClick={reason === null ? props.onClick : undefined}
    />
  );
  // the reason sits beside the button, not in it, so that it describes the button without joining its name
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            opens && reason === null ? (
              <PopoverTrigger render={button} />
            ) : (
              button
            )
          }
        >
          <Icon aria-hidden="true" className="size-icon" />
          <span data-slot="button-label">{label}</span>
        </TooltipTrigger>
        <TooltipContent>{reason ?? label}</TooltipContent>
      </Tooltip>
      {reason === null ? null : (
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      )}
    </>
  );
}
