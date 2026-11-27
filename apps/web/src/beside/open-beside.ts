// What is open beside the page, and opening and closing it; written only by interface events.
import { createFocusOrigin, createValue, useSubscribable } from "@manent/ui";
import { guardWrite } from "../state/guard.ts";
import { panelsActions } from "../state/panels.store.ts";
import type { BesideKindId } from "./kinds.ts";

/** The attribute on the body of what is beside the page, below its header row and its state bar. */
export const BESIDE_BODY = "data-beside-body";

export interface BesideOpen {
  docId: string;
  kind: BesideKindId;
  /** The block the caret opens at; null for where the person left it. */
  at: { blockId: string } | null;
}

const shown = createValue<BesideOpen | null>(null);
const opener = createFocusOrigin();
let hasOpener = false;

/** What is open beside the page; null while nothing is. */
export function useBeside(): BesideOpen | null {
  return useSubscribable(shown);
}

/** Point-in-time read of what is open beside the page (no subscription). */
export const currentBeside = (): BesideOpen | null => shown.get();

/**
 * Opens `docId` as `kind` beside the page, in place of what was beside it, with its caret at `at`'s block when `at` is
 * given. It takes the side position, so the side panel closes.
 */
export function openBeside(
  docId: string,
  kind: BesideKindId,
  at: { blockId: string } | null,
): void {
  guardWrite("beside");
  if (shown.get() === null && typeof document !== "undefined") {
    const active = document.activeElement;
    if (
      active !== null &&
      active !== document.body &&
      active.closest("[data-beside]") === null
    ) {
      opener.push(active);
      hasOpener = true;
    }
  }
  shown.set({ docId, kind, at });
  if (panelsActions.get().side.tab !== "tour") panelsActions.close("side");
}

/** Nothing is beside the page any more; restores focus to the opener when focus was inside beside or lost to the body. */
export function closeBeside(fallback?: () => void): void {
  if (shown.get() === null) return;
  guardWrite("beside");
  const shouldRestore =
    typeof document !== "undefined" &&
    (document.activeElement === null ||
      document.activeElement === document.body ||
      document.activeElement.closest("[data-beside]") !== null);
  shown.set(null);
  if (shouldRestore) {
    if (hasOpener) {
      hasOpener = false;
      opener.restore(() => fallback?.());
    } else {
      fallback?.();
    }
  } else if (hasOpener) {
    hasOpener = false;
    opener.pop();
  }
}
