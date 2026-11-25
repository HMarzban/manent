// Preview tiles for the rundown Send screen: landscape RundownPage tiles and story script tiles via drawSheet.
import type { RundownPage } from "@manent/formats";
import type { Pagination } from "@manent/pagination";
import { EDITOR_WORDS, RUNDOWN_SEND_WORDS } from "@manent/ui";
import { useLayoutEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { drawSheet, engineOf } from "../../send/print-pages.ts";
import { drawRundownSheet } from "./rundown-sheets.ts";

const MAX_TILES = 8;
const SCRIPT_TILE_SCALE = 0.085;
const RUNDOWN_TILE_SCALE = 0.13;

const SCRIPT_SHEET_STYLE: CSSProperties = Object.freeze({
  transform: `scale(${SCRIPT_TILE_SCALE})`,
  transformOrigin: "0 0",
});

const RUNDOWN_SHEET_STYLE: CSSProperties = Object.freeze({
  transform: `scale(${RUNDOWN_TILE_SCALE})`,
  transformOrigin: "0 0",
});

export interface StoryPageRef {
  readonly key: string;
  readonly pagination: Pagination;
  readonly pageIndex: number;
  readonly label: string;
}

function RundownPageTile(props: { readonly page: RundownPage }): ReactNode {
  const { page } = props;
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    host.current?.replaceChildren(drawRundownSheet(page));
  }, [page]);
  const frame: CSSProperties = {
    width: `${page.widthPt * RUNDOWN_TILE_SCALE}pt`,
    height: `${page.heightPt * RUNDOWN_TILE_SCALE}pt`,
    boxShadow: "0 0 0 1px var(--page-edge)",
  };
  return (
    <li className="flex flex-col items-center gap-1">
      <div aria-hidden="true" className="overflow-hidden" style={frame}>
        <div ref={host} className="mn-tile" style={RUNDOWN_SHEET_STYLE} />
      </div>
      <p className="text-meta text-fg-muted tabular-nums">{page.pageNumber}</p>
    </li>
  );
}

function StoryPageTile(props: { readonly entry: StoryPageRef }): ReactNode {
  const { entry } = props;
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    host.current?.replaceChildren(
      drawSheet(engineOf(entry.pagination), entry.pagination, entry.pageIndex),
    );
  }, [entry]);
  const { widthPt, heightPt } = entry.pagination.profile.geometry;
  const frame: CSSProperties = {
    width: `${widthPt * SCRIPT_TILE_SCALE}pt`,
    height: `${heightPt * SCRIPT_TILE_SCALE}pt`,
    boxShadow: "0 0 0 1px var(--page-edge)",
  };
  return (
    <li className="flex flex-col items-center gap-1">
      <div aria-hidden="true" className="overflow-hidden" style={frame}>
        <div ref={host} className="mn-tile" style={SCRIPT_SHEET_STYLE} />
      </div>
      <p className="text-meta text-fg-muted tabular-nums">{entry.label}</p>
    </li>
  );
}

/** Renders the rundown PDF preview tiles and/or story script tiles in the Send preview pane. */
export function RundownPreviewTiles(props: {
  readonly rundownPages: readonly RundownPage[] | null;
  readonly storyPages: readonly StoryPageRef[] | null;
}): ReactNode {
  const { rundownPages, storyPages } = props;
  const showRundown = rundownPages !== null && rundownPages.length > 0;
  const showStories = storyPages !== null && storyPages.length > 0;
  if (!showRundown && !showStories) return null;
  const showHeadings = showRundown && showStories;

  const shownRundown = showRundown ? rundownPages.slice(0, MAX_TILES) : [];
  const moreRundown = showRundown
    ? rundownPages.length - shownRundown.length
    : 0;
  const shownStories = showStories ? storyPages.slice(0, MAX_TILES) : [];
  const moreStories = showStories ? storyPages.length - shownStories.length : 0;

  return (
    <div className="flex flex-col gap-4">
      {showRundown ? (
        <div>
          {showHeadings ? (
            <p className="mn-group-label px-0! pt-0! pb-2!">
              {RUNDOWN_SEND_WORDS.types.rundown_pdf}
            </p>
          ) : null}
          <ol className="flex flex-wrap gap-x-2 gap-y-3">
            {shownRundown.map((page) => (
              <RundownPageTile key={page.pageNumber} page={page} />
            ))}
          </ol>
          {moreRundown > 0 ? (
            <p className="mt-3 text-meta text-fg-muted">
              {EDITOR_WORDS.send.morePages(moreRundown)}
            </p>
          ) : null}
        </div>
      ) : null}

      {showStories ? (
        <div>
          {showHeadings ? (
            <p className="mn-group-label px-0! pt-0! pb-2!">
              {RUNDOWN_SEND_WORDS.types.rundown_scripts}
            </p>
          ) : null}
          <ol className="flex flex-wrap gap-x-2 gap-y-3">
            {shownStories.map((entry) => (
              <StoryPageTile key={entry.key} entry={entry} />
            ))}
          </ol>
          {moreStories > 0 ? (
            <p className="mt-3 text-meta text-fg-muted">
              {EDITOR_WORDS.send.morePages(moreStories)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
