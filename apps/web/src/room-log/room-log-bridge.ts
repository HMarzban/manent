// Non-editor bridge between active room log editors, the Beside tag bar and room log command handlers.
import type { RoomLogLink, RoomLogTag } from "@manent/editor";
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";

/** Primitives published from the active room log editor for the caret's current line. */
export interface RoomLogLineFacts {
  readonly onLine: boolean;
  readonly editable: boolean;
  readonly tags: readonly RoomLogTag[];
  readonly hasLink: boolean;
}

/** Operations exposed by a mounted room log editor to UI controls and command handlers. */
export interface RoomLogHost {
  toggleTag(tag: RoomLogTag): boolean;
  askLink(items: readonly string[], choose: (index: number) => void): boolean;
  setLink(linkTo: RoomLogLink | null): boolean;
  isOnLine(): boolean;
  isEditable(): boolean;
}

const EMPTY_FACTS: RoomLogLineFacts = Object.freeze({
  onLine: false,
  editable: false,
  tags: Object.freeze([]),
  hasLink: false,
});

const hosts = new Map<string, RoomLogHost>();
const lines = new Map<
  string,
  ReturnType<typeof createValue<RoomLogLineFacts>>
>();
let lastActiveDocId: string | null = null;

function lineValueOf(
  docId: string,
): ReturnType<typeof createValue<RoomLogLineFacts>> {
  let value = lines.get(docId);
  if (value === undefined) {
    value = createValue<RoomLogLineFacts>(EMPTY_FACTS);
    lines.set(docId, value);
  }
  return value;
}

/** Subscribable caret-line facts for `docId`'s room log editor. */
export function roomLogLine(docId: string): Subscribable<RoomLogLineFacts> {
  return lineValueOf(docId);
}

/** Publishes updated caret-line facts for `docId`. */
export function publishRoomLogLine(
  docId: string,
  facts: RoomLogLineFacts,
): void {
  lineValueOf(docId).set(facts);
}

/** Registers `host` as the active room log editor for `docId`; returns unregister. */
export function registerRoomLogHost(
  docId: string,
  host: RoomLogHost,
): () => void {
  hosts.set(docId, host);
  lastActiveDocId = docId;
  return () => {
    if (hosts.get(docId) !== host) return;
    hosts.delete(docId);
    lineValueOf(docId).set(EMPTY_FACTS);
    if (lastActiveDocId === docId) {
      lastActiveDocId = [...hosts.keys()].at(-1) ?? null;
    }
  };
}

/** Marks `docId` as the most recently focused room log editor. */
export function markRoomLogFocused(docId: string): void {
  if (hosts.has(docId)) lastActiveDocId = docId;
}

/** The active room log docId: `mainDocId` when it is itself a room log, else the active Beside room log, or null. */
export function activeRoomLogDocId(mainDocId: string | null): string | null {
  if (mainDocId !== null && hosts.has(mainDocId)) return mainDocId;
  if (lastActiveDocId !== null && hosts.has(lastActiveDocId))
    return lastActiveDocId;
  return [...hosts.keys()].at(-1) ?? null;
}

/** Toggles `tag` on the caret's line in `docId`'s room log editor. */
export function runRoomLogTag(docId: string, tag: RoomLogTag): boolean {
  return hosts.get(docId)?.toggleTag(tag) ?? false;
}

/** Opens the in-place beat/scene picker on `docId`'s room log editor. */
export function runRoomLogAskLink(
  docId: string,
  items: readonly string[],
  choose: (index: number) => void,
): boolean {
  return hosts.get(docId)?.askLink(items, choose) ?? false;
}

/** Sets or clears `linkTo` on the caret's line in `docId`'s room log editor. */
export function runRoomLogSetLink(
  docId: string,
  linkTo: RoomLogLink | null,
): boolean {
  return hosts.get(docId)?.setLink(linkTo) ?? false;
}

/** True when `docId`'s room log editor is mounted, editable and has the caret on a line. */
export function canEditRoomLogLine(docId: string): boolean {
  const host = hosts.get(docId);
  return host !== undefined && host.isEditable() && host.isOnLine();
}
