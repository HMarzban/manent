// What History shows of a script from what has been read of it: its rows, newest first, and the state of the list.
import { SCHEMA_VERSION } from "@manent/schema";
import { uploadRequestOf } from "@manent/sync-client";
import type { DeviceVersion } from "@manent/sync-client";
import type { VersionItem } from "@manent/sync-protocol";
import { HISTORY_WORDS, formatTime, versionTitle } from "@manent/ui";
import type { SurfaceStateValue } from "@manent/ui";

/** One version as History shows it; `local` is the device's copy of a version not uploaded yet. */
export interface HistoryRow {
  item: VersionItem;
  title: string;
  day: string;
  time: string;
  local: DeviceVersion | null;
}

/** `othersCanOpen` is null until the server has said. */
export interface HistoryRows {
  rows: readonly HistoryRow[];
  state: SurfaceStateValue;
  othersCanOpen: boolean | null;
}

/** `local`: never synced, so the server holds none of its versions. */
export type ListPhase =
  | { kind: "loading" }
  | { kind: "local" }
  | { kind: "loaded" }
  | { kind: "offline" }
  | { kind: "problem"; reason: string };

// a version's title names nobody
const nameless = (userId: string): string => userId;

/** A device version as a row of the list: made here, by this person, of the kind it uploads as. */
function deviceItem(version: DeviceVersion, userId: string): VersionItem {
  return {
    id: version.id,
    kind: uploadRequestOf(version, "", SCHEMA_VERSION).version.kind,
    name: version.name,
    createdByUserId: userId,
    createdAt: version.createdAt,
    onDevice: true,
    position: null,
    engineVersion: null,
    summary: null,
  };
}

const newestFirst = (a: HistoryRow, b: HistoryRow): number =>
  b.item.createdAt - a.item.createdAt ||
  (a.item.id < b.item.id ? 1 : a.item.id > b.item.id ? -1 : 0);

function stateOf(
  phase: ListPhase,
  count: number,
  sinceMs: number,
): SurfaceStateValue {
  switch (phase.kind) {
    case "loading":
      return { kind: "loading", sinceMs };
    case "local":
    case "loaded":
      return count === 0 ? { kind: "empty" } : { kind: "ready" };
    case "offline":
      return { kind: "offline" };
    case "problem":
      return { kind: "problem", reason: phase.reason };
  }
}

/**
 * While the list loads, the device's versions; once listed, the device's not yet uploaded and the server's; offline
 * or after a problem, the device's and the server's whose content `opened` says this tab holds.
 */
export function historyRows(
  read: {
    phase: ListPhase;
    items: readonly VersionItem[];
    device: readonly DeviceVersion[];
    othersCanOpen: boolean | null;
    sinceMs: number;
  },
  context: { userId: string; now: number; opened(versionId: string): boolean },
): HistoryRows {
  const { phase } = read;
  const { userId, now } = context;
  const listed = phase.kind === "loaded" || phase.kind === "local";
  const device = read.device.filter((v) => !(listed && v.uploaded));
  const onDevice = new Set(device.map((v) => v.id));
  const server = read.items.filter(
    (item) =>
      phase.kind !== "loading" &&
      !onDevice.has(item.id) &&
      (listed || context.opened(item.id)),
  );
  const rowOf = (
    item: VersionItem,
    local: DeviceVersion | null,
  ): HistoryRow => ({
    item,
    title: versionTitle(item, userId, nameless),
    day: HISTORY_WORDS.dayGroup(item.createdAt, now),
    time: formatTime(item.createdAt),
    local,
  });
  const rows = [
    ...device.map((v) => rowOf(deviceItem(v, userId), v.uploaded ? null : v)),
    ...server.map((item) => rowOf(item, null)),
  ].toSorted(newestFirst);
  return {
    rows,
    state: stateOf(phase, rows.length, read.sinceMs),
    othersCanOpen: read.othersCanOpen,
  };
}
