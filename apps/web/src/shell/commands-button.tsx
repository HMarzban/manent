// Commands, at the end of every screen's status bar: the palette's button, with its key beside it.
import {
  CommandButton,
  Kbd,
  keyLabel,
  useCommandState,
  useCommands,
} from "@manent/ui";
import type { ReactNode } from "react";

/** The palette's button, with its key shown beside it on a window wide enough. */
export function CommandsButton(): ReactNode {
  const { platform } = useCommands();
  const [chord] = useCommandState("app.palette").keys;
  return (
    <span className="flex shrink-0 items-center gap-1">
      <CommandButton id="app.palette" size="sm" />
      {chord === undefined ? null : (
        <Kbd aria-hidden="true" className="max-sm:hidden">
          {keyLabel(chord, platform)}
        </Kbd>
      )}
    </span>
  );
}
