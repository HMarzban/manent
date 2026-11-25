// Where a version is drawn: over the page As it was, or beside it Side by side in the frame of what is beside the page.
// The live editor stays mounted, keeps its caret, scroll and undo, and keeps receiving remote edits.
import { ENGINE_VERSION, engineFor } from "@manent/pagination";
import { compareModeOf } from "@manent/revisions";
import type { CompareNote, Comparison } from "@manent/revisions";
import { SCHEMA_VERSION } from "@manent/schema";
import type { VersionContent } from "@manent/sync-protocol";
import { EDITOR_WORDS, HISTORY_WORDS } from "@manent/ui";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { BesideFrame } from "../../beside/beside-frame.tsx";
import {
  liveEditor,
  livePagination,
  subscribeLiveEditors,
} from "../../editor-host/live-editor.ts";
import { ScriptPageSkeleton } from "../../editor-host/script-page-skeleton.tsx";
import { mountVersionView } from "../../editor-host/version-view.ts";
import type { VersionView } from "../../editor-host/version-view.ts";
import { baselineAt } from "../../history/baseline.ts";
import { docOfContent } from "../../history/content-doc.ts";
import { useServices } from "../../services/context.tsx";
import { useHistory } from "../../state/history.store.ts";
import { useOpenDocument } from "./open-document.ts";

const PAGE_REGION = "[data-region='page']";

const NOTES: Readonly<Record<CompareNote, string>> = Object.freeze({
  newer: HISTORY_WORDS.compareNewer,
  engines: HISTORY_WORDS.compareEngines,
});

type BaselineState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly content: VersionContent }
  | { readonly kind: "unavailable" };

const LOADING_BASELINE: BaselineState = Object.freeze({ kind: "loading" });
const UNAVAILABLE_BASELINE: BaselineState = Object.freeze({
  kind: "unavailable",
});

const baselineStates = new Map<string, BaselineState>();
const baselineListeners = new Set<() => void>();

function notifyBaseline(): void {
  for (const listener of baselineListeners) listener();
}

function subscribeBaseline(listener: () => void): () => void {
  baselineListeners.add(listener);
  return () => {
    baselineListeners.delete(listener);
  };
}

function setBaselineState(entryKey: string, next: BaselineState): void {
  if (baselineStates.get(entryKey) === next) return;
  baselineStates.set(entryKey, next);
  notifyBaseline();
}

/** The baseline's content once it has loaded; null while it loads, and when it cannot be had. */
export function useBaselineContent(docId: string): VersionContent | null {
  const { history } = useServices();
  const baseline = useHistory("baseline");
  const at = baselineAt(baseline);
  const key = JSON.stringify(at);
  const entryKey = `${docId}:${key}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    state: BaselineState;
  } | null>(null);
  useEffect(() => {
    if (at === null) return undefined;
    let shown = true;
    setBaselineState(entryKey, LOADING_BASELINE);
    void history
      .content(docId, at)
      .then(
        (content): BaselineState =>
          content === null ? UNAVAILABLE_BASELINE : { kind: "ready", content },
        () => UNAVAILABLE_BASELINE,
      )
      .then((state) => {
        if (!shown) return;
        setBaselineState(entryKey, state);
        setLoaded({ key, state });
      });
    return () => {
      shown = false;
      if (baselineStates.delete(entryKey)) notifyBaseline();
    };
    // `key` names `at`, which is made anew on every render
  }, [history, docId, key, entryKey]);
  const state = loaded?.key === key ? loaded.state : LOADING_BASELINE;
  return state.kind === "ready" ? state.content : null;
}

/** The header's line: why the changes are shown by text and element only, when they are. */
export function noteOf(content: VersionContent, docId: string): string | null {
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
 * side makes for the other is not followed back.
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
  live.addEventListener("scroll", fromLive, { passive: true });
  older.addEventListener("scroll", fromOlder, { passive: true });
  return () => {
    live.removeEventListener("scroll", fromLive);
    older.removeEventListener("scroll", fromOlder);
  };
}

/**
 * The version of the baseline, `content`, drawn in the page's grid area; nothing while the window has no page. Side
 * by side marks `comparison`, the baseline against Working, unfiltered, and waits for it.
 */
export function VersionPane(props: {
  docId: string;
  position: "page" | "beside";
  content: VersionContent | null;
  comparison: Comparison | null;
}): ReactNode {
  const { docId, position, content } = props;
  const { pagePorts, commands } = useServices();
  const status = useOpenDocument(docId)?.status ?? null;
  const baseline = useHistory("baseline");
  const { sceneIds } = useHistory("filter");
  const place = useRef<HTMLDivElement>(null);
  const page = document.querySelector<HTMLElement>(PAGE_REGION);
  const beside = position === "beside";
  const comparison = beside ? props.comparison : null;
  const scope = beside ? sceneIds : null;
  const entryKey = `${docId}:${JSON.stringify(baselineAt(baseline))}`;
  const baselineState = useSyncExternalStore(
    subscribeBaseline,
    () => baselineStates.get(entryKey) ?? UNAVAILABLE_BASELINE,
    () => UNAVAILABLE_BASELINE,
  );
  const hasLiveEditor = useSyncExternalStore(
    subscribeLiveEditors,
    () => liveEditor(docId) !== null,
    () => false,
  );

  useLayoutEffect(() => {
    const element = place.current;
    if (element === null || content === null) return undefined;
    if (beside && comparison === null) return undefined;
    const view: VersionView = mountVersionView({
      place: element,
      content,
      ports: pagePorts,
      offFontNote: EDITOR_WORDS.offFontNote,
      comparison,
      sceneIds: scope,
      engineFor,
    });
    // a read-only page has no caret, so the view itself holds the focus ring
    element.focus({ preventScroll: true });
    const top = beside && page !== null ? blockAtTop(page) : null;
    if (top !== null) view.scrollToBlock(top);
    const stop =
      beside && page !== null ? sideBySide(page, element, view) : null;
    return () => {
      stop?.();
      view.destroy();
    };
  }, [content, beside, comparison, scope, pagePorts, page]);

  if (baseline === null) return null;
  const title =
    baseline.date === null
      ? baseline.title
      : `${baseline.title}, ${baseline.date}`;
  const comparing =
    beside &&
    content !== null &&
    comparison === null &&
    hasLiveEditor &&
    docOfContent(content) !== null;
  const loading =
    (content === null && baselineState.kind === "loading") || comparing;
  const body = loading ? (
    <ScriptPageSkeleton />
  ) : (
    <div
      ref={place}
      tabIndex={-1}
      aria-label={title}
      className="min-h-0 flex-1 overflow-auto outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
    />
  );
  if (beside) {
    const note = content === null ? null : noteOf(content, docId);
    return (
      <BesideFrame
        kind="version"
        title={title}
        status={status}
        onClose={() => commands.run("history.backToWorking", "control")}
        lines={
          note === null ? null : (
            <p className="text-meta text-fg-muted">{note}</p>
          )
        }
      >
        {body}
      </BesideFrame>
    );
  }
  const grid = page?.parentElement ?? null;
  if (grid === null) return null;
  return createPortal(
    <div
      data-version-pane
      data-region="page"
      className="z-10 flex min-h-0 flex-col bg-desk"
      style={{ gridArea: "page" }}
    >
      {body}
    </div>,
    grid,
  );
}
