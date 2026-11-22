// The pages a revision goes out as: what the packet holds, then each page drawn small on white paper, whatever the
// theme, with its revision's header and asterisks.
import { CELL_PT, UNIT_PT } from "@manent/pagination";
import type { Pagination } from "@manent/pagination";
import { MARK_OFFSET_CELLS, pageRevision } from "@manent/revisions";
import type { RevisionSource } from "@manent/revisions";
import { PRODUCTION_WORDS } from "@manent/ui";
import { useLayoutEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { drawSheet, engineOf } from "../../send/print-pages.ts";

const TILE_SCALE = 0.2;

const SHEET_SCALE: CSSProperties = Object.freeze({
  transform: `scale(${TILE_SCALE})`,
  transformOrigin: "0 0",
});

/** Page `index` of `p` as the file draws it: the sheet, then its revision's header and marks. */
function drawPacketSheet(
  p: Pagination,
  index: number,
  sources: readonly RevisionSource[],
): HTMLElement {
  const sheet = drawSheet(engineOf(p), p, index);
  const revision = pageRevision(p, index, sources, "collated");
  if (revision === null) return sheet;
  const { geometry, columnCells } = p.profile;
  const place = (text: string, leftPt: number, topPt: number): void => {
    const line = document.createElement("div");
    line.textContent = text;
    Object.assign(line.style, {
      position: "absolute",
      left: `${leftPt}pt`,
      top: `${topPt}pt`,
    });
    sheet.append(line);
  };
  place(revision.header, geometry.marginLeftPt, geometry.pageNumberTopPt);
  const markLeftPt =
    geometry.marginLeftPt + (columnCells + MARK_OFFSET_CELLS) * CELL_PT;
  for (const mark of revision.marks)
    place(mark.text, markLeftPt, geometry.marginTopPt + mark.y * UNIT_PT);
  return sheet;
}

function Tile(props: {
  p: Pagination;
  index: number;
  sources: readonly RevisionSource[];
}): ReactNode {
  const { p, index, sources } = props;
  const sheet = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    sheet.current?.replaceChildren(drawPacketSheet(p, index, sources));
  }, [p, index, sources]);
  const { widthPt, heightPt } = p.profile.geometry;
  const frame: CSSProperties = {
    // the paper's light colours, as White page draws them in a dark theme: the packet is the file, not the screen
    colorScheme: "light",
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

/** `labels` in page order; a label `p` does not print draws no tile. */
export function Packet(props: {
  p: Pagination;
  labels: readonly string[];
  name: string;
  sources: readonly RevisionSource[];
}): ReactNode {
  const { p, labels, sources } = props;
  const chosen = new Set(labels);
  const pages = p.pages.filter((page) => chosen.has(page.label));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-meta text-fg-muted">
        {PRODUCTION_WORDS.packet(labels.length, props.name)}
      </p>
      <ol className="flex flex-wrap gap-4">
        {pages.map((page) => (
          <Tile key={page.index} p={p} index={page.index} sources={sources} />
        ))}
      </ol>
    </div>
  );
}
