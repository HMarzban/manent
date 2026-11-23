// An address that names a block: the caret goes to it once the document's editor is open, and the address forgets it.
import { getRouteApi } from "@tanstack/react-router";
import { useEffect } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import type { EditorControl } from "./control.ts";
import { liveEditor, subscribeLiveEditors } from "./live-editor.ts";

const route = getRouteApi("/s/$docId");

const noop = (): void => {};

/**
 * Puts the caret at the start of `blockId` once the editor of `docId` is open, in the frame after it opens so that the
 * place the person left it is restored first; then calls `done`. The returned function stops waiting.
 */
function goToWhenOpen(options: {
  docId: string;
  blockId: string;
  control: EditorControl;
  frame: (fn: () => void) => () => void;
  done: () => void;
}): () => void {
  let cancel = noop;
  const go = (): void => {
    options.control.run({ kind: "go_to", blockId: options.blockId, offset: 0 });
    options.done();
  };
  const isOpen = (): boolean => liveEditor(options.docId) !== null;
  if (isOpen()) {
    cancel = options.frame(go);
    return () => cancel();
  }
  const stop = subscribeLiveEditors(() => {
    if (!isOpen()) return;
    stop();
    cancel = options.frame(go);
  });
  return () => {
    stop();
    cancel();
  };
}

/** Follows the document address's `at`: draws nothing. */
export function GoToAt(): null {
  const { docId } = route.useParams();
  const { at } = route.useSearch();
  const navigate = route.useNavigate();
  const { frame } = useEnvironment();
  const { editor } = useServices();
  useEffect(() => {
    if (typeof at !== "string") return;
    return goToWhenOpen({
      docId,
      blockId: at,
      control: editor,
      frame,
      // the address without its search: `at` is the only one it takes
      done: () =>
        void navigate({ to: "/s/$docId", params: { docId }, replace: true }),
    });
  }, [docId, at]);
  return null;
}
