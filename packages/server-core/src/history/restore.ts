// A restore on the authority: a script, scene, rundown or single rundown row put back as a version
// holds it, by one forward change of origin restore committed with a Before restore version.
import {
  ORIGIN_RESTORE,
  applyBlockOps,
  applyRundownRestore,
  readRundown,
  scriptBody,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import {
  canonicalBlocksOf,
  idOf,
  isSceneHeading,
  planRestore,
  planRundownRestore,
  sceneBlocks,
  sortRundownRows,
} from "@manent/revisions";
import type { RestorePlan, RundownRestoreScope } from "@manent/revisions";
import { fillBlockAttrs, validateBlocks } from "@manent/schema";
import type { BlockJSON, DocJSON, RundownJSON } from "@manent/schema";
import type { DocFile, VersionRow } from "@manent/storage";
import type {
  HistoryControl,
  RestoreRequest,
  RestoreResponse,
  VersionContent,
  VersionPosition,
} from "@manent/sync-protocol";
import type { Clock, SyncService } from "../sync/ports.ts";
import { isStorageError } from "../sync/storage-error.ts";
import { contentOfDoc, materializeVersion } from "./content.ts";
import type { LocksAt } from "./content.ts";
import type { HistoryExtras, HistoryOutcome } from "./service.ts";
import type { NewestVersion, Recorder } from "./summaries.ts";

export interface Restorer {
  /**
   * Inside the document's chain, with the caller allowed to edit: the stored answer of a key
   * already used, else the restore, then `restored` told to the room.
   */
  restore(
    file: DocFile,
    userId: string,
    body: RestoreRequest,
  ): Promise<HistoryOutcome<RestoreResponse>>;
}

const docOf = (blocks: readonly BlockJSON[]): DocJSON => ({
  type: "doc",
  content: [{ type: "section", content: [...blocks] }],
});

const isFields = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

/** A stored restore's answer read back; null for text this service did not write. */
function readStoredRestore(text: string): RestoreResponse | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isFields(parsed)) return null;
  const { beforeVersionId, serverSeq, applied } = parsed;
  if (typeof beforeVersionId !== "string") return null;
  if (!isCount(serverSeq) || !isCount(applied)) return null;
  return { beforeVersionId, serverSeq, applied };
}

/** The version's content; null when it has none any more, or it does not read. */
function targetOf(file: DocFile, version: VersionRow): VersionContent | null {
  try {
    return materializeVersion(file, version);
  } catch (error) {
    if (isStorageError(error) && error.code === "corrupt") return null;
    throw error;
  }
}

/** True when the restore of `userId` may be written under `clientId`: nobody else's, and nothing written under it yet. */
function isFreeFor(
  file: DocFile,
  { docId, clientId }: RestoreRequest,
  userId: string,
): boolean {
  if (clientId === null) return true;
  const held = file.log.ledger(docId).get(clientId);
  return (
    held === undefined || (held.userId === userId && held.ackedClock === 0)
  );
}

/** True when this build holds every block the plan writes as it is: nothing refused, nothing newer. */
function isHoldable(plan: RestorePlan): boolean {
  const written = plan.ops.flatMap((op) =>
    op.op === "delete" ? [] : [op.block],
  );
  const issues = validateBlocks(written, { isIdTaken: () => false });
  return issues.every((issue) => issue.severity === "repair");
}

/** The number a scene shows: its heading's stored `num`, else its count among the headings. */
function sceneNumberOf(doc: DocJSON, headingId: string): string | null {
  const headings = canonicalBlocksOf(doc).filter(isSceneHeading);
  const at = headings.findIndex((block) => idOf(block) === headingId);
  const block = headings[at];
  if (block === undefined) return null;
  const { num } = fillBlockAttrs(block.attrs);
  return typeof num === "string" ? num : String(at + 1);
}

/** The 1-based display number of a numbered rundown row, or null for header/unnumbered rows. */
function rowNumberOf(rundown: RundownJSON, rowId: string): string | null {
  let num = 0;
  for (const row of sortRundownRows(rundown.rows)) {
    const numbered = row.kind !== "header" && !row.unnumbered;
    if (numbered) num++;
    if (row.id === rowId) return numbered ? String(num) : null;
  }
  return null;
}

/** What a restore's write learns as it goes: read and planned in its edit, answered in its commit. */
interface Written {
  previous: NewestVersion | null;
  before: VersionContent | null;
  applied: number | null;
  answer: RestoreResponse | null;
  /** A scene or row restore's display number; null for whole-document restores. */
  scene: string | null;
}

type RestoreTarget =
  | { kind: "script"; doc: DocJSON }
  | { kind: "rundown"; rundown: RundownJSON; scope: RundownRestoreScope };

function resolveTarget(
  file: DocFile,
  body: RestoreRequest,
  content: VersionContent,
): HistoryOutcome<RestoreTarget> {
  const { docId, scope } = body;
  const docRow = file.log.get(docId);
  if (docRow === null) return { ok: false, code: "not_found" };
  if (docRow.kind === "rundown") {
    if (content.rundown === undefined)
      return { ok: false, code: "not_restorable" };
    if (scope.kind === "scene") return { ok: false, code: "bad_request" };
    if (
      scope.kind === "row" &&
      !content.rundown.rows.some((row) => row.id === scope.rowId)
    )
      return { ok: false, code: "not_restorable" };
    const rundownScope: RundownRestoreScope =
      scope.kind === "row"
        ? { kind: "row", rowId: scope.rowId }
        : { kind: "all" };
    return {
      ok: true,
      value: {
        kind: "rundown",
        rundown: content.rundown,
        scope: rundownScope,
      },
    };
  }
  if (scope.kind === "row") return { ok: false, code: "bad_request" };
  const doc = docOf(content.blocks);
  if (scope.kind === "scene" && sceneBlocks(doc, scope.headingId).length === 0)
    return { ok: false, code: "not_restorable" };
  return { ok: true, value: { kind: "script", doc } };
}

export function createRestorer(options: {
  sync: () => SyncService;
  clock: Clock;
  ids(): string;
  recorder: Recorder;
  locksAt: LocksAt;
  extras?: HistoryExtras;
  announce(docId: string, control: HistoryControl): void;
}): Restorer {
  const { clock, ids, recorder, locksAt } = options;

  /** The restore's edit: planned, checked, then written into `doc` under `ORIGIN_RESTORE`. */
  function planInto(
    file: DocFile,
    doc: CrdtDoc,
    userId: string,
    { docId, scope }: RestoreRequest,
    target: RestoreTarget,
    state: Written,
  ): { ok: true } | { ok: false; reason: string } {
    const row = file.log.get(docId);
    if (row === null) throw new RangeError(`no document ${docId} here`);
    if (target.kind === "rundown") {
      const now = clock.now();
      const current = readRundown(doc);
      const plan = planRundownRestore(current, target.rundown, target.scope, {
        userId,
        now,
      });
      state.previous = recorder.previousOf(file, docId);
      state.before = contentOfDoc(doc, row, {});
      state.applied = plan.applied;
      if (target.scope.kind === "row")
        state.scene = rowNumberOf(plan.result, target.scope.rowId);
      applyRundownRestore(doc, plan.ops, {
        userId,
        now,
        origin: ORIGIN_RESTORE,
      });
      return { ok: true };
    }
    if (scope.kind === "row") return { ok: false, reason: "invalid" };
    const current = scriptBody(doc).materialize();
    const plan = planRestore(current, target.doc, scope, {
      authority: options.extras?.authority(file, docId),
      newId: ids,
    });
    if (!isHoldable(plan)) return { ok: false, reason: "invalid" };
    state.previous = recorder.previousOf(file, docId);
    state.before = contentOfDoc(doc, row, {});
    state.applied = plan.applied;
    if (scope.kind === "scene")
      state.scene = sceneNumberOf(plan.result, scope.headingId);
    applyBlockOps(doc, plan.ops, ORIGIN_RESTORE);
    return { ok: true };
  }

  function recordBefore(
    file: DocFile,
    version: VersionRow & VersionPosition,
    before: VersionContent,
    read: NewestVersion | null,
  ): boolean {
    const { docId, generation, seq } = version;
    const row = file.log.get(docId);
    if (row === null) return false;
    const newest = file.history.page(docId, null, 1)[0];
    const previous =
      newest?.id === read?.id ? read : recorder.previousOf(file, docId);
    const { schemaVersion, engineVersion } = row;
    const locks = locksAt(file, docId, { generation, seq });
    const base = { ...before, schemaVersion, engineVersion, locks };
    const how = { carry: true, snapshot: false, key: null };
    recorder.record(file, version, base, how, previous);
    return true;
  }

  async function write(
    file: DocFile,
    userId: string,
    body: RestoreRequest,
    target: RestoreTarget,
  ): Promise<
    HistoryOutcome<{ answer: RestoreResponse; scene: string | null }>
  > {
    const { docId, key } = body;
    const beforeVersionId = ids();
    const state: Written = {
      previous: null,
      before: null,
      applied: null,
      answer: null,
      scene: null,
    };
    const written = await options.sync().authorityWrite(docId, {
      userId,
      origin: "restore",
      writer: body.clientId ?? undefined,
      edit: (doc) => planInto(file, doc, userId, body, target, state),
      inTransaction(_file, at) {
        const { before, applied } = state;
        if (before === null || applied === null) return;
        const createdAt = clock.now();
        const version = {
          id: beforeVersionId,
          docId,
          generation: at.generation,
          seq: at.before,
          kind: "pre_restore",
          name: null,
          createdByUserId: userId,
          createdAt,
          deviceId: null,
        } as const;
        if (!recordBefore(file, version, before, state.previous)) return;
        const serverSeq = at.seq ?? at.before;
        const answer = { beforeVersionId, serverSeq, applied };
        const result = JSON.stringify(answer);
        file.history.putRequest({ docId, key, userId, result, createdAt });
        state.answer = answer;
      },
    });
    if (!written.ok || state.answer === null) {
      file.checkpoints.unpin([beforeVersionId]);
      const refused = !written.ok && written.code === "refused";
      return { ok: false, code: refused ? "invalid" : "busy" };
    }
    return { ok: true, value: { answer: state.answer, scene: state.scene } };
  }

  return {
    async restore(file, userId, body) {
      const { docId, key, versionId } = body;
      const stored = file.history.request(docId, key);
      if (stored !== null) {
        const answer =
          stored.userId === userId ? readStoredRestore(stored.result) : null;
        return answer === null
          ? { ok: false, code: "bad_request" }
          : { ok: true, value: answer };
      }
      const version = file.history.get(versionId);
      if (version?.docId !== docId) return { ok: false, code: "not_found" };
      const content = targetOf(file, version);
      if (content === null) return { ok: false, code: "not_restorable" };
      const target = resolveTarget(file, body, content);
      if (!target.ok) return target;
      if (!isFreeFor(file, body, userId))
        return { ok: false, code: "bad_request" };
      const outcome = await write(file, userId, body, target.value);
      if (!outcome.ok) return outcome;
      const { answer, scene } = outcome.value;
      options.announce(docId, {
        kind: "restored",
        versionId,
        userId,
        at: clock.now(),
        name: version.name,
        versionAt: version.createdAt,
        scene,
        beforeVersionId: answer.beforeVersionId,
      });
      return { ok: true, value: answer };
    },
  };
}
