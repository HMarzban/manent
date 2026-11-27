// Contextual Ink compile problems readout in the status bar: jumps to the first problem line or opens Details → Script.
import type { InkProblem } from "@manent/formats";
import { Button, INK_WORDS } from "@manent/ui";
import { TriangleAlertIcon } from "lucide-react";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { EditorControl } from "../../editor-host/control.ts";
import {
  inkCompileClient,
  subscribeInkCompile,
} from "../../ink/compile-client.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { openDetailsAt } from "./details-tab.tsx";

const EMPTY_PROBLEMS: readonly InkProblem[] = Object.freeze([]);

async function jumpToFirstProblem(
  docId: string,
  line: number,
  editor: EditorControl,
  fallback: () => void,
): Promise<void> {
  if (!Number.isInteger(line) || line < 1) {
    fallback();
    return;
  }
  const { liveEditor } = await import("../../editor-host/live-editor.ts");
  const pmDoc = liveEditor(docId)?.view?.state?.doc;
  if (pmDoc === undefined || pmDoc === null) {
    fallback();
    return;
  }
  let count = 0;
  let targetId: string | null = null;
  pmDoc.descendants((node) => {
    if (targetId !== null) return false;
    if (node.type.name !== "block") return true;
    if (node.attrs["type"] === "ink_line") {
      count++;
      if (count === line) {
        const id: unknown = node.attrs["id"];
        if (typeof id === "string") targetId = id;
        return false;
      }
    }
    return false;
  });
  if (targetId !== null) {
    void editor.run({ kind: "go_to", blockId: targetId, offset: 0 });
  } else {
    fallback();
  }
}

/** Shows the active Ink compile problem count in the status bar when an Ink script has problems. */
export function InkProblemsReadout(props: { docId: string }): ReactNode {
  const { docId } = props;
  const services = useServices();
  const { frame } = useEnvironment();
  const scriptStore = useMemo(
    () => services.openScriptStore(docId),
    [services, docId],
  );
  const subscribeFormat = useCallback(
    (listener: () => void) => scriptStore.subscribe("script.format", listener),
    [scriptStore],
  );
  const format = useSyncExternalStore(
    subscribeFormat,
    () => scriptStore.get("script.format"),
    () => scriptStore.get("script.format"),
  );
  const subscribeCompile = useCallback(
    (listener: () => void) => subscribeInkCompile(docId, listener),
    [docId],
  );
  const problems = useSyncExternalStore(
    subscribeCompile,
    () => inkCompileClient(docId)?.snapshot().problems ?? EMPTY_PROBLEMS,
    () => EMPTY_PROBLEMS,
  );

  if (format !== "ink" || problems.length === 0) return null;

  const handleClick = (): void => {
    const first = problems[0];
    if (first === undefined) {
      openDetailsAt("script", frame);
      return;
    }
    void jumpToFirstProblem(docId, first.line, services.editor, () =>
      openDetailsAt("script", frame),
    );
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="shrink-0 gap-1 text-meta font-medium text-attention tabular-nums"
      onClick={handleClick}
    >
      <TriangleAlertIcon aria-hidden="true" className="size-3.5 shrink-0" />
      {INK_WORDS.problemsCount(problems.length)}
    </Button>
  );
}
