// Single row inside the Version history Minimap TOC outline card.
import { HISTORY_WORDS, cn } from "@manent/ui";
import type { ReactNode } from "react";
import { minimapItemLabel } from "./history-minimap-logic.ts";
import type { HistoryMinimapItem } from "./history-minimap-logic.ts";

export function MinimapRow(props: {
  readonly item: HistoryMinimapItem;
  readonly index: number;
  readonly active: boolean;
  readonly onJump: (blockId: string, itemId: string) => void;
}): ReactNode {
  const { item, index, active, onJump } = props;
  const changed = item.changeCount > 0;
  const base =
    "mn-row w-full rounded-control px-2 text-start hover:bg-subtle active:bg-control";
  const rowClass =
    item.kind === "act"
      ? cn(
          base,
          "flex items-center gap-2 py-1.5 text-ui font-semibold text-fg",
          index > 0 && "mt-1 border-t border-line pt-2",
        )
      : item.kind === "section"
        ? `${base} flex items-center gap-2 py-1 text-meta text-fg-muted italic`
        : `${base} flex items-center gap-2 py-1 text-ui`;

  return (
    <button
      type="button"
      data-outline-item="true"
      data-changed={changed ? "true" : undefined}
      aria-current={active ? "location" : undefined}
      onClick={() => onJump(item.targetBlockId, item.id)}
      className={rowClass}
    >
      {item.kind === "scene" && item.number !== null ? (
        <span className="w-5 shrink-0 text-end text-meta tnum text-fg-muted">
          {item.number}
        </span>
      ) : null}
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          item.omitted ? "text-fg-muted" : changed ? "font-medium text-fg" : "",
        )}
        title={minimapItemLabel(item)}
      >
        {item.omitted ? minimapItemLabel(item) : item.heading}
      </span>
      {changed ? (
        <span
          title={HISTORY_WORDS.sceneChangesLabel(item.changeCount)}
          className="shrink-0 rounded-full border border-ok bg-subtle px-1.5 py-0 text-micro font-medium tnum text-ok"
        >
          {item.changeCount}
        </span>
      ) : null}
    </button>
  );
}
