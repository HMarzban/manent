// What a lock fixes in place: the scene numbers it writes, the script settings it freezes, and the rows
// its commit writes.
import {
  ORIGIN_LOAD,
  createDoc,
  discardPending,
  loadDoc,
  readProjectMap,
  scriptBody,
  scriptSettings,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { LockAnchorRecord } from "@manent/pagination";
import {
  DEFAULT_MARK,
  WHITE_DRAFT_NAME,
  revisionColour,
  revisionName,
} from "@manent/revisions";
import type { RevisionColour } from "@manent/revisions";
import type { FlatBlock } from "@manent/schema";
import {
  FOLLOWED_SCRIPT_KEYS,
  SETTINGS,
  resolveFollowed,
} from "@manent/settings";
import type {
  DocFile,
  RevisionSetRow,
  Storage,
  VersionRow,
} from "@manent/storage";
import { indexDocId } from "@manent/sync-protocol";
import type { ColourOrderId, NumberingScheme } from "@manent/sync-protocol";
import type { Position, ProductionOptions, Requests } from "./requests.ts";
import { refused } from "./outcome.ts";
import type { ProductionRefused } from "./outcome.ts";
import { isDay } from "./requests.ts";
import { rowsOf } from "./state.ts";

/** What a lock's commit writes, as its edit computed it. */
export interface LockCommit {
  readonly docId: string;
  readonly userId: string;
  readonly lockedOn: string;
  readonly numbering: NumberingScheme;
  readonly order: readonly RevisionColour[];
  readonly records: readonly LockAnchorRecord[];
  readonly numbers: readonly { blockId: string; num: string }[];
  readonly engineVersion: number;
  /** The active revision's ordinal: one past the last set the lock issues. */
  readonly active: number;
}

/** The fields every set issued with the lock shares. */
export type IssuedWithLock = Omit<
  RevisionSetRow,
  "id" | "ordinal" | "name" | "colour" | "mark" | "fullDraft"
>;

/** A lock's own precondition: a day written YYYY-MM-DD, on a script never locked before. */
export function lockRefusal(
  file: DocFile,
  request: { docId: string; lockedOn: string },
): ProductionRefused | null {
  if (!isDay(request.lockedOn)) return refused("bad_request");
  // a script is locked once: End keeps its sets, whose ordinals name their colours
  return file.production.get(request.docId) === null
    ? null
    : refused("already_locked");
}

/** Writes each heading's number where the script does not hold it already. */
export function writeNumbers(
  doc: CrdtDoc,
  flat: readonly FlatBlock[],
  numbers: readonly { blockId: string; num: string }[],
): void {
  const held = new Map(flat.map((b) => [b.attrs.id, b.attrs.num]));
  scriptBody(doc).write((w) => {
    for (const { blockId, num } of numbers)
      if (held.get(blockId) !== num) w.setBlockAttrs(blockId, { num });
  });
}

function sameJson(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => sameJson(item, b[i]))
    );
  }
  if (typeof a !== "object" || typeof b !== "object") return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(
    (key) =>
      Object.hasOwn(b, key) &&
      sameJson(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
  );
}

/**
 * The server-held settings of the project `docId` lives in (`template` and `style` maps of the project index);
 * null when `docId` is outside a project or the project has no index yet.
 */
export function readProjectSettings(
  storage: Storage,
  docId: string,
): Readonly<Record<string, unknown>> | null {
  const home = storage.directory.placeOf(docId)?.home ?? null;
  if (home === null || home.kind !== "project") return null;
  const index = indexDocId("project", home.id);
  const file = storage.open(home);
  const row = file.log.get(index);
  if (row === null) return null;
  const checkpoint = file.checkpoints.newest(index, row.generation);
  const doc = checkpoint === null ? createDoc() : loadDoc(checkpoint.state);
  const tail = file.log.tail(index, row.generation, checkpoint?.seq ?? 0, {
    quarantine: false,
  });
  for (const { update } of tail.rows) doc.applyUpdate(update, ORIGIN_LOAD);
  discardPending(doc);
  try {
    return {
      ...readProjectMap(doc, "template"),
      ...readProjectMap(doc, "style"),
    };
  } finally {
    doc.destroy();
  }
}

/**
 * Every script setting the lock freezes — layout-guarded settings and every setting followed from the project —
 * resolved from `project` where unset and written to its effective value (or default) with `locked`'s two.
 */
export function freezeSettings(
  doc: CrdtDoc,
  locked: { numbering: NumberingScheme; colourOrder: ColourOrderId },
  meta: { userId: string; setAt: number },
  project: Readonly<Record<string, unknown>> | null = null,
): void {
  const settings = scriptSettings(doc);
  const stored = settings.entries();
  const resolved = resolveFollowed(stored, project);
  const keysToFreeze = new Set<string>([
    ...SETTINGS.all
      .filter((d) => d.scope === "script" && d.guard === "layout")
      .map((d) => d.key),
    ...Object.keys(FOLLOWED_SCRIPT_KEYS),
  ]);
  const frozen: [string, unknown][] = [];
  for (const key of keysToFreeze) {
    if (key === "script.numbering" || key === "script.colourOrder") continue;
    const def = SETTINGS.all.find((held) => held.key === key);
    if (def === undefined) continue;
    const value = resolved[key];
    frozen.push([key, def.type.parse(value).ok ? value : def.default]);
  }
  frozen.push(
    ["script.numbering", locked.numbering],
    ["script.colourOrder", locked.colourOrder],
  );
  for (const [key, value] of frozen)
    if (!Object.hasOwn(stored, key) || !sameJson(stored[key], value))
      settings.set(key, value, { ...meta, replaced: stored[key] ?? null });
}

/**
 * Inside a lock's commit at `pos`: the production row, the anchor table, every heading's number, the
 * White version, set 0 issued now, and the active set, unissued. Returns the White version and what a
 * set issued with set 0 shares.
 */
export function commitLock(
  file: DocFile,
  pos: Position,
  lock: LockCommit,
  ports: Pick<ProductionOptions, "now" | "ids"> & Pick<Requests, "keep">,
): { white: VersionRow; issued: IssuedWithLock } {
  const { production } = file;
  const { docId, userId, lockedOn, order } = lock;
  const now = ports.now();
  production.put({
    docId,
    numbering: lock.numbering,
    colourOrder: [...order],
    lockedAt: now,
    lockedOn,
    lockedByUserId: userId,
    endedAt: null,
  });
  production.replaceAnchors(docId, rowsOf(lock.records), pos);
  production.putSceneNumbers(
    docId,
    lock.numbers.map((n) => ({ ...n, reserved: false })),
  );
  const white = ports.keep(
    file,
    { docId, userId, kind: "named", name: WHITE_DRAFT_NAME, at: pos },
    null,
  );
  const started = {
    docId,
    baselineVersionId: white.id,
    recalledAt: null,
    startedAt: now,
    engineVersion: lock.engineVersion,
  };
  const issued: IssuedWithLock = {
    ...started,
    issuedVersionId: white.id,
    issuedAt: now,
    issuedOn: lockedOn,
    issuedByUserId: userId,
  };
  const standard = (ordinal: number) => ({
    id: ports.ids(),
    ordinal,
    name: revisionName(order, ordinal),
    colour: revisionColour(order, ordinal),
    mark: DEFAULT_MARK,
    fullDraft: false,
  });
  production.addSet({ ...issued, ...standard(0) });
  production.addSet({
    ...started,
    ...standard(lock.active),
    issuedVersionId: null,
    issuedAt: null,
    issuedOn: null,
    issuedByUserId: null,
  });
  production.setLocked(docId, true);
  return { white, issued };
}
