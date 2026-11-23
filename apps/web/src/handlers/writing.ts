import type { CommandHandlers } from "@manent/commands";
import { panelsActions } from "../state/panels.store.ts";
import { writingActions } from "../state/writing.store.ts";
import { writePrivately, writePublicly } from "../writing/choose.ts";
import { handInShown } from "../writing/hand-in.ts";
import type { HandlerDeps } from "./index.ts";

type WritingCommandId =
  | "writing.forEveryone"
  | "writing.asSuggestions"
  | "writing.privately"
  | "writing.stopSuggestions"
  | "writing.handIn"
  | "writing.restoreBeforeHandIn"
  | "writing.seeHandedIn";

// what the messages after a hand-in reach loads apart from the entry, with History's
const loadActions = () => import("../writing/hand-in-actions.ts");

export function writingHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, WritingCommandId> {
  const { services, now } = deps;
  const shown = (): string | null => deps.shellState().docId;
  const write = (position: "everyone" | "suggestions") => (): void => {
    const docId = shown();
    if (docId !== null) writePublicly(services, docId, { position, at: now() });
  };
  return {
    "writing.forEveryone": write("everyone"),
    "writing.asSuggestions": write("suggestions"),
    "writing.stopSuggestions": write("everyone"),
    "writing.privately"() {
      const docId = shown();
      if (docId === null || writingActions.get(docId).position === "private")
        return;
      void writePrivately(services, docId, now);
    },
    "writing.handIn"() {
      const docId = shown();
      if (docId === null) return;
      panelsActions.open("side", "history");
      handInShown.set(docId);
    },
    "writing.restoreBeforeHandIn"() {
      const docId = shown();
      if (docId !== null)
        void loadActions().then((actions) =>
          actions.restoreBeforeHandIn(services, docId),
        );
    },
    "writing.seeHandedIn"() {
      const docId = shown();
      if (docId !== null)
        void loadActions().then((actions) => actions.showHandedIn(docId));
    },
  };
}
