// The page's command keys, which only the editor hears: loaded with it, apart from the entry.
import type { CommandService } from "@manent/commands";
import { EDITOR_WORDS, messageFor } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";
import { isPageCommand } from "./editor.ts";

/** The `run` of the page's command keymap: true when the key was used (the keymap then prevents the browser's default). */
export function createEditorKeyRun(deps: {
  commands: Pick<CommandService, "run">;
  messages: MessageQueue;
  labelOf: (id: string) => string;
}): (id: string) => boolean {
  const { commands, messages } = deps;
  return (id) => {
    const result = commands.run(id, "key");
    // a disabled command has already said why
    if (result === "ran" || result === "disabled") return true;
    // a page command is absent only for someone who cannot edit, and its key still belongs to the page
    if (result === "passed" || !isPageCommand(id)) return false;
    messages.push(
      messageFor({
        kind: "command_unavailable",
        label: deps.labelOf(id),
        reason: EDITOR_WORDS.reasons.readOnly,
      }),
    );
    return true;
  };
}
