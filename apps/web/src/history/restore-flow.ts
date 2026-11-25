// Restoring a version: the question asked first when others can open the script, the refusal said in its place,
// and the message that offers the restore's reverse.
import type { RestoreScope } from "@manent/revisions";
import type { VersionItem } from "@manent/sync-protocol";
import { HISTORY_WORDS, historyMessage } from "@manent/ui";
import type { HistoryMessage, MessageQueue } from "@manent/ui";
import type { RestoreRequest } from "./restore-question.ts";
import type { HistorySource } from "./source.ts";

/** The dialog's words for restoring `ref`, the whole script or (`scene` not null) one scene of it. */
function requestOf(
  ref: string,
  scene: string | null,
  refusal: string | null,
): RestoreRequest {
  return scene === null
    ? {
        title: HISTORY_WORDS.restoreTitle(ref),
        body: HISTORY_WORDS.restoreBody,
        action: HISTORY_WORDS.restore,
        refusal,
      }
    : {
        title: HISTORY_WORDS.restoreSceneTitle(scene, ref),
        body: HISTORY_WORDS.restoreSceneBody(scene),
        action: HISTORY_WORDS.restoreSceneButton(scene),
        refusal,
      };
}

const push = (messages: MessageQueue, message: HistoryMessage): void =>
  messages.push(historyMessage(message, `history.${message.kind}`));

/**
 * `confirm` is asked when others can open the script, or while it is not known whether they can; a refusal asks it
 * again with the refusal's line, and without a dialog the refusal goes to the message slot.
 */
export function createRestoreFlow(options: {
  source: HistorySource;
  messages: MessageQueue;
  confirm(request: {
    title: string;
    body: string;
    action: string;
    refusal: string | null;
  }): Promise<boolean>;
  versionRef(item: VersionItem): string;
  sceneNumber(docId: string, headingId: string): string;
}): {
  restore(docId: string, item: VersionItem, scope: RestoreScope): Promise<void>;
} {
  const { source, messages } = options;
  return {
    async restore(docId, item, scope) {
      const ref = options.versionRef(item);
      const scene =
        scope.kind === "scene"
          ? options.sceneNumber(docId, scope.headingId)
          : null;
      const asks = source.rows(docId).get().othersCanOpen !== false;
      let refusal: string | null = null;
      for (;;) {
        if (asks && !(await options.confirm(requestOf(ref, scene, refusal))))
          return;
        const result = await source.restore(docId, item.id, scope);
        if (result.ok) {
          push(
            messages,
            scene === null
              ? { kind: "restored_you", ref }
              : { kind: "restored_scene_you", scene, ref },
          );
          return;
        }
        // the row offers no restore of a version whose content this device lacks while offline
        if (result.reason === "offline") return;
        if (!asks) {
          push(messages, { kind: "refused", ref });
          return;
        }
        refusal = HISTORY_WORDS.refused(ref);
      }
    },
  };
}
