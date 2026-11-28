// Strictly read-only Rundown review & comparison canvas for `/s/$docId/history` with Change-Aware Minimap TOC.
import type { RundownComparison } from "@manent/revisions";
import type { RundownColumnId, RundownJSON } from "@manent/schema";
import { HISTORY_WORDS } from "@manent/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { RundownHistoryOverlay } from "../document/history-rundown-diff.tsx";
import { AsItWasGrid } from "../document/history-rundown-nav.tsx";
import type { RundownNavChange } from "../document/history-rundown-nav.tsx";
import { HistoryMinimapToc } from "./history-minimap.tsx";
import { rundownMinimapItems } from "./history-minimap-logic.ts";

export function HistoryRundownCanvas(props: {
  readonly docId: string;
  readonly currentRundown: RundownJSON | null;
  readonly baselineRundown: RundownJSON | null;
  readonly baselineTitle: string | null;
  readonly versionId: string | null;
  readonly refText: string;
  readonly mode: "page" | "side" | "as_it_was";
  readonly comparison: RundownComparison | null;
  readonly columns: readonly RundownColumnId[];
  readonly currentChange: RundownNavChange | null;
  readonly canEdit: boolean;
  readonly restoreLabel: string;
  readonly backLabel: string;
  readonly onBack: () => void;
}): ReactNode {
  const {
    docId,
    currentRundown,
    baselineRundown,
    baselineTitle,
    versionId,
    refText,
    mode,
    comparison,
    columns,
    currentChange,
    canEdit,
    restoreLabel,
    backLabel,
    onBack,
  } = props;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const items = useMemo(
    () =>
      rundownMinimapItems(
        mode === "as_it_was" && baselineRundown !== null
          ? baselineRundown
          : currentRundown,
        baselineRundown === null || mode === "as_it_was" ? null : comparison,
      ),
    [currentRundown, baselineRundown, comparison, mode],
  );

  useEffect(() => {
    if (currentChange !== null) setActiveId(currentChange.rowId);
  }, [currentChange]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el === null) return undefined;
    const onScroll = (): void => {
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      setProgress(max === 0 ? 0 : Math.round((el.scrollTop / max) * 100));
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [items, mode]);

  const jumpTo = useCallback((rowId: string, itemId: string) => {
    setActiveId(itemId);
    const root = scrollerRef.current;
    if (root === null) return;
    const target = root.querySelector<HTMLElement>(
      `[data-id=${JSON.stringify(rowId)}]`,
    );
    target?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <HistoryMinimapToc
        docId={docId}
        items={items}
        activeId={activeId}
        progress={progress}
        isRundown
        onJump={jumpTo}
      />
      <div
        ref={scrollerRef}
        data-rundown-page=""
        data-history-canvas={docId}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-auto overscroll-contain bg-chrome"
      >
        {baselineRundown !== null && baselineTitle !== null ? (
          <RundownHistoryOverlay
            inline
            docId={docId}
            baselineTitle={baselineTitle}
            versionId={versionId}
            refText={refText}
            mode={mode}
            baselineRundown={baselineRundown}
            comparison={comparison}
            columns={columns}
            currentChange={currentChange}
            canEdit={canEdit}
            restoreLabel={restoreLabel}
            backLabel={backLabel}
            onBack={onBack}
          />
        ) : currentRundown !== null ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <header className="shrink-0 border-b border-line bg-chrome px-3 py-2 text-meta font-medium text-fg-muted">
              {HISTORY_WORDS.workingPreview}
            </header>
            <div className="min-h-0 flex-1 overflow-auto">
              <AsItWasGrid rundown={currentRundown} columns={columns} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
