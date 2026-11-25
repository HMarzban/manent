// A scene's row menu entry for Move to cuts: hidden for non-editors and on numbered scenes in a locked script.
import { DropdownMenuItem, MATERIAL_WORDS } from "@manent/ui";
import { ScissorsIcon } from "lucide-react";
import { useCallback, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { liveEditor, livePagination } from "../../editor-host/live-editor.ts";
import { useCanEdit } from "../../screens/document/ruler-bar.tsx";
import { OutlineContext } from "../../state/bridge-contexts.ts";
import { useProductionContext } from "../../state/production-context.store.ts";

const NUMBERED_HEADINGS: ReadonlySet<string> = new Set([
  "scene_heading",
  "slug",
]);

function readLiveHeadingNumbered(
  docId: string,
  headingId: string,
): "numbered" | "unnumbered" | null {
  const pagination = livePagination(docId);
  if (pagination !== null) {
    for (const block of pagination.blocks) {
      if (block.id === headingId)
        return NUMBERED_HEADINGS.has(block.type) ? "numbered" : "unnumbered";
    }
    return null;
  }
  const pmDoc = liveEditor(docId)?.view.state.doc;
  if (pmDoc === undefined) return null;
  let result: "numbered" | "unnumbered" | null = null;
  pmDoc.descendants((node) => {
    if (result !== null) return false;
    if (node.type.name !== "block") return true;
    if (node.attrs.id === headingId) {
      result = NUMBERED_HEADINGS.has(String(node.attrs.type))
        ? "numbered"
        : "unnumbered";
      return false;
    }
    return false;
  });
  return result;
}

function useSceneInfo(
  docId: string,
  headingId: string,
): { number: string | null; numbered: boolean } {
  const outline = useContext(OutlineContext);
  const subscribe = useCallback(
    (listener: () => void) => outline?.subscribe(listener) ?? (() => {}),
    [outline],
  );
  const read = (): string | null => {
    if (outline !== null) {
      for (let i = 0; i < outline.count(); i++) {
        const row = outline.row(i);
        if (row !== null && row.blockId === headingId)
          return row.number === null ? "unnumbered" : `num:${row.number}`;
      }
    }
    return readLiveHeadingNumbered(docId, headingId);
  };
  const info = useSyncExternalStore(subscribe, read, read);
  if (info === null) return { number: null, numbered: false };
  if (info === "unnumbered") return { number: null, numbered: false };
  if (info === "numbered") return { number: null, numbered: true };
  return { number: info.slice(4), numbered: true };
}

/** Moves the scene `headingId` to cuts; absent for viewers/commenters and on numbered scenes in a locked script. */
export function CutSceneItem(props: {
  docId: string;
  headingId: string;
}): ReactNode {
  const { docId, headingId } = props;
  const canEdit = useCanEdit(docId);
  const locked = useProductionContext(docId)?.locked === true;
  const { number, numbered } = useSceneInfo(docId, headingId);
  if (!canEdit || (locked && numbered)) return null;
  return (
    <DropdownMenuItem
      className="text-ui"
      onClick={() =>
        void import("../../editor-host/material.ts").then(
          ({ moveSceneToCutsIn }) =>
            moveSceneToCutsIn(docId, headingId, number),
        )
      }
    >
      <ScissorsIcon aria-hidden="true" className="size-icon text-fg-muted" />
      {MATERIAL_WORDS.moveToCuts}
    </DropdownMenuItem>
  );
}
