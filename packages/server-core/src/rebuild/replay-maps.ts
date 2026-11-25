// Changed alternates, cuts, and sceneProgress map entries extracted during offline replay and written under ORIGIN_REPLAY.
import {
  ALTERNATES_MAP,
  CUTS_MAP,
  ORIGIN_REPLAY,
  SCENE_PROGRESS,
  SCENE_PROGRESS_MAP,
  isAlternate,
  isCut,
  jsonMap,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { isBlockId } from "@manent/schema";

const MAX_KEY_LENGTH = 128;
const hasOwn = Object.prototype.hasOwnProperty;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function sameJson(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return (
      a.length === b.length &&
      a.every((item, index) => sameJson(item, b[index]))
    );
  if (!isRecord(a) || !isRecord(b)) return false;
  const keysA = Object.keys(a);
  return (
    keysA.length === Object.keys(b).length &&
    keysA.every((key) => hasOwn.call(b, key) && sameJson(a[key], b[key]))
  );
}

export interface ReplayMapChanges {
  readonly alternates: readonly [string, unknown][];
  readonly cuts: readonly [string, unknown][];
  readonly sceneProgress: readonly [string, unknown][];
}

const isValidKey = (key: string): boolean =>
  key.length > 0 && key.length <= MAX_KEY_LENGTH;

const isSceneProgressEntry = (key: string, value: unknown): boolean =>
  isBlockId(key) && SCENE_PROGRESS.some((progress) => progress === value);

function diffJsonMap(
  base: CrdtDoc,
  mine: CrdtDoc,
  mapName: string,
  valid: (key: string, value: unknown) => boolean,
): [string, unknown][] | "invalid" {
  const before = jsonMap(base, mapName).entries();
  const after = jsonMap(mine, mapName).entries();
  const keys = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ].toSorted();
  const changes: [string, unknown][] = [];
  for (const key of keys) {
    const prev = hasOwn.call(before, key) ? before[key] : undefined;
    const next = hasOwn.call(after, key) ? after[key] : undefined;
    if (sameJson(prev, next)) continue;
    if (next !== undefined && !valid(key, next)) return "invalid";
    changes.push([key, next]);
  }
  return changes;
}

/** Alternates, cuts, and sceneProgress entries in `mine` that differ from `base`, with schema and bounds checks. */
export function changedScriptMaps(
  base: CrdtDoc,
  mine: CrdtDoc,
): ReplayMapChanges | "invalid" {
  const alternates = diffJsonMap(
    base,
    mine,
    ALTERNATES_MAP,
    (key, value) => isValidKey(key) && isAlternate(value),
  );
  if (alternates === "invalid") return "invalid";
  const cuts = diffJsonMap(
    base,
    mine,
    CUTS_MAP,
    (key, value) => isValidKey(key) && isCut(value),
  );
  if (cuts === "invalid") return "invalid";
  const sceneProgress = diffJsonMap(
    base,
    mine,
    SCENE_PROGRESS_MAP,
    isSceneProgressEntry,
  );
  if (sceneProgress === "invalid") return "invalid";
  return { alternates, cuts, sceneProgress };
}

/** Applies `changes` for `alternates`, `cuts`, and `sceneProgress` onto `copy` under `ORIGIN_REPLAY`. */
export function writeReplayMaps(
  copy: CrdtDoc,
  changes: ReplayMapChanges,
): void {
  const pairs: readonly [string, readonly [string, unknown][]][] = [
    [ALTERNATES_MAP, changes.alternates],
    [CUTS_MAP, changes.cuts],
    [SCENE_PROGRESS_MAP, changes.sceneProgress],
  ];
  for (const [mapName, entries] of pairs) {
    if (entries.length === 0) continue;
    const map = jsonMap(copy, mapName);
    for (const [key, value] of entries) {
      if (value === undefined) {
        if (map.get(key) !== null) map.delete(key, ORIGIN_REPLAY);
      } else if (!sameJson(map.get(key), value)) {
        map.set(key, value, ORIGIN_REPLAY);
      }
    }
  }
}
