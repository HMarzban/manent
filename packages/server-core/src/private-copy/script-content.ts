// What a private copy is made from and holds: a script's body, its settings and its writers' material, read at its
// turn in the write path, and written into a new private copy by the authority.
import {
  ALTERNATES_MAP,
  CUTS_MAP,
  NOTES_MAP,
  ORIGIN_SYSTEM,
  jsonMap,
  scriptBody,
  scriptSettings,
} from "@manent/crdt";
import type { CrdtDoc, SettingMeta } from "@manent/crdt";
import { canonicalDoc } from "@manent/schema";
import type { DocJSON } from "@manent/schema";
import type { VersionPosition } from "@manent/sync-protocol";
import type { SyncService } from "../sync/ports.ts";

/** The writers' material a hand-in carries back to the room, by key. */
export const MATERIAL_MAPS = Object.freeze([
  NOTES_MAP,
  ALTERNATES_MAP,
  CUTS_MAP,
] as const);

export interface ScriptContent {
  /** Canonical. */
  body: DocJSON;
  /** Each map of MATERIAL_MAPS by name: its entries. */
  material: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

/** A setting of the room's script, with who set it; `meta` is null when what is stored is not one. */
interface Setting {
  key: string;
  value: unknown;
  meta: SettingMeta | null;
}

/** What a private copy is made from. */
export interface RoomContent extends ScriptContent {
  settings: readonly Setting[];
}

export function scriptContentOf(doc: CrdtDoc): ScriptContent {
  return {
    body: canonicalDoc(scriptBody(doc).materialize()),
    material: Object.fromEntries(
      MATERIAL_MAPS.map((name) => [name, jsonMap(doc, name).entries()]),
    ),
  };
}

export function roomContentOf(doc: CrdtDoc): RoomContent {
  const settings = scriptSettings(doc);
  return {
    ...scriptContentOf(doc),
    settings: Object.entries(settings.entries()).map(([key, value]) => ({
      key,
      value,
      meta: settings.meta(key),
    })),
  };
}

/**
 * What `read` finds in the placed document at its turn in the write path, after every write queued before it, and
 * the head it found it at; null when the room could not be loaded or the turn did not commit.
 */
export async function readAtTurn<T>(
  sync: SyncService,
  at: { docId: string; userId: string },
  read: (doc: CrdtDoc) => T,
): Promise<{ value: T; head: VersionPosition } | null> {
  const state: { found: { value: T } | null; head: VersionPosition | null } = {
    found: null,
    head: null,
  };
  const written = await sync.authorityWrite(at.docId, {
    userId: at.userId,
    origin: "system",
    edit(doc) {
      state.found = { value: read(doc) };
      return { ok: true };
    },
    inTransaction(_file, turn) {
      state.head = { generation: turn.generation, seq: turn.before };
    },
  });
  const { found, head } = state;
  return written.ok && found !== null && head !== null
    ? { value: found.value, head }
    : null;
}

/**
 * Writes the room's body, settings and material into the new, empty private copy as the authority, under `userId`:
 * every block keeps its id, `from` marker and attributes. A setting stored without who set it is set as `userId`'s
 * at `now`. False when the write did not commit.
 */
export async function fillCopy(
  sync: SyncService,
  copy: { privateDocId: string; userId: string; now: number },
  room: RoomContent,
): Promise<boolean> {
  const { privateDocId, userId, now } = copy;
  const blocks = (room.body.content ?? []).flatMap((s) => s.content ?? []);
  const written = await sync.authorityWrite(privateDocId, {
    userId,
    origin: "system",
    edit(doc) {
      if (blocks.length > 0)
        scriptBody(doc).write(
          (w) => w.insertBlocks(null, blocks),
          ORIGIN_SYSTEM,
        );
      const settings = scriptSettings(doc);
      for (const { key, value, meta } of room.settings)
        settings.set(
          key,
          value,
          meta ?? { userId, setAt: now, replaced: null },
        );
      for (const name of MATERIAL_MAPS) {
        const map = jsonMap(doc, name);
        for (const [key, value] of Object.entries(room.material[name] ?? {}))
          map.set(key, value);
      }
      return { ok: true };
    },
    inTransaction() {
      // nothing is stored beside the update: the copy's row is in the room's file, added once the copy is whole
    },
  });
  return written.ok;
}
