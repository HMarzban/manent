// The driver of a script presented to the room: current driver state, HTTP requests, and CONTROL driver_changed events.
import type { DocHandle } from "@manent/sync-client";
import type {
  DriverAnswer,
  DriverChanged,
  DriverTakenResponse,
  Identity,
} from "@manent/sync-protocol";
import { ROOM_WORDS } from "@manent/ui";
import type { Message } from "@manent/ui";
import type { PersonServices } from "../services/ports.ts";
import { readPerson, tabStorage } from "../session.ts";

interface DriverEntry {
  driver: Identity | null;
  known: boolean;
  online: boolean;
  canEdit: boolean;
}

const entries = new Map<string, DriverEntry>();
const listeners = new Map<string, Set<() => void>>();

const entryKey = (userId: string, docId: string): string =>
  `${userId}\0${docId}`;

const EMPTY_ENTRY: DriverEntry = Object.freeze({
  driver: null,
  known: false,
  online: true,
  canEdit: true,
});

function entryOf(userId: string, docId: string): DriverEntry {
  return entries.get(entryKey(userId, docId)) ?? EMPTY_ENTRY;
}

function setEntry(
  userId: string,
  docId: string,
  patch: Partial<DriverEntry>,
): void {
  const key = entryKey(userId, docId);
  const prev = entries.get(key) ?? EMPTY_ENTRY;
  const next: DriverEntry = { ...prev, ...patch };
  if (
    prev.known === next.known &&
    prev.online === next.online &&
    prev.canEdit === next.canEdit &&
    prev.driver?.userId === next.driver?.userId &&
    prev.driver?.name === next.driver?.name
  )
    return;
  entries.set(key, next);
  const subs = listeners.get(key);
  if (subs !== undefined) for (const listener of subs) listener();
}

export function firstNameOf(name: string): string {
  return name.split(" ")[0] ?? name;
}

export function currentDriver(userId: string, docId: string): Identity | null {
  return entryOf(userId, docId).driver;
}

export function canEditDriverDoc(userId: string, docId: string): boolean {
  return entryOf(userId, docId).canEdit;
}

export function subscribeDriver(
  userId: string,
  docId: string,
  listener: () => void,
): () => void {
  const key = entryKey(userId, docId);
  const set = listeners.get(key) ?? new Set();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentity(value: unknown): value is Identity {
  return (
    isRecord(value) &&
    typeof value.userId === "string" &&
    typeof value.name === "string"
  );
}

function parseDriverAnswer(value: unknown): DriverAnswer | null {
  if (!isRecord(value)) return null;
  if (value.driver === null) return { driver: null };
  return isIdentity(value.driver) ? { driver: value.driver } : null;
}

function parseDriverTaken(value: unknown): DriverTakenResponse | null {
  if (!isRecord(value)) return null;
  if (value.error !== "driver_taken" || !isIdentity(value.driver)) return null;
  return { error: "driver_taken", driver: value.driver };
}

function parseDriverChanged(
  data: Uint8Array,
  docId: string,
): DriverChanged | null {
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(data));
  } catch {
    // non-JSON control payload carries nothing for driver state
    return null;
  }
  if (!isRecord(body) || body.docId !== docId) return null;
  if (body.driver !== null && !isIdentity(body.driver)) return null;
  if (typeof body.at !== "number" || !Number.isSafeInteger(body.at))
    return null;
  return { docId, driver: body.driver, at: body.at };
}

function tokenOf(): string | null {
  return readPerson(tabStorage())?.token ?? null;
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function readJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    // empty or non-JSON body
    return null;
  }
}

function tookKeysMessage(name: string): Message {
  return {
    id: "driver_took_keys",
    text: ROOM_WORDS.driverTookKeys(firstNameOf(name)),
    actions: [],
    lifetime: "brief",
    ownWork: false,
  };
}

function stoppedPresentingMessage(name: string): Message {
  return {
    id: "driver_stopped_presenting",
    text: ROOM_WORDS.driverStoppedPresenting(firstNameOf(name)),
    actions: [],
    lifetime: "brief",
    ownWork: false,
  };
}

function takeLostMessage(winner: string): Message {
  return {
    id: "take_keys_lost",
    text: ROOM_WORDS.takeKeysLost(firstNameOf(winner)),
    actions: [{ label: ROOM_WORDS.takeKeysAction, commandId: "room.takeKeys" }],
    lifetime: "brief",
    ownWork: false,
  };
}

/** Fetches the server's current driver for `docId` and updates local state; returns null when unreachable or unsigned. */
export async function refreshDriver(
  userId: string,
  docId: string,
): Promise<{ ok: true; driver: Identity | null } | { ok: false }> {
  const token = tokenOf();
  if (token === null) return { ok: false };
  try {
    const response = await fetch(
      `/api/driver/current?docId=${encodeURIComponent(docId)}`,
      { headers: bearer(token) },
    );
    if (!response.ok) return { ok: false };
    const answer = parseDriverAnswer(await readJsonSafe(response));
    if (answer === null) return { ok: false };
    setEntry(userId, docId, { known: true, driver: answer.driver });
    return { ok: true, driver: answer.driver };
  } catch {
    // offline or server unreachable: keep last known driver
    return { ok: false };
  }
}

/**
 * Requests the driver keys for `docId` expecting `expectedDriverUserId`. On 409 `driver_taken`, updates local state
 * to the winner and announces S2-RM-04 when `announceLoss` is set.
 */
export async function takeDriver(
  docId: string,
  expectedDriverUserId: string | null,
  services: PersonServices,
  options?: { announceLoss?: boolean },
): Promise<Identity | null> {
  const token = tokenOf();
  if (token === null) return null;
  if (!entryOf(services.userId, docId).online) return null;
  try {
    const response = await fetch("/api/driver/take", {
      method: "POST",
      headers: { ...bearer(token), "Content-Type": "application/json" },
      body: JSON.stringify({ docId, expectedDriverUserId }),
    });
    const body = await readJsonSafe(response);
    if (response.status === 200) {
      const answer = parseDriverAnswer(body);
      if (answer === null) return null;
      setEntry(services.userId, docId, { known: true, driver: answer.driver });
      return answer.driver;
    }
    if (response.status === 409) {
      const taken = parseDriverTaken(body);
      if (taken === null) return null;
      setEntry(services.userId, docId, { known: true, driver: taken.driver });
      if (options?.announceLoss === true) {
        services.messages.withdraw("driver_took_keys");
        services.messages.push(takeLostMessage(taken.driver.name));
      }
      return taken.driver;
    }
    return null;
  } catch {
    // offline or server unreachable: leave state as it was
    return null;
  }
}

/** Releases the driver keys for `docId` when this person is closing the room window. */
export function releaseDriver(userId: string, docId: string): void {
  const current = currentDriver(userId, docId);
  if (current === null || current.userId !== userId) return;
  const token = tokenOf();
  if (token === null) return;
  setEntry(userId, docId, { known: true, driver: null });
  void fetch("/api/driver/release", {
    method: "POST",
    headers: { ...bearer(token), "Content-Type": "application/json" },
    body: JSON.stringify({ docId }),
    keepalive: true,
  }).catch(() => {
    // closing window: server cleans up on socket close if the request could not go
  });
}

function handleDriverControl(
  docId: string,
  services: PersonServices,
  emitMessages: boolean,
  data: Uint8Array,
): void {
  const changed = parseDriverChanged(data, docId);
  if (changed === null) return;
  const prev = currentDriver(services.userId, docId);
  const next = changed.driver;
  setEntry(services.userId, docId, { known: true, driver: next });
  if (!emitMessages) return;
  if (
    next !== null &&
    next.userId !== services.userId &&
    prev?.userId !== next.userId
  )
    services.messages.push(tookKeysMessage(next.name));
  else if (next === null && prev !== null && prev.userId !== services.userId)
    services.messages.push(stoppedPresentingMessage(prev.name));
}

function isEditableStatus(handle: DocHandle): boolean {
  const { side } = handle.status.get();
  return (
    !side.includes("view_only") &&
    !side.includes("read_only") &&
    !side.includes("access_removed") &&
    !side.includes("deleted")
  );
}

/**
 * Watches the server's driver for `docId`: refreshes on subscription start/reconnect and follows `CONTROL driver_changed`.
 * When `emitMessages` is true, notifies the message slot on live driver transitions for everyone else.
 */
export function watchDriver(
  docId: string,
  services: PersonServices,
  options: {
    emitMessages: boolean;
    onResolved?: (driver: Identity | null, canEdit: boolean) => void;
  },
): () => void {
  let stopped = false;
  let handle: DocHandle | null = null;
  let stopEvents: (() => void) | null = null;
  let stopStatus: (() => void) | null = null;
  let wasLive = false;
  let initialDone = false;

  const syncFromServer = (canEdit: boolean): void => {
    void refreshDriver(services.userId, docId).then((outcome) => {
      if (stopped || !outcome.ok || initialDone) return;
      initialDone = true;
      options.onResolved?.(outcome.driver, canEdit);
    });
  };

  void services
    .openHandle(docId)
    .then((opened) => {
      if (stopped) {
        void opened.close();
        return;
      }
      handle = opened;
      const updateFromStatus = (): void => {
        const status = opened.status.get();
        const online = status.link === "online";
        const canEdit = isEditableStatus(opened);
        setEntry(services.userId, docId, { online, canEdit });
        const live = online && status.docSync !== "local";
        if (live && !wasLive) syncFromServer(canEdit);
        wasLive = live;
      };
      stopEvents = opened.on((event) => {
        if (event.type === "control" && event.kind === "driver_changed")
          handleDriverControl(
            docId,
            services,
            options.emitMessages,
            event.data,
          );
      });
      stopStatus = opened.status.subscribe(updateFromStatus);
      updateFromStatus();
    })
    .catch(() => {
      // sync could not start: driver stays unknown
    });

  return () => {
    stopped = true;
    stopEvents?.();
    stopStatus?.();
    if (handle !== null) void handle.close();
  };
}
