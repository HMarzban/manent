// A demo bar control that cannot be used now, drawn as a command button is while disabled.
import {
  Button,
  READOUT_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@manent/ui";
import { useId } from "react";
import type { ReactNode } from "react";

/** Still focusable (`aria-disabled`); "{label} — {reason}" is its tooltip and its accessible description. */
export function UnavailableControl(props: {
  label: string;
  reason: string;
  tour: string;
}): ReactNode {
  const reasonId = useId();
  const line = READOUT_WORDS.unavailable(props.label, props.reason);
  // the reason sits beside the button, not in it, so that it describes the button without joining its name
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              data-tour={props.tour}
              aria-disabled
              aria-describedby={reasonId}
            />
          }
        >
          {props.label}
        </TooltipTrigger>
        <TooltipContent>{line}</TooltipContent>
      </Tooltip>
      <span id={reasonId} className="sr-only">
        {line}
      </span>
    </>
  );
}
