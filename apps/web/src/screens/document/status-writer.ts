// The status beside the title, written straight into its two text nodes, so a change of words renders nothing.
import { SYNCED_AFTER_MS, statusText } from "@manent/ui";
import type { StatusFacts, StatusWords, Subscribable } from "@manent/ui";

/** The shape drawn before a slot's words: one per kind of statement, told apart without colour. */
export type DeviceShape = "saved" | "not-saved";
/** The second slot's shape, which is also the shape of one sentence across both slots. */
export type ServerShape =
  | "not-saved"
  | "view-only"
  | "synced"
  | "waiting"
  | "offline"
  | "unreachable"
  | "browser-only"
  | "attention";

interface Shown {
  words: StatusWords;
  /** The device slot's shape; null while one sentence spans both slots. */
  device: DeviceShape | null;
  server: ServerShape;
}

function serverShape(facts: StatusFacts): ServerShape {
  if (facts.neverSynced) return "browser-only";
  if (facts.server === "access_removed" || facts.server === "deleted")
    return "attention";
  if (facts.network === "offline") return "offline";
  switch (facts.server) {
    case "synced":
      return "synced";
    case "syncing":
      return "waiting";
    case "sign_in":
      return "offline";
    case "unreachable":
    case "server_old":
    case "app_old":
      return "unreachable";
  }
}

/** The words and shapes of `facts`, the shapes following the same precedence as the words. */
function shownOf(facts: StatusFacts): Shown {
  const words = statusText(facts);
  if (!words.spans)
    return {
      words,
      device: facts.device === "failing" ? "not-saved" : "saved",
      server: serverShape(facts),
    };
  return {
    words,
    device: null,
    server: facts.device === "failing" ? "not-saved" : "view-only",
  };
}

const isBusy = (facts: StatusFacts): boolean =>
  facts.server === "syncing" || facts.waiting > 0;

const isSameWords = (a: StatusWords, b: StatusWords): boolean =>
  a.device === b.device &&
  a.server === b.server &&
  a.tone === b.tone &&
  a.spans === b.spans;

/** `last`: what was written before, null before the first. */
function paint(
  shown: Shown,
  last: Shown | null,
  nodes: { device: Text; server: Text; root: HTMLElement },
): void {
  // a change of facts that keeps the words, such as one more waiting while syncing, touches nothing on the page
  if (
    last !== null &&
    isSameWords(shown.words, last.words) &&
    shown.device === last.device &&
    shown.server === last.server
  )
    return;
  const { words } = shown;
  nodes.device.data = words.device ?? "";
  nodes.server.data = words.server;
  nodes.root.dataset.tone = words.tone;
  nodes.root.toggleAttribute("data-spans", words.spans);
  nodes.root.dataset.deviceShape = shown.device ?? "";
  nodes.root.dataset.serverShape = shown.server;
  // the device alert is the one status said at once; every other status is read when asked for
  if (words.tone === "alert") nodes.root.setAttribute("role", "alert");
  else nodes.root.removeAttribute("role");
}

/**
 * Writes the status of `source` now and on every change, its words into the two nodes and each slot's shape into
 * `root`'s `data-device-shape` and `data-server-shape`; the returned function stops it. `Synced` waits until nothing
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
  let painted: Shown | null = null;

  const write = (facts: StatusFacts): void => {
    cancel?.();
    cancel = null;
    if (isBusy(facts)) busy = true;
    else if (busy) {
      busy = false;
      syncedAt = now() + SYNCED_AFTER_MS;
    }
    const held = facts.server === "synced" && now() < syncedAt;
    const shown = shownOf(held ? { ...facts, server: "syncing" } : facts);
    paint(shown, painted, options);
    painted = shown;
    if (held) cancel = schedule(() => write(source.get()), syncedAt - now());
  };

  write(source.get());
  const unsubscribe = source.subscribe(write);
  return () => {
    unsubscribe();
    cancel?.();
  };
}
