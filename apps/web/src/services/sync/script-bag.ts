// A script's settings as the settings store reads them: the handle's settings, each write a request to the server.
import { scriptSettings } from "@manent/crdt";
import { SETTINGS, UNSET } from "@manent/settings";
import type { Bag } from "@manent/settings";
import type { DocHandle } from "@manent/sync-client";

type Shown = Readonly<Record<string, unknown>>;

/** The keys whose values differ, compared as JSON. */
function changedKeys(before: Shown, after: Shown): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}

/**
 * `read` is the handle's settings with every waiting request laid over them; `write` asks for each key, and UNSET asks
 * for the definition's default. A refused request goes back, told as a remote change. `writable` says whether the
 * person may change the script's settings now.
 */
export function createScriptBag(
  handle: DocHandle,
  writable: () => boolean,
): Bag {
  let writing = false;
  return {
    read: () => handle.settings.get(),
    provenance(key) {
      const meta = scriptSettings(handle.doc()).meta(key);
      return meta === null
        ? null
        : {
            at: meta.setAt,
            on: null,
            byUserId: meta.userId,
            was: meta.replaced,
          };
    },
    write(patch) {
      writing = true;
      try {
        for (const [key, value] of Object.entries(patch)) {
          const def = SETTINGS.all.find((d) => d.key === key);
          if (value !== UNSET) handle.setSetting(key, value);
          else if (def !== undefined) handle.setSetting(key, def.default);
        }
      } finally {
        writing = false;
      }
    },
    subscribe(listener) {
      let before = handle.settings.get();
      return handle.settings.subscribe((after) => {
        const keys = changedKeys(before, after);
        before = after;
        if (keys.length > 0) listener(keys, writing ? "local" : "remote");
      });
    },
    canWrite: () => writable(),
  };
}
