// The status bar's way to the palette: Commands, with the palette's key beside it on a window wide enough.
import {
  CommandButton,
  Kbd,
  keyLabel,
  useCommandState,
  useCommands,
} from "@manent/ui";
import type { ReactNode } from "react";

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
