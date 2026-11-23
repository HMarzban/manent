// An item moved by command is drawn anew in its new place, so focus and the scroll follow it there once the lists change.
import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

/** The element a person focuses to drag an item: the first focusable inside it, else the item itself. */
export function handleOf(item: HTMLElement): HTMLElement {
  const inner = item.querySelector("[tabindex]");
  return inner instanceof HTMLElement ? inner : item;
}

const itemIn = (area: HTMLElement, id: string): HTMLElement | null =>
  Array.from(area.querySelectorAll<HTMLElement>("[data-sortable-id]")).find(
    (item) => item.dataset["sortableId"] === id,
  ) ?? null;

interface Pending {
  id: string;
  /** Focus moves only when it was inside the lists as the item moved. */
  focus: boolean;
}

export interface FollowFocus {
  area: RefObject<HTMLDivElement | null>;
  /** Called as an item moves; the next change of `lists` brings it into view. */
  follow(id: string): void;
}

export function useFollowFocus(lists: readonly object[]): FollowFocus {
  const area = useRef<HTMLDivElement | null>(null);
  const pending = useRef<Pending | null>(null);
  useLayoutEffect(() => {
    const next = pending.current;
    pending.current = null;
    const item =
      next === null || area.current === null
        ? null
        : itemIn(area.current, next.id);
    if (next === null || item === null) return;
    item.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (next.focus) handleOf(item).focus({ preventScroll: true });
  }, [lists]);
  return {
    area,
    follow(id) {
      const focus = area.current?.contains(document.activeElement) ?? false;
      pending.current = { id, focus };
    },
  };
}
