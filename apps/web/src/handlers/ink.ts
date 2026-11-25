// Command handlers for the Ink player Beside: Play, Play from here, Back, and Restart.
import type { CommandHandlers } from "@manent/commands";
import { INK_WORDS, messageFor } from "@manent/ui";
import { openBeside } from "../beside/open-beside.ts";
import {
  triggerInkBack,
  triggerInkPlay,
  triggerInkPlayFromKnot,
  triggerInkRestart,
} from "../ink/player/controller.ts";
import { caretKnotOf } from "../ink/player/source-nav.ts";
import type { HandlerDeps } from "./index.ts";

type InkCommandId =
  "ink.play" | "ink.playFromHere" | "ink.back" | "ink.restart";

export function inkHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, InkCommandId> {
  return {
    "ink.play"() {
      const { docId } = deps.shellState();
      if (docId === null) return;
      triggerInkPlay(docId);
      openBeside(docId, "ink_player", null);
    },
    "ink.playFromHere"() {
      const { docId } = deps.shellState();
      if (docId === null) return;
      void caretKnotOf(docId).then((knot) => {
        if (knot === null) {
          deps.services.messages.push(
            messageFor({
              kind: "command_unavailable",
              label: INK_WORDS.playFromHere,
              reason: INK_WORDS.needsCaretInKnot,
            }),
          );
          return;
        }
        triggerInkPlayFromKnot(docId, knot);
        openBeside(docId, "ink_player", null);
      });
    },
    "ink.back"() {
      const { docId } = deps.shellState();
      if (docId === null) return;
      triggerInkBack(docId);
    },
    "ink.restart"() {
      const { docId } = deps.shellState();
      if (docId === null) return;
      triggerInkRestart(docId);
    },
  };
}
