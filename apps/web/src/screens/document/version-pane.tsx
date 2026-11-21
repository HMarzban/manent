// Where a version is drawn: over the page As it was, or beside it Side by side under its header row. The live editor
// stays mounted, keeps its caret, scroll and undo, and keeps receiving remote edits.
import { ENGINE_VERSION, engineFor } from "@manent/pagination";
import { compareModeOf } from "@manent/revisions";
import type { CompareNote } from "@manent/revisions";
import { SCHEMA_VERSION } from "@manent/schema";
import type { VersionContent } from "@manent/sync-protocol";
import { EDITOR_WORDS, HISTORY_WORDS } from "@manent/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { shownComparison } from "../../editor-host/changes.ts";
import { livePagination } from "../../editor-host/live-editor.ts";
import { mountVersionView } from "../../editor-host/version-view.ts";
import type { VersionView } from "../../editor-host/version-view.ts";
import { useServices } from "../../services/context.tsx";
import { useHistory } from "../../state/history.store.ts";

const PAGE_REGION = "[data-region='page']";

const NOTES: Readonly<Record<CompareNote, string>> = Object.freeze({
  newer: HISTORY_WORDS.compareNewer,
  engines: HISTORY_WORDS.compareEngines,
});

/** The baseline's content once it has loaded; null while it loads, and when it cannot be had. */
function useBaselineContent(docId: string): VersionContent | null {
  const { history } = useServices();
  const baseline = useHistory("baseline");
  const at =
    baseline === null
      ? null
      : baseline.versionId !== null
        ? { versionId: baseline.versionId }
        : baseline.position !== null
          ? { position: baseline.position }
          : null;
  const key = JSON.stringify(at);
  const [loaded, setLoaded] = useState<{
    key: string;
    content: VersionContent | null;
  } | null>(null);
  useEffect(() => {
    if (at === null) return undefined;
    let shown = true;
    void history.content(docId, at).then((content) => {
      if (shown) setLoaded({ key, content });
    });
    return () => {
      shown = false;
    };
    // `key` names `at`, which is made anew on every render
  }, [history, docId, key]);
  return loaded?.key === key ? loaded.content : null;
}

/** The header's line: why the changes are shown by text and element only, when they are. */
function noteOf(content: VersionContent, docId: string): string | null {
  if (engineFor(content.engineVersion ?? ENGINE_VERSION) === null)
    return HISTORY_WORDS.compareNewer;
  const { note } = compareModeOf(content, {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: livePagination(docId)?.engineVersion ?? ENGINE_VERSION,
  });
  return note === null ? null : NOTES[note];
}

/** The first block whose bottom is below the scroller's top edge, found by halving: blocks are in page order. */
function blockAtTop(scroller: Element): string | null {
  const top = scroller.getBoundingClientRect().top;
  const blocks = scroller.querySelectorAll("[data-id]");
  let low = 0;
  let high = blocks.length - 1;
  let found: Element | null = null;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const block = blocks[middle]!;
    if (block.getBoundingClientRect().bottom > top) {
      found = block;
      high = middle - 1;
    } else low = middle + 1;
  }
  return found?.getAttribute("data-id") ?? null;
}

/**
 * Side by side scrolls in step: scrolling either side scrolls the other to the block at its top, and a scroll one
 * side makes for the other is not followed back. The live page moves aside, out from under the version.
 */
function sideBySide(
  live: HTMLElement,
  older: HTMLElement,
  view: VersionView,
): () => void {
  const made = new Map<Element, number>();
  // a scroll this made for `side`: the next scroll event there is its own echo
  const echoed = (side: HTMLElement): boolean => {
    const echo = made.get(side) === side.scrollTop;
    made.delete(side);
    return echo;
  };
  const fromLive = (): void => {
    const blockId = echoed(live) ? null : blockAtTop(live);
    if (blockId === null) return;
    view.scrollToBlock(blockId);
    made.set(older, older.scrollTop);
  };
  const fromOlder = (): void => {
    const blockId = echoed(older) ? null : blockAtTop(older);
    const block =
      blockId === null
        ? null
        : live.querySelector(`[data-id=${JSON.stringify(blockId)}]`);
    if (block === null) return;
    live.scrollTop +=
      block.getBoundingClientRect().top - live.getBoundingClientRect().top;
    made.set(live, live.scrollTop);
  };
  live.style.paddingRight = "50%";
  live.addEventListener("scroll", fromLive, { passive: true });
  older.addEventListener("scroll", fromOlder, { passive: true });
  return () => {
    live.removeEventListener("scroll", fromLive);
    older.removeEventListener("scroll", fromOlder);
    live.style.paddingRight = "";
  };
}

/** The version of the baseline, drawn in the page's grid area; nothing while the window has no page. */
export function VersionPane(props: {
  docId: string;
  position: "page" | "beside";
}): ReactNode {
  const { docId, position } = props;
  const { pagePorts } = useServices();
  const baseline = useHistory("baseline");
  const content = useBaselineContent(docId);
  const place = useRef<HTMLDivElement>(null);
  const page = document.querySelector<HTMLElement>(PAGE_REGION);

  useLayoutEffect(() => {
    const element = place.current;
    if (element === null || content === null) return undefined;
    const view: VersionView = mountVersionView({
      place: element,
      content,
      ports: pagePorts,
      offFontNote: EDITOR_WORDS.offFontNote,
      // the older side marks the changes the live page shows as the view opens
      comparison: position === "beside" ? shownComparison(docId) : null,
      engineFor,
    });
    // a read-only page has no caret, so the view itself holds the focus ring
    element.focus({ preventScroll: true });
    const stop =
      position === "beside" && page !== null
        ? sideBySide(page, element, view)
        : null;
    return () => {
      stop?.();
      view.destroy();
    };
  }, [content, position, docId, pagePorts, page]);

  const grid = page?.parentElement ?? null;
  if (grid === null || baseline === null) return null;
  const title =
    baseline.date === null
      ? baseline.title
      : `${baseline.title}, ${baseline.date}`;
  const note =
    position === "beside" && content !== null ? noteOf(content, docId) : null;
  return createPortal(
    <div
      data-version-pane
      data-region="page"
      className={
        position === "page"
          ? "z-10 flex min-h-0 flex-col bg-desk"
          : "z-10 flex min-h-0 w-1/2 flex-col justify-self-end border-l border-line bg-desk"
      }
      style={{ gridArea: "page" }}
    >
      {position === "beside" ? (
        <header className="flex flex-col gap-1 px-3 py-2 text-ui">
          <span>{title}</span>
          {note === null ? null : (
            <p className="text-meta text-fg-muted">{note}</p>
          )}
        </header>
      ) : null}
      <div
        ref={place}
        tabIndex={0}
        aria-label={title}
        className="min-h-0 flex-1 overflow-auto"
      />
    </div>,
    grid,
  );
}
