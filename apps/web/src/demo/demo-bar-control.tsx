// The demo bar's one pattern for a labelled control: a muted label before a control named by the same word.
import type { ReactNode } from "react";

/** Where the bar runs short of room the visible label goes (`.mn-bar`), and the control's own name remains. */
export function BarLabelled(props: {
  label: string;
  tour: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div data-tour={props.tour} className="flex shrink-0 items-center gap-2">
      <span aria-hidden="true" data-slot="bar-label" className="text-fg-muted">
        {props.label}
      </span>
      {props.children}
    </div>
  );
}
