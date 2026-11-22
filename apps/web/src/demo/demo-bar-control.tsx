// The demo bar's one pattern for a control: a muted label before a control named by the same word, and a bordered
// button that keeps only its icon on a narrow window.
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@manent/ui";
import type { ReactNode } from "react";

/** Under 640 px the visible label goes, and the control's own name remains. */
export function BarLabelled(props: {
  label: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="text-fg-muted max-sm:hidden">
        {props.label}
      </span>
      {props.children}
    </div>
  );
}

/**
 * Bordered and small, its icon before its word; under 640 px only the icon shows, the word kept as its name and in
 * its tooltip. `pressed` draws it as a toggle that is on.
 */
export function BarButton(props: {
  label: string;
  icon: ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  /** The command the Tour ring marks it as. */
  tour?: string;
  onClick(): void;
}): ReactNode {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-pressed={props.pressed}
            disabled={props.disabled}
            data-tour={props.tour}
            onClick={props.onClick}
            className="aria-pressed:border-line-strong aria-pressed:bg-selected max-sm:w-control-sm max-sm:px-0"
          />
        }
      >
        {props.icon}
        <span className="max-sm:sr-only">{props.label}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{props.label}</TooltipContent>
    </Tooltip>
  );
}
