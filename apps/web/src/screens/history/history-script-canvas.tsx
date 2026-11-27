// Strictly read-only Script canvas for `/s/$docId/history` with lockstep Side-by-side and Change-Aware Minimap TOC.
import { filterComparison } from "@manent/revisions";
import type { Comparison } from "@manent/revisions";
import type { VersionContent } from "@manent/sync-protocol";
import { EDITOR_WORDS, HISTORY_WORDS } from "@manent/ui";
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { setHistoryComparison } from "../../editor-host/changes.ts";
import {
  mountHistorySnapshotView,
  mountHistoryWorkingView,
  readWorkingSnapshot,
  scrollCanvasToBlock,
  visibleBlockAtTop,
} from "../../editor-host/history-page-view.ts";
import type { HistoryReadOnlyView } from "../../editor-host/history-page-view.ts";
import {
  liveEditor,
  subscribeLiveEditors,
} from "../../editor-host/live-editor.ts";
import { ScriptPageSkeleton } from "../../editor-host/script-page-skeleton.tsx";
import { useServices } from "../../services/context.tsx";
import { OutlineContext } from "../../state/bridge-contexts.ts";
import { useHistory } from "../../state/history.store.ts";
import type { OutlineRow } from "../../state/outline.store.ts";
import { HistoryMinimapToc } from "./history-minimap.tsx";
import { scriptMinimapItems } from "./history-minimap-logic.ts";

function useOutlineRows(): readonly OutlineRow[] {
  const outline = useContext(OutlineContext);
  const version = useSyncExternalStore(
    (listener) => (outline === null ? () => {} : outline.subscribe(listener)),
    () => (outline === null ? 0 : outline.count()),
    () => 0,
  );
  return useMemo(() => {
    if (outline === null || version === 0) return [];
    const list: OutlineRow[] = [];
    for (let i = 0; i < version; i++) {
      const row = outline.row(i);
      if (row !== null) list.push(row);
    }
    return list;
  }, [outline, version]);
}

function linkScrollPanes(
  primary: HTMLElement,
  secondary: HTMLElement,
  secondaryView: HistoryReadOnlyView,
): () => void {
  const echoed = new Map<Element, number>();
  const isEcho = (el: HTMLElement): boolean => {
    const match = echoed.get(el) === el.scrollTop;
    echoed.delete(el);
    return match;
  };
  const onPrimary = (): void => {
    if (isEcho(primary)) return;
    const blockId = visibleBlockAtTop(primary);
    if (blockId === null) return;
    secondaryView.scrollToBlock(blockId);
    echoed.set(secondary, secondary.scrollTop);
  };
  const onSecondary = (): void => {
    if (isEcho(secondary)) return;
    const blockId = visibleBlockAtTop(secondary);
    if (blockId === null) return;
    if (scrollCanvasToBlock(primary, blockId))
      echoed.set(primary, primary.scrollTop);
  };
  primary.addEventListener("scroll", onPrimary, { passive: true });
  secondary.addEventListener("scroll", onSecondary, { passive: true });
  return () => {
    primary.removeEventListener("scroll", onPrimary);
    secondary.removeEventListener("scroll", onSecondary);
  };
}

/**
 * Strictly read-only Script review & comparison canvas for `/s/$docId/history`.
 * Editing is blocked (`editable: () => false`); writers can select/copy text, compare versions in all four modes,
 * and jump rapidly through changes via the History Minimap TOC.
 */
export function HistoryScriptCanvas(props: {
  readonly docId: string;
  readonly content: VersionContent | null;
  readonly all: Comparison | null;
  readonly blockIds: readonly string[] | null;
}): ReactNode {
  const { docId, content, all, blockIds } = props;
  const { pagePorts, openScriptStore } = useServices();
  const baseline = useHistory("baseline");
  const mode = useHistory("mode");
  const { sceneIds } = useHistory("filter");
  const primaryRef = useRef<HTMLDivElement>(null);
  const olderRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);

  const hasLiveEditor = useSyncExternalStore(
    subscribeLiveEditors,
    () => liveEditor(docId) !== null,
    () => false,
  );
  const outlineRows = useOutlineRows();

  const filtered = useMemo(
    () => (all === null ? null : filterComparison(all, { sceneIds, blockIds })),
    [all, sceneIds, blockIds],
  );

  // Register active comparison so `history.nextChange` and `history.previousChange` step cleanly on `/s/$docId/history`
  useLayoutEffect(() => {
    if (baseline === null || mode === "as_it_was") {
      setHistoryComparison(docId, null);
      return undefined;
    }
    setHistoryComparison(docId, filtered);
    return () => setHistoryComparison(docId, null);
  }, [docId, baseline, mode, filtered]);

  const minimapItems = useMemo(
    () =>
      scriptMinimapItems(
        outlineRows,
        baseline === null || mode === "as_it_was" ? null : filtered,
      ),
    [outlineRows, baseline, mode, filtered],
  );

  const snapshot = useMemo(() => {
    if (!hasLiveEditor) return null;
    const store = openScriptStore(docId);
    return readWorkingSnapshot(docId, (key) =>
      store.get(key as Parameters<typeof store.get>[0]),
    );
  }, [hasLiveEditor, openScriptStore, docId]);

  const isSide = baseline !== null && mode === "side";
  const isAsItWas = baseline !== null && mode === "as_it_was";
  const waitingSnapshot =
    (isAsItWas || isSide) && content === null && baseline !== null;

  // Mount primary read-only sheet (either Working/diff or As-it-was historical snapshot)
  useLayoutEffect(() => {
    const el = primaryRef.current;
    if (el === null) return undefined;
    let primaryView: HistoryReadOnlyView | null = null;
    let olderView: HistoryReadOnlyView | null = null;
    let unlink: (() => void) | null = null;

    if (isAsItWas) {
      if (content === null) return undefined;
      primaryView = mountHistorySnapshotView({
        place: el,
        content,
        ports: pagePorts,
        offFontNote: EDITOR_WORDS.offFontNote,
        comparison: null,
        sceneIds: null,
      });
    } else if (snapshot !== null) {
      const changes =
        baseline !== null && content !== null && filtered !== null
          ? {
              baseline: content,
              comparison: filtered,
              display:
                mode === "asterisks"
                  ? ("asterisks" as const)
                  : ("page" as const),
            }
          : null;
      primaryView = mountHistoryWorkingView({
        place: el,
        snapshot,
        ports: pagePorts,
        offFontNote: EDITOR_WORDS.offFontNote,
        changes,
      });
      if (isSide && content !== null && olderRef.current !== null) {
        olderView = mountHistorySnapshotView({
          place: olderRef.current,
          content,
          ports: pagePorts,
          offFontNote: EDITOR_WORDS.offFontNote,
          comparison: all,
          sceneIds,
        });
        unlink = linkScrollPanes(el, olderRef.current, olderView);
      }
    }

    return () => {
      unlink?.();
      olderView?.destroy();
      primaryView?.destroy();
    };
  }, [
    isAsItWas,
    isSide,
    snapshot,
    baseline,
    content,
    filtered,
    all,
    mode,
    sceneIds,
    pagePorts,
  ]);

  // Track scroll progress & active scene for the Minimap TOC
  useEffect(() => {
    const el = primaryRef.current;
    if (el === null) return undefined;
    let frameId = 0;
    const sceneSet = new Set(minimapItems.map((item) => item.id));
    const sync = (): void => {
      frameId = 0;
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      setProgress(
        maxScroll === 0 ? 0 : Math.round((el.scrollTop / maxScroll) * 100),
      );
      const topId = visibleBlockAtTop(el);
      if (topId !== null && sceneSet.has(topId)) {
        setActiveSceneId(topId);
        return;
      }
      // Fallback: find the last outline heading above the viewport top
      const topY = el.getBoundingClientRect().top + 48;
      let latest: string | null = null;
      for (const item of minimapItems) {
        const node = el.querySelector(`[data-id=${JSON.stringify(item.id)}]`);
        if (node === null) continue;
        if (node.getBoundingClientRect().top <= topY) latest = item.id;
        else break;
      }
      if (latest !== null) setActiveSceneId(latest);
    };
    const onScroll = (): void => {
      if (frameId === 0) frameId = requestAnimationFrame(sync);
    };
    sync();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frameId !== 0) cancelAnimationFrame(frameId);
    };
  }, [minimapItems, mode, baseline, content]);

  const jumpTo = useCallback((blockId: string, itemId: string) => {
    setActiveSceneId(itemId);
    const el = primaryRef.current;
    if (el === null) return;
    if (!scrollCanvasToBlock(el, blockId)) scrollCanvasToBlock(el, itemId);
  }, []);

  const olderLabel =
    baseline === null
      ? ""
      : baseline.date === null
        ? baseline.title
        : `${baseline.title}, ${baseline.date}`;

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <HistoryMinimapToc
        docId={docId}
        items={minimapItems}
        activeId={activeSceneId}
        progress={progress}
        preferCollapsed={isSide}
        onJump={jumpTo}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-desk">
        {waitingSnapshot || (!hasLiveEditor && !isAsItWas) ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <ScriptPageSkeleton />
          </div>
        ) : isSide ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-line lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            <section
              aria-label={olderLabel}
              className="flex min-h-0 min-w-0 flex-col"
            >
              <header className="shrink-0 border-b border-line bg-chrome px-3 py-1.5 text-meta font-medium text-fg-muted">
                {olderLabel}
              </header>
              <div
                ref={olderRef}
                tabIndex={-1}
                className="mn-desk min-h-0 flex-1 overflow-auto p-3! outline-none [&>.mn-zoom]:mx-auto"
              />
            </section>
            <section
              aria-label={HISTORY_WORDS.workingLabel}
              className="flex min-h-0 min-w-0 flex-col"
            >
              <header className="shrink-0 border-b border-line bg-chrome px-3 py-1.5 text-meta font-medium text-fg-muted">
                {HISTORY_WORDS.workingLabel}
              </header>
              <div
                ref={primaryRef}
                data-history-canvas={docId}
                tabIndex={-1}
                className="mn-desk min-h-0 flex-1 overflow-auto p-3! outline-none [&>.mn-zoom]:mx-auto"
              />
            </section>
          </div>
        ) : (
          <div
            ref={primaryRef}
            data-history-canvas={docId}
            tabIndex={-1}
            aria-label={
              baseline === null ? HISTORY_WORDS.workingPreview : olderLabel
            }
            className="mn-desk min-h-0 flex-1 overflow-auto p-3! outline-none [&>.mn-zoom]:mx-auto"
          />
        )}
      </div>
    </div>
  );
}
