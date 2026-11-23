// What is open beside the page, and opening and closing it; written only by interface events.
import { createValue, useSubscribable } from "@manent/ui";
import { guardWrite } from "../state/guard.ts";
import { panelsActions } from "../state/panels.store.ts";
import type { BesideKindId } from "./kinds.ts";

export interface BesideOpen {
  docId: string;
  kind: BesideKindId;
  /** The block the caret opens at; null for where the person left it. */
  at: { blockId: string } | null;
}

const shown = createValue<BesideOpen | null>(null);

/** What is open beside the page; null while nothing is. */
export function useBeside(): BesideOpen | null {
  return useSubscribable(shown);
}

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
  shown.set({ docId, kind, at });
  panelsActions.close("side");
}

/** Nothing is beside the page any more. */
export function closeBeside(): void {
  if (shown.get() === null) return;
  guardWrite("beside");
  shown.set(null);
}
