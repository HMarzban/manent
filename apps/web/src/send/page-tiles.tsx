// The pages a Send form sends: the open editor's own pagination, its first sheets drawn small, and what both forms
// say about them.
import type { Pagination } from "@manent/pagination";
import { EDITOR_WORDS, LIBRARY_WORDS, useSubscribable } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  liveEditor,
  livePagination,
  subscribeLiveEditors,
} from "../editor-host/live-editor.ts";
import type { SendRow } from "../screens/send/send-frame.tsx";
import { useServices } from "../services/context.tsx";
import { outsideFontRow } from "./output-checks.tsx";
import { drawSheet, engineOf } from "./print-pages.ts";

const TILE_PAGES = 8;
const TILE_SCALE = 0.085;

const SHEET_SCALE: CSSProperties = Object.freeze({
  transform: `scale(${TILE_SCALE})`,
  transformOrigin: "0 0",
});

/** The pagination of `docId`'s open editor, taken when that editor is registered; null while none is open. */
function useLivePagination(docId: string): Pagination | null {
  const editor = useSyncExternalStore(subscribeLiveEditors, () =>
    liveEditor(docId),
  );
  return useMemo(
    () => (editor === null ? null : livePagination(docId)),
    [editor, docId],
  );
}

function Tile(props: { p: Pagination; index: number }): ReactNode {
  const { p, index } = props;
  const sheet = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    sheet.current?.replaceChildren(drawSheet(engineOf(p), p, index));
  }, [p, index]);
  const { widthPt, heightPt } = p.profile.geometry;
  const frame: CSSProperties = {
    width: `${widthPt * TILE_SCALE}pt`,
    height: `${heightPt * TILE_SCALE}pt`,
    boxShadow: "0 0 0 1px var(--page-edge)",
  };
  return (
    <li className="flex flex-col items-center gap-1">
      <div aria-hidden="true" className="overflow-hidden" style={frame}>
        <div ref={sheet} style={SHEET_SCALE} />
      </div>
      <p className="text-meta text-fg-muted tabular-nums">
        {p.pages[index]?.label}
      </p>
    </li>
  );
}

/** The first eight pages with their labels, then how many more there are. */
function PageTiles(props: { p: Pagination }): ReactNode {
  const { p } = props;
  const shown = p.pages.slice(0, TILE_PAGES);
  const more = p.pages.length - shown.length;
  return (
    <>
      <ol className="flex flex-wrap gap-x-2 gap-y-3">
        {shown.map((page) => (
          <Tile key={page.index} p={p} index={page.index} />
        ))}
      </ol>
      {more > 0 ? (
        <p className="mt-3 text-meta text-fg-muted">
          {EDITOR_WORDS.send.morePages(more)}
        </p>
      ) : null}
    </>
  );
}

/** What a Send form sends and says: `p` and `tiles` are null while the document's editor is still opening. */
interface SendPages {
  p: Pagination | null;
  title: string;
  /** The Checks row, once the pages are known, then the What row. */
  rows: SendRow[];
  tiles: ReactNode;
  /** Back to the document, in place of the form. */
  back: () => void;
}

/** The pages of `docId` both Send forms start from. */
export function useSendPages(docId: string): SendPages {
  const p = useLivePagination(docId);
  const { library } = useServices();
  const navigate = useNavigate();
  const title =
    useSubscribable(library.documentTitle(docId)) ??
    LIBRARY_WORDS.untitledScript;
  const checks = useMemo(() => (p === null ? null : outsideFontRow(p)), [p]);
  return {
    p,
    title,
    rows: [
      ...(checks === null ? [] : [checks]),
      { id: "what", content: EDITOR_WORDS.send.wholeScript },
    ],
    tiles: p === null ? null : <PageTiles p={p} />,
    back: () =>
      void navigate({ to: "/s/$docId", params: { docId }, replace: true }),
  };
}
