// The name commands: each acts at the caret of the open document's page, and says why in the message slot when the
// caret is not where it acts.
import { COMMANDS } from "@manent/commands";
import type { CommandHandlers, CommandId } from "@manent/commands";
import { NAMES_WORDS, messageFor } from "@manent/ui";
import {
  askNameKindIn,
  writeListedSpellingIn,
} from "../editor-host/project-names.ts";
import { documentNames } from "../names/project-names.ts";
import type { HandlerDeps } from "./index.ts";

type NameCommandId = Extract<CommandId, `name.${string}`>;

export function namesHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, NameCommandId> {
  const { services } = deps;
  const refuse = (id: NameCommandId, reason: string): void => {
    const label = COMMANDS.find((c) => c.id === id)?.label;
    if (typeof label === "string")
      services.messages.push(
        messageFor({ kind: "command_unavailable", label, reason }),
      );
  };
  return {
    "name.useListed"() {
      const docId = deps.shellState().docId;
      if (docId === null || !writeListedSpellingIn(docId))
        refuse("name.useListed", NAMES_WORDS.reasons.useListed);
    },
    "name.addToProject"() {
      const docId = deps.shellState().docId;
      const asked =
        docId !== null &&
        askNameKindIn(docId, (word, kind) => {
          documentNames(services, docId)
            .add(word, kind)
            .then(
              (added) => {
                // false: the project of the document is not known yet, so nothing was added
                if (added)
                  services.messages.push({
                    id: "name_added",
                    text: NAMES_WORDS.added(word, kind),
                    actions: [],
                    lifetime: "brief",
                    ownWork: false,
                  });
              },
              // the person's sync could not start, so the index never opened: nothing was added
              () => {},
            );
        });
      if (!asked) refuse("name.addToProject", NAMES_WORDS.reasons.addToProject);
    },
  };
}
