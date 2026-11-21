// The test build's stand-in document: one per person and device, made through the sync's test hooks as the Library makes a script.

/** The stand-in document of `userId` on device `deviceId`: the device id's first 24 characters, then the last 12 hex digits of the user id's UTF-8 bytes. */
function standInDocId(userId: string, deviceId: string): string {
  const hex = Array.from(new TextEncoder().encode(userId), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${deviceId.slice(0, 24)}${hex.padStart(12, "0").slice(-12)}`;
}

/**
 * What makes the stand-in: the test build's `__manent.sync.createScript`, null until the person's sync has set it, and
 * nothing where the page has no `__manent` (the shell drawn in a unit test, whose documents are the test's).
 */
function createScriptHook(): ((docId: string) => Promise<void>) | null {
  const manent: unknown = Reflect.get(globalThis, "__manent");
  if (typeof manent !== "object" || manent === null) return async () => {};
  const sync: unknown = Reflect.get(manent, "sync");
  const create: unknown =
    typeof sync === "object" && sync !== null
      ? Reflect.get(sync, "createScript")
      : null;
  if (typeof create !== "function") return null;
  return async (docId) => {
    await Reflect.apply(create, sync, [docId]);
  };
}

/**
 * Makes the stand-in document of `userId` on `deviceId` once the person's sync has set its hooks, looking again every
 * 16 ms until then, and tells `made` its id. The returned function stops.
 */
export function makeStandInScript(options: {
  userId: string;
  deviceId: string;
  schedule: (fn: () => void, delayMs: number) => () => void;
  made: (docId: string) => void;
}): () => void {
  const docId = standInDocId(options.userId, options.deviceId);
  let live = true;
  let cancel: (() => void) | null = null;
  const attempt = (): void => {
    const create = createScriptHook();
    if (create === null) {
      cancel = options.schedule(attempt, 16);
      return;
    }
    void create(docId).then(() => {
      if (live) options.made(docId);
    });
  };
  attempt();
  return () => {
    live = false;
    cancel?.();
  };
}
