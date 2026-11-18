// The keys that work everywhere on the page, registered once on the document.
import { COMMANDS } from "@manent/commands";
import type { CommandService } from "@manent/commands";
import { normalizeHotkey, useHotkeys } from "@tanstack/react-hotkeys";
import { useMemo } from "react";
import { useSubscribable } from "../subscribable/use-subscribable.ts";
import { useCommands } from "./commands-context.tsx";

const GLOBAL_IDS: ReadonlySet<string> = new Set(
  COMMANDS.filter((c) => c.scope === "global").map((c) => c.id),
);

// the key is ours unless the command passed it on to the field, the page or the dialog; the library
// matches nothing while an input method is composing, so a composing press never gets here
function runFromKey(
  service: CommandService,
  id: string,
  event: KeyboardEvent,
): void {
  if (service.run(id, "key") !== "passed") event.preventDefault();
}

/** Registers every effective chord of a global command on the document; a press while an input method composes runs nothing. */
export function GlobalKeys(): null {
  const { service, resolved, platform } = useCommands();
  const { effective } = useSubscribable(resolved);
  const hotkeys = useMemo(
    () =>
      [...effective]
        .filter(([id]) => GLOBAL_IDS.has(id))
        .flatMap(([id, keys]) =>
          keys.map((chord) => ({
            hotkey: normalizeHotkey(chord, platform),
            callback: (event: KeyboardEvent) => runFromKey(service, id, event),
          })),
        ),
    [effective, service, platform],
  );
  useHotkeys(hotkeys, {
    ignoreInputs: "auto",
    preventDefault: false,
    stopPropagation: false,
    platform,
  });
  return null;
}
