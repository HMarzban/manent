// This device's id, made once and kept in this origin's storage.

const DEVICE_ID_KEY = "manent.device.id";

/** The id kept under `manent.device.id`, or a new one from `randomId`, kept there; storage that refuses gives a new id each session. */
export function readDeviceId(
  storage: Storage | null,
  randomId: () => string,
): string {
  try {
    const kept = storage?.getItem(DEVICE_ID_KEY) ?? null;
    if (kept !== null && kept !== "") return kept;
    const id = randomId();
    storage?.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    // the storage refuses: this session's id is not kept
    return randomId();
  }
}
