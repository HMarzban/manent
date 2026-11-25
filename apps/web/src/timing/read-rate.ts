// The read rate in characters per second for a script, following its project's `project.readRate` setting.
import { DEFAULT_READ_RATE } from "@manent/pagination";
import type { SettingsStore } from "@manent/settings";
import type { Subscribable } from "@manent/ui";
import { archiveSource } from "../archive/archive-source.ts";

function storeOf(docId: string): SettingsStore | null {
  const services = archiveSource.get();
  if (services === null) return null;
  try {
    return services.openScriptStore(docId);
  } catch {
    // isolated tests without an open script store fall back to the default read rate
    return null;
  }
}

/** Characters of dialogue per second used to time `docId`; updates live when the project's read rate changes. */
export function readRateOf(docId: string): Subscribable<number> {
  const read = (): number =>
    storeOf(docId)?.get("project.readRate") ?? DEFAULT_READ_RATE;
  return {
    get: read,
    subscribe(listener) {
      const store = storeOf(docId);
      if (store === null) return () => {};
      let last = store.get("project.readRate");
      return store.subscribe("project.readRate", () => {
        const next = store.get("project.readRate");
        if (Object.is(next, last)) return;
        last = next;
        listener(next);
      });
    },
  };
}
