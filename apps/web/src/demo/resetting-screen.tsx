// What stands in for every screen while the demo resets, and the reload that ends it.
import { DEMO_WORDS } from "@manent/ui";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { ControlState } from "../api.ts";
import { focusHeading } from "../focus.ts";

/**
 * True from the server reading resetting until the page reloads, which it does once the demo answers with a seed other
 * than the one the reset replaces, so that the new seed clears this browser's copies. A reset that fails, or a control
 * that stops answering, ends it and leaves the page as it was.
 */
export function useResetting(
  state: ControlState | null,
  seedId: string | null,
): boolean {
  // the seed being replaced, kept from one answer to the next; null while no reset is under way. A running server is
  // no sign the reset is over: a question asked before it began may still be answered after
  const [replacing, setReplacing] = useState<string | null>(null);
  const next =
    state === "resetting"
      ? (replacing ?? seedId)
      : state === "failed" || state === "unreachable"
        ? null
        : replacing;
  if (next !== replacing) setReplacing(next);
  const reseeded = next !== null && seedId !== null && seedId !== next;
  useEffect(() => {
    if (reseeded) window.location.reload();
  }, [reseeded]);
  return next !== null;
}

/** Its heading takes focus, as every screen's does. */
export function ResettingScreen(): ReactNode {
  useEffect(() => {
    focusHeading(document);
  }, []);
  return (
    <div className="mx-auto flex w-full max-w-content-wide flex-col px-6 py-12">
      <h1 tabIndex={-1} className="text-display outline-none">
        {DEMO_WORDS.resetting}
      </h1>
      <p className="mt-1 text-ui text-fg-muted">{DEMO_WORDS.resettingBody}</p>
    </div>
  );
}
