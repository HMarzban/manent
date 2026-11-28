// The pages a Send form sends: the open editor's own pagination or what its What option makes of it, its first sheets
// drawn small, and what both forms say about them.
import type { Pagination } from "@manent/pagination";
import { blocksOf } from "@manent/schema";
import type { DocJSON } from "@manent/schema";
import {
  EDITOR_WORDS,
  LIBRARY_WORDS,
  Segmented,
  useSubscribable,
} from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  liveEditor,
  livePagination,
  subscribeLiveEditors,
} from "../editor-host/live-editor.ts";
import { PageTilesSkeleton } from "../screens/send/send-frame.tsx";
import type { SendRow } from "../screens/send/send-frame.tsx";
import { useServices } from "../services/context.tsx";
import { outsideFontRow } from "./output-checks.tsx";
import { drawSheet, engineOf } from "./print-pages.ts";
import type { MaterialSnapshot, SendWhatOption } from "./what-options.ts";

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

/**
 * The pages `option` sends of `docId`: the open editor's `pages`, or the document its transform makes from the open
 * editor's, paginated apart in the same engine, page profile and locks.
 */
function pagesFor(
  option: SendWhatOption,
  docId: string,
  pages: Pagination,
  material: () => MaterialSnapshot,
): Pagination {
  const editor = liveEditor(docId);
  if (option.transform === null || editor === null) return pages;
  const doc: DocJSON = editor.view.state.doc.toJSON();
  const engine = engineOf(pages);
  return engine.paginate(
    engine.toLayoutBlocks(blocksOf(option.transform(doc, material()))),
    pages.profile,
    pages.locks,
  );
}

const SPREAD_VIEW_OPTIONS = Object.freeze([
  { value: "single", label: EDITOR_WORDS.send.viewSingle },
  { value: "spread", label: EDITOR_WORDS.send.viewSpread },
]);

function SheetFrame(props: {
  p: Pagination;
  index: number;
  withBorder?: boolean;
}): ReactNode {
  const { p, index, withBorder = true } = props;
  const sheet = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    sheet.current?.replaceChildren(drawSheet(engineOf(p), p, index));
  }, [p, index]);
  const { widthPt, heightPt } = p.profile.geometry;
  const frame: CSSProperties = {
    width: `${widthPt * TILE_SCALE}pt`,
    height: `${heightPt * TILE_SCALE}pt`,
    ...(withBorder ? { boxShadow: "0 0 0 1px var(--page-edge)" } : {}),
  };
  return (
    <div aria-hidden="true" className="overflow-hidden" style={frame}>
      <div ref={sheet} className="mn-tile" style={SHEET_SCALE} />
    </div>
  );
}

function Tile(props: { p: Pagination; index: number }): ReactNode {
  const { p, index } = props;
  return (
    <li className="flex flex-col items-center gap-1">
      <SheetFrame p={p} index={index} />
      <p className="text-meta text-fg-muted tabular-nums">
        {p.pages[index]?.blank ? "—" : p.pages[index]?.label}
      </p>
    </li>
  );
}

function pairSpreads(
  indices: readonly number[],
): { readonly left: number | null; readonly right: number | null }[] {
  const spreads: { left: number | null; right: number | null }[] = [];
  let i = 0;
  while (i < indices.length) {
    const idx = indices[i]!;
    if (i === 0 && idx === 0) {
      spreads.push({ left: null, right: idx });
      i += 1;
      continue;
    }
    spreads.push({ left: idx, right: indices[i + 1] ?? null });
    i += 2;
  }
  return spreads;
}

/** The first eight pages (or facing book spreads on Layout Engine 3 manuscripts), then how many more there are. */
export function PageTiles(props: {
  p: Pagination;
  indices?: readonly number[] | null;
}): ReactNode {
  const { p, indices } = props;
  const canSpread =
    p.profile.format === "manuscript" &&
    p.profile.typography?.kind === "book_serif";
  const [mode, setMode] = useState<"single" | "spread" | null>(null);
  const viewMode: "single" | "spread" = !canSpread
    ? "single"
    : (mode ?? (p.profile.geometry.mirrored === true ? "spread" : "single"));

  const selected =
    indices === undefined || indices === null
      ? p.pages.map((page) => page.index)
      : indices.filter((index) => p.pages[index] !== undefined);
  const shown = selected.slice(0, TILE_PAGES);
  const more = selected.length - shown.length;
  const spreads = useMemo(
    () => (viewMode === "spread" ? pairSpreads(shown) : []),
    [viewMode, shown],
  );
  const { widthPt, heightPt } = p.profile.geometry;
  const ghostStyle: CSSProperties = {
    width: `${widthPt * TILE_SCALE}pt`,
    height: `${heightPt * TILE_SCALE}pt`,
  };

  return (
    <>
      {canSpread ? (
        <div className="mb-3 flex justify-end">
          <Segmented
            label={EDITOR_WORDS.send.pagesView}
            value={viewMode}
            options={SPREAD_VIEW_OPTIONS}
            onChange={(next) => {
              if (next === "single" || next === "spread") setMode(next);
            }}
          />
        </div>
      ) : null}
      {viewMode === "spread" ? (
        <ol className="flex flex-wrap gap-x-3 gap-y-3" data-view="spread">
          {spreads.map((spread, idx) => {
            const leftLabel =
              spread.left === null || p.pages[spread.left]?.blank
                ? null
                : p.pages[spread.left]?.label;
            const rightLabel =
              spread.right === null || p.pages[spread.right]?.blank
                ? null
                : p.pages[spread.right]?.label;
            const caption =
              leftLabel && rightLabel
                ? `${leftLabel}–${rightLabel}`
                : (leftLabel ?? rightLabel ?? "—");
            return (
              <li
                key={`${spread.left ?? "x"}-${spread.right ?? "x"}-${idx}`}
                className="flex flex-col items-center gap-1"
              >
                <div
                  className="flex items-stretch overflow-hidden"
                  style={{ boxShadow: "0 0 0 1px var(--page-edge)" }}
                >
                  {spread.left !== null ? (
                    <SheetFrame p={p} index={spread.left} withBorder={false} />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="bg-transparent"
                      style={ghostStyle}
                    />
                  )}
                  <div aria-hidden="true" className="w-px shrink-0 bg-line" />
                  {spread.right !== null ? (
                    <SheetFrame p={p} index={spread.right} withBorder={false} />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="bg-transparent"
                      style={ghostStyle}
                    />
                  )}
                </div>
                <p className="text-meta text-fg-muted tabular-nums">
                  {caption}
                </p>
              </li>
            );
          })}
        </ol>
      ) : (
        <ol className="flex flex-wrap gap-x-2 gap-y-3" data-view="single">
          {shown.map((index) => (
            <Tile key={index} p={p} index={index} />
          ))}
        </ol>
      )}
      {more > 0 ? (
        <p className="mt-3 text-meta text-fg-muted">
          {EDITOR_WORDS.send.morePages(more)}
        </p>
      ) : null}
    </>
  );
}

/** What a Send form sends and says: `p`, `pages` and `tiles` are null while the document's editor is still opening. */
interface SendPages {
  p: Pagination | null;
  /** What the chosen What option sends of `p`; null also while no option is chosen. */
  pages: Pagination | null;
  title: string;
  /** The Checks row, once the pages are known, then the What row. */
  rows: SendRow[];
  tiles: ReactNode;
  /** Back to the document, in place of the form. */
  back: () => void;
}

/** The pages of `docId` both Send forms start from, and those `option` (null: none chosen) sends of them. */
export function useSendPages(
  docId: string,
  option: SendWhatOption | null,
  pagesOf: ((pages: Pagination) => readonly number[]) | null = null,
  revision = 0,
): SendPages {
  const p = useLivePagination(docId);
  const { library, documents } = useServices();
  const navigate = useNavigate();
  const title =
    useSubscribable(library.documentTitle(docId)) ??
    LIBRARY_WORDS.untitledScript;
  const checks = useMemo(() => (p === null ? null : outsideFontRow(p)), [p]);
  const pages = useMemo(
    () =>
      p === null || option === null
        ? null
        : pagesFor(option, docId, p, () => {
            const { material } = documents.open(docId);
            documents.close(docId);
            return material.materialSnapshotOf(docId);
          }),
    [p, option, docId, documents],
  );
  const preview = pages ?? p;
  const indices = useMemo(() => {
    void revision;
    return preview === null || pagesOf === null ? null : pagesOf(preview);
  }, [preview, pagesOf, revision]);
  return {
    p,
    pages,
    title,
    rows: [
      ...(checks === null ? [] : [checks]),
      { id: "what", content: EDITOR_WORDS.send.wholeScript },
    ],
    tiles:
      preview === null ? (
        <PageTilesSkeleton />
      ) : (
        <PageTiles p={preview} indices={indices} />
      ),
    back: () =>
      void navigate({ to: "/s/$docId", params: { docId }, replace: true }),
  };
}
