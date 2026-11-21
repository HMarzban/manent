// The status beside the title, written straight into its two text nodes, so a change of words renders nothing.
import { SYNCED_AFTER_MS, statusText } from "@manent/ui";
import type { StatusFacts, StatusWords, Subscribable } from "@manent/ui";

const isBusy = (facts: StatusFacts): boolean =>
  facts.server === "syncing" || facts.waiting > 0;

const isSameWords = (a: StatusWords, b: StatusWords): boolean =>
  a.device === b.device &&
  a.server === b.server &&
  a.tone === b.tone &&
  a.spans === b.spans;

/** `last`: the words written before, null before the first. */
function paint(
  words: StatusWords,
  last: StatusWords | null,
  nodes: { device: Text; server: Text; root: HTMLElement },
): void {
  // a change of facts that keeps the words, such as one more waiting while syncing, touches nothing on the page
  if (last !== null && isSameWords(words, last)) return;
  nodes.device.data = words.device ?? "";
  nodes.server.data = words.server;
  nodes.root.dataset.tone = words.tone;
  nodes.root.toggleAttribute("data-spans", words.spans);
  // the device alert is the one status said at once; every other status is read when asked for
  if (words.tone === "alert") nodes.root.setAttribute("role", "alert");
  else nodes.root.removeAttribute("role");
}

/**
 * Writes the status of `source` now and on every change; the returned function stops it. `Synced` waits until nothing
 * has waited for `SYNCED_AFTER_MS`, so the status does not flip at every pause in typing; `Syncing…` is written at once.
 */
export function createStatusWriter(options: {
  device: Text;
  server: Text;
  root: HTMLElement;
  source: Subscribable<StatusFacts>;
  now: () => number;
  schedule: (fn: () => void, delayMs: number) => () => void;
}): () => void {
  const { source, now, schedule } = options;
  let busy = false;
  let syncedAt = 0;
  let cancel: (() => void) | null = null;
  let painted: StatusWords | null = null;

  const write = (facts: StatusFacts): void => {
    cancel?.();
    cancel = null;
    if (isBusy(facts)) busy = true;
    else if (busy) {
      busy = false;
      syncedAt = now() + SYNCED_AFTER_MS;
    }
    const held = facts.server === "synced" && now() < syncedAt;
    const words = statusText(held ? { ...facts, server: "syncing" } : facts);
    paint(words, painted, options);
    painted = words;
    if (held) cancel = schedule(() => write(source.get()), syncedAt - now());
  };

  write(source.get());
  const unsubscribe = source.subscribe(write);
  return () => {
    unsubscribe();
    cancel?.();
  };
}
