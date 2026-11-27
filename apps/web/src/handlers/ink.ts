// Command handlers for the interactive player Beside on Ink and Game Scripts: Play, Play from here, Back, and Restart.
import type { CommandHandlers } from "@manent/commands";
import { INK_WORDS, messageFor } from "@manent/ui";
import { openBeside } from "../beside/open-beside.ts";
import {
  triggerGameBack,
  triggerGamePlay,
  triggerGamePlayFromScene,
  triggerGameRestart,
} from "../game/player/controller.ts";
import { caretSceneIdOf } from "../game/player/source-nav.ts";
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

function openFormatOf(deps: HandlerDeps, docId: string): string {
  try {
    return deps.services.openScriptStore(docId).get("script.format");
  } catch {
    return "screenplay";
  }
}

export function inkHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, InkCommandId> {
  return {
    "ink.play"() {
      const { docId } = deps.shellState();
      if (docId === null) return;
      if (openFormatOf(deps, docId) === "game") {
        triggerGamePlay(docId);
        openBeside(docId, "game_player", null);
        return;
      }
      triggerInkPlay(docId);
      openBeside(docId, "ink_player", null);
    },
    "ink.playFromHere"() {
      const { docId } = deps.shellState();
      if (docId === null) return;
      if (openFormatOf(deps, docId) === "game") {
        void caretSceneIdOf(docId).then((sceneId) => {
          if (sceneId === null) {
            deps.services.messages.push(
              messageFor({
                kind: "command_unavailable",
                label: INK_WORDS.playFromHere,
                reason: INK_WORDS.needsCaretInScene,
              }),
            );
            return;
          }
          triggerGamePlayFromScene(docId, sceneId);
          openBeside(docId, "game_player", null);
        });
        return;
      }
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
      if (openFormatOf(deps, docId) === "game") {
        triggerGameBack(docId);
        return;
      }
      triggerInkBack(docId);
    },
    "ink.restart"() {
      const { docId } = deps.shellState();
      if (docId === null) return;
      if (openFormatOf(deps, docId) === "game") {
        triggerGameRestart(docId);
        return;
      }
      triggerInkRestart(docId);
    },
  };
}
