// Ink compiler problems Check source for Details -> Script -> Checks and pre-send Checks.
import { INK_WORDS } from "@manent/ui";
import { archiveSource } from "../archive/archive-source.ts";
import {
  notifyChecksChanged,
  recordCheckDetail,
} from "../checks/checks-context.ts";
import type { Check, CheckSource } from "../checks/sources.ts";
import { liveEditor } from "../editor-host/live-editor.ts";
import { inkCompileClient, subscribeInkCompile } from "./compile-client.ts";

const SOURCE_ID = "ink_problems";
const compileWatches = new Map<string, () => void>();

function ensureCompileWatch(docId: string): void {
  if (compileWatches.has(docId) || inkCompileClient(docId) === null) return;
  const stop = subscribeInkCompile(docId, () => {
    notifyChecksChanged(docId);
    if (inkCompileClient(docId) === null) {
      stop();
      compileWatches.delete(docId);
    }
  });
  compileWatches.set(docId, stop);
}

/** Maps 1-based Ink line numbers to their `ink_line` block ids in the open editor. */
function inkLineBlockIds(docId: string): readonly string[] {
  const pmDoc = liveEditor(docId)?.view?.state?.doc;
  if (pmDoc === undefined || pmDoc === null) return [];
  const ids: string[] = [];
  pmDoc.descendants((node) => {
    if (node.type.name !== "block") return true;
    if (node.attrs["type"] === "ink_line") {
      const id = node.attrs["id"];
      ids.push(typeof id === "string" ? id : "");
    }
    return false;
  });
  return ids;
}

function openInkLine(docId: string, blockId: string): void {
  const scriptPath = `/s/${docId}`;
  if (
    typeof window !== "undefined" &&
    window.location.pathname !== scriptPath
  ) {
    const url = `${scriptPath}?at=${encodeURIComponent(blockId)}`;
    window.history.pushState(null, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
    return;
  }
  archiveSource.get()?.editor.run({ kind: "go_to", blockId, offset: 0 });
}

/** Lists every current Ink compile problem for `docId`, with `See line` moving the caret there. */
export const inkProblemsCheck: CheckSource = {
  id: SOURCE_ID,
  find(docId): readonly Check[] {
    ensureCompileWatch(docId);
    const problems = inkCompileClient(docId)?.snapshot().problems ?? [];
    if (problems.length === 0) return [];
    const blockIds = inkLineBlockIds(docId);
    return problems.map((problem, index) => {
      const id = `${problem.line}:${index}`;
      const sentence = INK_WORDS.checkProblem(problem.line, problem.message);
      recordCheckDetail(docId, `${SOURCE_ID}:${id}`, {
        anchor: null,
        subject: sentence,
      });
      const blockId = blockIds[problem.line - 1] ?? "";
      return {
        id,
        sentence,
        action:
          blockId === ""
            ? null
            : {
                label: INK_WORDS.seeLine,
                run: () => openInkLine(docId, blockId),
              },
      };
    });
  },
};
