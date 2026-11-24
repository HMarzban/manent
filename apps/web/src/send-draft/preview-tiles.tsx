// Preview page tiles for Send draft: shows the pages that will go, with revision asterisks and watermark when chosen.
import type { Pagination } from "@manent/pagination";
import { MARK_OFFSET_CELLS, markedLines } from "@manent/revisions";
import { CELL_PT, UNIT_PT } from "@manent/pagination";
import { EDITOR_WORDS } from "@manent/ui";
import { useLayoutEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { drawSheet, engineOf } from "../send/print-pages.ts";

const TILE_PAGES = 8;
const TILE_SCALE = 0.085;
const EMPTY_AUTHORS = new Map<string, string>();

const SHEET_SCALE: CSSProperties = Object.freeze({
  transform: `scale(${TILE_SCALE})`,
  transformOrigin: "0 0",
});

function drawPreviewSheet(options: {
  p: Pagination;
  index: number;
  title: string;
  watermark: string | null;
  changedLines: ReadonlyMap<string, readonly number[]> | null;
}): HTMLElement {
  const { p, index, title, watermark, changedLines } = options;
  const engine = engineOf(p);
  const sheet = drawSheet(engine, p, index, { title, watermark });
  if (changedLines === null || changedLines.size === 0) return sheet;
  const laid = engine.layoutPage(p, index);
  const marks = markedLines(laid, changedLines, EMPTY_AUTHORS);
  if (marks.length === 0) return sheet;
  const { geometry, columnCells } = p.profile;
  const markLeftPt =
    geometry.marginLeftPt + (columnCells + MARK_OFFSET_CELLS) * CELL_PT;
  for (const mark of marks) {
    const row = document.createElement("div");
    row.textContent = "*";
    Object.assign(row.style, {
      position: "absolute",
      left: `${markLeftPt}pt`,
      top: `${geometry.marginTopPt + mark.y * UNIT_PT}pt`,
    });
    sheet.append(row);
  }
  return sheet;
}

function Tile(props: {
  p: Pagination;
  index: number;
  title: string;
  watermark: string | null;
  changedLines: ReadonlyMap<string, readonly number[]> | null;
}): ReactNode {
  const { p, index, title, watermark, changedLines } = props;
  const sheet = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    sheet.current?.replaceChildren(
      drawPreviewSheet({ p, index, title, watermark, changedLines }),
    );
  }, [p, index, title, watermark, changedLines]);
  const { widthPt, heightPt } = p.profile.geometry;
  const frame: CSSProperties = {
    width: `${widthPt * TILE_SCALE}pt`,
    height: `${heightPt * TILE_SCALE}pt`,
    boxShadow: "0 0 0 1px var(--page-edge)",
  };
  return (
    <li className="flex flex-col items-center gap-1">
      <div aria-hidden="true" className="overflow-hidden" style={frame}>
        <div ref={sheet} className="mn-tile" style={SHEET_SCALE} />
      </div>
      <p className="text-meta text-fg-muted tabular-nums">
        {p.pages[index]?.label}
      </p>
    </li>
  );
}

export function DraftPreviewTiles(props: {
  p: Pagination | null;
  pageIndexes: readonly number[];
  title: string;
  watermark: string | null;
  changedLines: ReadonlyMap<string, readonly number[]> | null;
}): ReactNode {
  const { p, pageIndexes, title, watermark, changedLines } = props;
  if (p === null) return null;
  const shown = pageIndexes.slice(0, TILE_PAGES);
  const more = pageIndexes.length - shown.length;
  return (
    <>
      <ol className="flex flex-wrap gap-x-2 gap-y-3">
        {shown.map((index) => (
          <Tile
            key={index}
            p={p}
            index={index}
            title={title}
            watermark={watermark}
            changedLines={changedLines}
          />
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
