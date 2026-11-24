// The name commands: each acts at the caret of the open document's page, and says why in the message slot when the
// caret is not where it acts. What they do on the page loads apart from the entry.
import { COMMANDS } from "@manent/commands";
import type { CommandHandlers, CommandId } from "@manent/commands";
import type { ProjectNameKind } from "@manent/revisions";
import { NAMES_WORDS, messageFor } from "@manent/ui";
import { documentNames } from "../names/project-names.ts";
import type { HandlerDeps } from "./index.ts";

type OnPage = typeof import("../editor-host/project-names.ts");

type NameCommandId = Extract<CommandId, `name.${string}`>;

export function namesHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, NameCommandId> {
  const { services } = deps;
  /** Runs `act` on the open document's page; false from it, or no document, says `reason`. */
  const atCaret = async (
    id: NameCommandId,
    reason: string,
    act: (page: OnPage, docId: string) => boolean,
  ): Promise<void> => {
    const { docId } = deps.shellState();
    if (docId !== null) {
      const page = await import("../editor-host/project-names.ts");
      if (act(page, docId)) return;
    }
    const label = COMMANDS.find((c) => c.id === id)?.label;
    if (typeof label === "string")
      services.messages.push(
        messageFor({ kind: "command_unavailable", label, reason }),
      );
  };
  // tells what came of adding `word`, once it is known
  const add = (docId: string, word: string, kind: ProjectNameKind): void => {
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
  };
  const { reasons } = NAMES_WORDS;
  return {
    "name.useListed": () =>
      void atCaret("name.useListed", reasons.useListed, (page, docId) =>
        page.writeListedSpellingIn(docId),
      ),
    "name.addToProject": () =>
      void atCaret("name.addToProject", reasons.addToProject, (page, docId) =>
        page.askNameKindIn(docId, (word, kind) => add(docId, word, kind)),
      ),
  };
}
