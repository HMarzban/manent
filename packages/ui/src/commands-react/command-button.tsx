// A button that is a command: its words, keys and disabled state come from the registry.
import type { CommandId } from "@manent/commands";
import { useId } from "react";
import type { ReactNode } from "react";
import { Button } from "../components/stock/button.tsx";
import { Kbd } from "../components/stock/kbd.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../components/stock/tooltip.tsx";
import { READOUT_WORDS } from "../words/document.ts";
import { useCommands } from "./commands-context.tsx";
import { keyLabel } from "./key-labels.ts";
import { useCommandState } from "./use-command-state.ts";

const POPUP = "[role='dialog'], [role='alertdialog']";

/** Whether `event` moved focus into a popup from outside it, as a popup does with its first control when it opens. */
function isFocusIntoPopup(event: Event): boolean {
  if (!(event instanceof FocusEvent) || !(event.target instanceof Element))
    return false;
  const popup = event.target.closest(POPUP);
  const from = event.relatedTarget;
  return popup !== null && !(from instanceof Node && popup.contains(from));
}

/**
 * Drawn only while the command is visible. While disabled it stays focusable (`aria-disabled`), and its tooltip,
 * "{Label} — {reason}", is also its accessible description; a press then answers with the reason, as the key does.
 */
export function CommandButton(props: {
  id: CommandId;
  variant?: "ghost" | "outline";
  size?: "sm" | "default";
  children?: never;
}): ReactNode {
  const { id, variant = "ghost", size = "default" } = props;
  const { service, platform } = useCommands();
  const state = useCommandState(id);
  const reasonId = useId();
  if (!state.visible) return null;
  const reason =
    state.whyNot === null
      ? null
      : READOUT_WORDS.unavailable(state.label, state.whyNot);
  const [chord] = state.keys;
  // the reason sits beside the button, not in it, so that it describes the button without joining its name
  return (
    <>
      <Tooltip
        onOpenChange={(open, details) => {
          // a tooltip shown on the focus a popup places would take the popup's next Escape
          if (
            open &&
            details.reason === "trigger-focus" &&
            isFocusIntoPopup(details.event)
          )
            details.cancel();
        }}
      >
        <TooltipTrigger
          render={
            <Button
              variant={variant}
              size={size}
              data-tour={id}
              aria-disabled={reason === null ? undefined : true}
              aria-describedby={reason === null ? undefined : reasonId}
              onClick={() => service.run(id, "control")}
            />
          }
        >
          {state.label}
        </TooltipTrigger>
        <TooltipContent>
          {reason ?? state.label}
          {reason === null && chord !== undefined ? (
            <Kbd>{keyLabel(chord, platform)}</Kbd>
          ) : null}
        </TooltipContent>
      </Tooltip>
      {reason === null ? null : (
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      )}
    </>
  );
}
