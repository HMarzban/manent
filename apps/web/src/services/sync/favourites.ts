// The projects and documents the person has marked as favourites, kept in their private index.
import type { JsonMapView } from "@manent/crdt";
import type { DocHandle, SyncClient } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { isFields } from "./device-memory.ts";
import { liveMap } from "./private-index.ts";

export interface FavouriteEntry {
  readonly id: string;
  readonly kind: "project" | "document";
  readonly workspaceId: string;
  readonly favouritedAt: number;
}

export interface Favourites {
  /** Shared sync client, reused by Private folder without editing the composition root. */
  readonly client: Promise<SyncClient>;
  list(
    userId: string,
    workspaceId: string,
  ): Subscribable<readonly FavouriteEntry[]>;
  has(userId: string, id: string): boolean;
  watch(userId: string, id: string): Subscribable<boolean>;
  toggle(
    userId: string,
    input: {
      readonly id: string;
      readonly kind: "project" | "document";
      readonly workspaceId: string;
      readonly now: number;
    },
  ): Promise<boolean>;
}

const isInstant = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

function readFavourite(id: string, value: unknown): FavouriteEntry | null {
  if (!isFields(value)) return null;
  const { kind, workspaceId, favouritedAt } = value;
  if (kind !== "project" && kind !== "document") return null;
  if (typeof workspaceId !== "string" || !isInstant(favouritedAt)) return null;
  return { id, kind, workspaceId, favouritedAt };
}

function readAll(map: JsonMapView): Map<string, FavouriteEntry> {
  const entries = new Map<string, FavouriteEntry>();
  for (const [id, value] of Object.entries(map.entries())) {
    const parsed = readFavourite(id, value);
    if (parsed !== null) entries.set(id, parsed);
  }
  return entries;
}

type Value<T> = Subscribable<T> & { set(value: T): void };

interface UserSlot {
  entries: Map<string, FavouriteEntry>;
  readonly byWorkspace: Map<string, Value<readonly FavouriteEntry[]>>;
  readonly byId: Map<string, Value<boolean>>;
  readonly handle: Promise<DocHandle>;
}

function filterWorkspace(
  entries: ReadonlyMap<string, FavouriteEntry>,
  workspaceId: string,
): FavouriteEntry[] {
  return [...entries.values()]
    .filter((entry) => entry.workspaceId === workspaceId)
    .toSorted(
      (a, b) => b.favouritedAt - a.favouritedAt || a.id.localeCompare(b.id),
    );
}

function openUserSlot(client: Promise<SyncClient>, userId: string): UserSlot {
  const handle = client.then((sync) =>
    sync.open(indexDocId("user", userId), {
      create: { kind: "index", home: "user", workspaceId: null },
    }),
  );
  const slot: UserSlot = {
    entries: new Map(),
    byWorkspace: new Map(),
    byId: new Map(),
    handle,
  };
  const notify = (): void => {
    for (const [ws, value] of slot.byWorkspace)
      value.set(filterWorkspace(slot.entries, ws));
    for (const [id, value] of slot.byId) value.set(slot.entries.has(id));
  };
  void handle.then(
    (opened) => {
      const map = liveMap(opened, "favourites");
      const refresh = (): void => {
        slot.entries = readAll(map);
        notify();
      };
      map.subscribe(refresh);
      refresh();
    },
    () => {
      // private index failed to open; favourites stay empty
    },
  );
  return slot;
}

/** Per-person favourites backed by the private index `favourites` map. */
export function createFavourites(options: {
  client: Promise<SyncClient>;
}): Favourites {
  const slots = new Map<string, UserSlot>();
  const slotOf = (userId: string): UserSlot => {
    const existing = slots.get(userId);
    if (existing !== undefined) return existing;
    const created = openUserSlot(options.client, userId);
    slots.set(userId, created);
    return created;
  };
  return {
    client: options.client,
    list(userId, workspaceId) {
      const slot = slotOf(userId);
      const existing = slot.byWorkspace.get(workspaceId);
      if (existing !== undefined) return existing;
      const created = createValue<readonly FavouriteEntry[]>(
        filterWorkspace(slot.entries, workspaceId),
      );
      slot.byWorkspace.set(workspaceId, created);
      return created;
    },
    has(userId, id) {
      return slotOf(userId).entries.has(id);
    },
    watch(userId, id) {
      const slot = slotOf(userId);
      const existing = slot.byId.get(id);
      if (existing !== undefined) return existing;
      const created = createValue<boolean>(slot.entries.has(id));
      slot.byId.set(id, created);
      return created;
    },
    async toggle(userId, input) {
      const handle = await slotOf(userId).handle;
      const map = liveMap(handle, "favourites");
      if (map.get(input.id) !== null) {
        map.delete(input.id);
        return false;
      }
      map.set(input.id, {
        kind: input.kind,
        workspaceId: input.workspaceId,
        favouritedAt: input.now,
      });
      return true;
    },
  };
}
