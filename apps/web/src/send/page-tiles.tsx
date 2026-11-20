// The pages a Send form shows: the open editor's own pagination, and its first sheets drawn small.
import type { Pagination } from "@manent/pagination";
import { EDITOR_WORDS } from "@manent/ui";
import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  liveEditor,
  livePagination,
  subscribeLiveEditors,
} from "../editor-host/live-editor.ts";
import { drawSheet, engineOf } from "./print-pages.ts";

const TILE_PAGES = 8;
const TILE_SCALE = 0.2;

const SHEET_SCALE: CSSProperties = Object.freeze({
  transform: `scale(${TILE_SCALE})`,
  transformOrigin: "0 0",
});

/** The pagination of `docId`'s open editor, taken when that editor is registered; null while none is open. */
export function useLivePagination(docId: string): Pagination | null {
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
      <p className="text-meta text-fg-muted">{p.pages[index]?.label}</p>
    </li>
  );
}

/** The first eight pages with their labels, then how many more there are. */
export function PageTiles(props: { p: Pagination }): ReactNode {
  const { p } = props;
  const shown = p.pages.slice(0, TILE_PAGES);
  const more = p.pages.length - shown.length;
  return (
    <>
      <ol className="flex flex-wrap gap-4">
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
