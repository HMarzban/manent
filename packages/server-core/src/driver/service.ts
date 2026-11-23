// The driver of a script presented to the room: one person per script, held in memory and changed only here, so
// two people can never both be driving. Every change is announced to the script's subscribers.
import type { Home, Storage } from "@manent/storage";
import type { Identity } from "@manent/sync-protocol";
import { isWriterRole } from "../sync/admission.ts";
import type { SyncHooks, SyncService } from "../sync/ports.ts";

/** `driver_taken` names who drives instead of the expected driver. */
export type DriverOutcome =
  | { ok: true; driver: Identity | null }
  | { ok: false; code: "forbidden" | "deleted" | "not_driver" }
  | { ok: false; code: "driver_taken"; driver: Identity };

/** Every request is decided from the caller's stored access to the script, never from what the request says of it. */
export interface DriverService extends SyncHooks {
  /** Who drives the script, for anyone who can open it. */
  current(userId: string, docId: string): DriverOutcome;
  /** `user` drives when they can edit the script, and nobody drives or the driver is `expectedDriverUserId` (null: nobody). */
  take(
    user: Identity,
    docId: string,
    expectedDriverUserId: string | null,
  ): DriverOutcome;
  /** The driver gives the keys back; anyone else is answered `not_driver`. */
  release(userId: string, docId: string): DriverOutcome;
}

interface Held {
  driver: Identity;
  /** The room's generation when last seen: a leave in a newer one is a rebuild moving its subscribers. Null: unknown. */
  generation: number | null;
}

const encode = (value: unknown): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(value));

/** The driver is held per script, never per generation, and forgotten with the script's room. */
export function createDriverService(options: {
  storage: Storage;
  sync: () => SyncService;
  now: () => number;
}): DriverService {
  const { storage, sync, now } = options;
  const held = new Map<string, Held>();

  const announce = (docId: string, driver: Identity | null): void =>
    sync().broadcast(
      docId,
      "driver_changed",
      encode({ docId, driver, at: now() }),
    );

  const drive = (user: Identity, docId: string, home: Home): DriverOutcome => {
    const row = storage.open(home).log.get(docId);
    held.set(docId, { driver: user, generation: row?.generation ?? null });
    announce(docId, user);
    return { ok: true, driver: user };
  };

  return {
    current(userId, docId) {
      const resolved = sync().access.resolve(userId, docId);
      if (!resolved.ok) return resolved;
      return { ok: true, driver: held.get(docId)?.driver ?? null };
    },
    take(user, docId, expectedDriverUserId) {
      const resolved = sync().access.resolve(user.userId, docId);
      if (!resolved.ok) return resolved;
      if (!isWriterRole(resolved.access.role))
        return { ok: false, code: "forbidden" };
      const current = held.get(docId)?.driver ?? null;
      if (current === null) return drive(user, docId, resolved.home);
      if (current.userId !== expectedDriverUserId)
        return { ok: false, code: "driver_taken", driver: current };
      if (current.userId === user.userId) return { ok: true, driver: current };
      return drive(user, docId, resolved.home);
    },
    release(userId, docId) {
      const resolved = sync().access.resolve(userId, docId);
      if (!resolved.ok) return resolved;
      if (held.get(docId)?.driver.userId !== userId)
        return { ok: false, code: "not_driver" };
      held.delete(docId);
      announce(docId, null);
      return { ok: true, driver: null };
    },
    editorLeft(room, userId) {
      const holding = held.get(room.docId);
      if (holding?.driver.userId !== userId) return;
      for (const peer of room.editors.keys())
        if (peer.userId === userId) return;
      const { generation } = room.row;
      if (holding.generation !== null && holding.generation !== generation) {
        holding.generation = generation;
        return;
      }
      held.delete(room.docId);
      announce(room.docId, null);
    },
    forgotten(room) {
      held.delete(room.docId);
    },
  };
}
