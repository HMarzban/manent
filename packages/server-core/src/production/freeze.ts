// What a lock fixes in place: the scene numbers it writes, the script settings it freezes, and the rows
// its commit writes.
import { scriptBody, scriptSettings } from "@manent/crdt";
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
import { SETTINGS } from "@manent/settings";
import type { DocFile, RevisionSetRow, VersionRow } from "@manent/storage";
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

/** Every script setting the lock freezes, at its value now or its default, with `locked`'s two. */
export function freezeSettings(
  doc: CrdtDoc,
  locked: { numbering: NumberingScheme; colourOrder: ColourOrderId },
  meta: { userId: string; setAt: number },
  project: Readonly<Record<string, unknown>> | null = null,
): void {
  const settings = scriptSettings(doc);
  const stored = settings.entries();
  const frozen = SETTINGS.all
    .filter((d) => d.scope === "script" && d.guard === "layout")
    .map((d): [string, unknown] => {
      const value = stored[d.key] ?? project?.[d.key];
      return [d.key, d.type.parse(value).ok ? value : d.default];
    });
  frozen.push(
    ["script.numbering", locked.numbering],
    ["script.colourOrder", locked.colourOrder],
  );
  for (const [key, value] of frozen)
    if (stored[key] !== value)
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
