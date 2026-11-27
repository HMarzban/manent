// Shared status bar for full-page settings screens: messages and the command palette trigger.
import { MessageSlot } from "@manent/ui";
import type { ReactNode } from "react";
import { isCommandId } from "../screens/preferences/search-index.ts";
import { useServices } from "../services/context.tsx";
import { AppPaletteGem } from "../shell/app-palette-gem.tsx";
import { CommandsButton } from "../shell/commands-button.tsx";
import { ShellRegion } from "../shell/regions.tsx";

export function SettingsStatusBar(): ReactNode {
  const { messages, commands } = useServices();
  return (
    <ShellRegion
      region="status_bar"
      className="flex h-statusbar shrink-0 items-center gap-2 border-t border-line px-2"
    >
      <MessageSlot
        queue={messages}
        run={(id) => {
          if (isCommandId(id)) commands.run(id, "control");
        }}
        registered={isCommandId}
      />
      <CommandsButton />
      <AppPaletteGem className="ms-1 max-sm:hidden" />
    </ShellRegion>
  );
}
