// The Ruler's row between the state bar and the panels: the caret block's indent and right edge over the page's text column.
import { Ruler, useSubscribable } from "@manent/ui";
import type { StatusFacts, Subscribable } from "@manent/ui";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import type { PageFrame } from "../../editor-host/page-frame.ts";
import { useServices } from "../../services/context.tsx";
import { useEditorFact } from "../../state/facts.store.ts";
import { useRulerShown } from "../../state/ruler.store.ts";
import { useKeepPageStill } from "./document-state-bar.tsx";
import { useOpenDocument } from "./open-document.ts";

const RULER_AREA = Object.freeze({ gridArea: "ruler" });
const NOTHING: Subscribable<null> = Object.freeze({
  get: () => null,
  subscribe: () => () => {},
});

// the frame is read through the live editor, which loads apart from the screens
const loadPageFrame = async () =>
  (await import("../../editor-host/page-frame.ts")).pageFrame;

/** The page's frame for `docId` while `shown`; null until its code has loaded and while no paged editor of it is open. */
function usePageFrame(docId: string, shown: boolean): PageFrame | null {
  const [source, setSource] = useState<{
    docId: string;
    frame: Subscribable<PageFrame | null>;
  } | null>(null);
  useEffect(() => {
    let current = true;
    loadPageFrame()
      .then((pageFrame) => {
        if (current) setSource({ docId, frame: pageFrame(docId) });
      })
      .catch(() => {
        // without its code the bar stays empty; Details → Selection → Layout holds the same values
      });
    return () => {
      current = false;
    };
  }, [docId]);
  return useSubscribable<PageFrame | null>(
    shown && source?.docId === docId ? source.frame : NOTHING,
  );
}

/** This person's access to `docId`; null until its services are open. */
export function useAccess(docId: string): StatusFacts["access"] | null {
  const status = useOpenDocument(docId)?.status ?? null;
  // the status may be a new object at each read: only the answer is compared
  const subscribe = useCallback(
    (notify: () => void) => status?.subscribe(notify) ?? (() => {}),
    [status],
  );
  return useSyncExternalStore(subscribe, () => status?.get().access ?? null);
}

/** Whether this person may edit `docId`; false until its services are open. */
export function useCanEdit(docId: string): boolean {
  return useAccess(docId) === "edit";
}

/**
 * Drawn while the Ruler is on and the caret is in a block of a paged script; otherwise its row is empty and 0 px high.
 * Its appearing scrolls the page by its height in the same frame, so the line being read stays put. A drag sends one
 * layout action holding only the values it changed.
 */
export function RulerBar(props: { docId: string }): ReactNode {
  const { docId } = props;
  const { editor } = useServices();
  const shown = useRulerShown();
  const columnCells = useEditorFact("columnCells");
  const indent = useEditorFact("blockIndent");
  const width = useEditorFact("blockWidth");
  const editable = useCanEdit(docId);
  const frame = usePageFrame(docId, shown);
  const bar = useRef<HTMLDivElement>(null);
  const [barLeftPx, setBarLeftPx] = useState(0);
  useKeepPageStill(bar);
  useLayoutEffect(() => {
    if (bar.current !== null)
      setBarLeftPx(bar.current.getBoundingClientRect().left);
  }, [frame]);
  const drawn =
    shown &&
    columnCells !== null &&
    indent !== null &&
    width !== null &&
    frame !== null;
  return (
    <div ref={bar} data-tour="ruler" style={RULER_AREA}>
      {drawn ? (
        <Ruler
          columnCells={columnCells}
          cellPx={frame.cellPx}
          originPx={frame.textLeftPx - barLeftPx}
          indent={indent}
          width={width}
          editable={editable}
          onCommit={(change) =>
            editor.run({
              kind: "layout",
              ...(change.indent === indent ? {} : { indent: change.indent }),
              ...(change.width === width ? {} : { width: change.width }),
            })
          }
        />
      ) : null}
    </div>
  );
}
