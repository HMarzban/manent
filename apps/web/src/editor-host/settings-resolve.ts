// Live script settings bag: while page numbers are unlocked, the six followed keys read from the project's
// settings once the project has set them; once locked, the script keeps its own frozen values.
import {
  FOLLOWED_SCRIPT_KEYS,
  isFollowedProjectKeySet,
  projectTwinOf,
  resolveFollowed,
  scriptTwinOf,
} from "@manent/settings";
import type { Bag } from "@manent/settings";

type BagListener = Parameters<Bag["subscribe"]>[0];

const FOLLOWED_KEYS: readonly string[] = Object.freeze(
  Object.keys(FOLLOWED_SCRIPT_KEYS),
);

/**
 * Wraps `script` so unlocked scripts read followed keys from `project` whenever the project has set them.
 * Active inherited keys report `canWrite: false` and `provenance: null`, and project or lock transitions
 * notify subscribers immediately.
 */
export function followedScriptBag(options: {
  script: Bag;
  project: Bag | null;
  locked: () => boolean;
  onLockChange?: (listener: () => void) => () => void;
}): Bag {
  const { script, project, locked, onLockChange } = options;

  const isInherited = (key: string): boolean => {
    if (locked() || project === null) return false;
    const twin = projectTwinOf(key);
    return twin !== null && isFollowedProjectKeySet(twin, project.read());
  };

  return Object.freeze({
    read() {
      const own = script.read();
      if (locked() || project === null) return own;
      return resolveFollowed(own, project.read());
    },
    provenance(key: string) {
      return isInherited(key) ? null : script.provenance(key);
    },
    write(patch: Readonly<Record<string, unknown>>) {
      script.write(patch);
    },
    canWrite(key: string) {
      return isInherited(key) ? false : script.canWrite(key);
    },
    subscribe(listener: BagListener) {
      const stopScript = script.subscribe(listener);
      const stopProject =
        project?.subscribe((keys, origin) => {
          if (locked()) return;
          const mapped = keys
            .map((key) => scriptTwinOf(key))
            .filter((key): key is string => key !== null);
          if (mapped.length > 0) listener(mapped, origin);
        }) ?? (() => {});
      let wasLocked = locked();
      const stopLock =
        onLockChange?.(() => {
          const nowLocked = locked();
          if (nowLocked === wasLocked) return;
          wasLocked = nowLocked;
          listener(FOLLOWED_KEYS, "remote");
        }) ?? (() => {});
      return () => {
        stopScript();
        stopProject();
        stopLock();
      };
    },
  });
}
