// One item a person can drag, and the line that shows where a dragged item will land.
import { SortableKeyboardPlugin } from "@dnd-kit/dom/sortable";
import { useSortable } from "@dnd-kit/react/sortable";
import { cn } from "cn";
import { memo, useCallback, useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { handleOf } from "./follow-focus.ts";
import { useDropMark } from "./sortable-area.tsx";

export type Orientation = "vertical" | "grid";

// without the library's optimistic sorting, which moves elements behind React's back: the drop indicator shows the place instead
const ITEM_PLUGINS = [SortableKeyboardPlugin];

// beyond an item's edge and its focus ring, since the dragged item is drawn over the one it is dropped on; a grid's
// in the gap between items; an empty list's inside its top edge
const EDGE: Readonly<
  Record<Orientation | "list", Record<"before" | "after", string>>
> = {
  vertical: {
    before: "inset-x-0 -top-1.5 border-t-2",
    after: "inset-x-0 -bottom-1.5 border-b-2",
  },
  grid: {
    before: "inset-y-0 -start-2 border-s-2",
    after: "inset-y-0 -end-2 border-e-2",
  },
  list: {
    before: "inset-x-0 top-0 border-t-2",
    after: "inset-x-0 bottom-0 border-b-2",
  },
};

interface DropIndicatorProps {
  /** The item, or the empty list, this indicator belongs to. */
  id: string;
  layout: Orientation | "list";
}

/** An accent line on the edge where the dragged item will land; a border, so forced colours still draw it. */
export function DropIndicator({ id, layout }: DropIndicatorProps): ReactNode {
  const mark = useDropMark();
  if (mark?.id !== id) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute border-accent-solid animate-in fade-in-0 duration-(--dur-fast) ease-out",
        EDGE[layout][mark.edge],
      )}
    />
  );
}

interface SortableItemProps {
  id: string;
  index: number;
  group: string;
  orientation: Orientation;
  children: ReactNode;
}

interface BoundHandle {
  id: string;
  box: HTMLDivElement;
  handle: HTMLElement;
  handleRef: (element: Element | null) => void;
}

export const SortableItem = memo(function SortableItem({
  id,
  index,
  group,
  orientation,
  children,
}: SortableItemProps): ReactNode {
  const box = useRef<HTMLDivElement | null>(null);
  const bound = useRef<BoundHandle | null>(null);
  const { ref, handleRef, isDragging } = useSortable({
    id,
    index,
    group,
    plugins: ITEM_PLUGINS,
  });
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      box.current = node;
      if (node === null) bound.current = null;
      ref(node);
    },
    [ref],
  );
  useLayoutEffect(() => {
    const node = box.current;
    if (node === null) return;
    const prev = bound.current;
    if (
      prev !== null &&
      prev.id === id &&
      prev.box === node &&
      prev.handleRef === handleRef &&
      prev.handle !== node &&
      prev.handle.isConnected &&
      prev.handle.hasAttribute("tabindex")
    )
      return;
    const handle = handleOf(node);
    // the library would describe the item as "draggable"; an empty description leaves its own role to be read
    if (!handle.hasAttribute("aria-roledescription"))
      handle.setAttribute("aria-roledescription", "");
    bound.current = { id, box: node, handle, handleRef };
    handleRef(handle);
  }, [handleRef, id, children]);
  return (
    <div
      ref={attach}
      data-sortable-id={id}
      className={cn(
        "relative",
        isDragging &&
          "rounded-control bg-overlay shadow-overlay ring-1 ring-line",
      )}
    >
      {children}
      <DropIndicator id={id} layout={orientation} />
    </div>
  );
});
