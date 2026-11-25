// The ✕ of a panel, of Beside and of a notice: an icon button named by what it closes or dismisses.
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../stock/button.tsx";

export function CloseButton(props: {
  /** The accessible name ("Close side panel", "Dismiss"). */
  label: string;
  onClick(): void;
}): ReactNode {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={props.label}
      onClick={props.onClick}
    >
      <XIcon
        aria-hidden="true"
        className="text-fg-muted group-hover/button:text-fg"
      />
    </Button>
  );
}
