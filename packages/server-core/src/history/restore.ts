// A restore on the authority: the script, or one scene of it, put back as a version holds it, by
// one forward change of origin restore committed with a Before restore version.
import { ORIGIN_RESTORE, applyBlockOps, scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import {
  canonicalBlocksOf,
  idOf,
  isSceneHeading,
  planRestore,
  sceneBlocks,
} from "@manent/revisions";
import type { RestorePlan } from "@manent/revisions";
import { fillBlockAttrs, validateBlocks } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
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
    // stored text that is not JSON is no answer: the caller refuses the retry like a damaged one
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

/** What a restore's write learns as it goes: read and planned in its edit, answered in its commit. */
interface Written {
  previous: NewestVersion | null;
  before: VersionContent | null;
  plan: RestorePlan | null;
  answer: RestoreResponse | null;
  /** A scene restore's scene number. */
  scene: string | null;
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

  /** The restore's edit: the plan, checked, then written into `doc`; what it read kept in `state`. */
  function planInto(
    file: DocFile,
    doc: CrdtDoc,
    { docId, scope }: RestoreRequest,
    target: DocJSON,
    state: Written,
  ): { ok: true } | { ok: false; reason: string } {
    const row = file.log.get(docId);
    if (row === null) throw new RangeError(`no document ${docId} here`);
    if (scope.kind === "row") return { ok: false, reason: "invalid" };
    const current = scriptBody(doc).materialize();
    const plan = planRestore(current, target, scope, {
      authority: options.extras?.authority(file, docId),
      newId: ids,
    });
    if (!isHoldable(plan)) return { ok: false, reason: "invalid" };
    // read here, out of the commit every queued write of the file shares
    state.previous = recorder.previousOf(file, docId);
    state.before = contentOfDoc(doc, row, {});
    state.plan = plan;
    if (scope.kind === "scene")
      state.scene = sceneNumberOf(plan.result, scope.headingId);
    applyBlockOps(doc, plan.ops, ORIGIN_RESTORE);
    return { ok: true };
  }

  /**
   * In the restore's commit: `version`, at the head just before it, holding `before`, summarised
   * against the newest version read before the commit, or against one kept since.
   */
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

  /** One authority write: the plan applied, and in its commit the Before restore version and the answer. */
  async function write(
    file: DocFile,
    userId: string,
    body: RestoreRequest,
    target: DocJSON,
  ): Promise<
    HistoryOutcome<{ answer: RestoreResponse; scene: string | null }>
  > {
    const { docId, key } = body;
    const beforeVersionId = ids();
    const state: Written = {
      previous: null,
      before: null,
      plan: null,
      answer: null,
      scene: null,
    };
    const written = await options.sync().authorityWrite(docId, {
      userId,
      origin: "restore",
      writer: body.clientId ?? undefined,
      edit: (doc) => planInto(file, doc, body, target, state),
      inTransaction(_file, at) {
        const { before, plan } = state;
        if (before === null || plan === null) return;
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
        const answer = { beforeVersionId, serverSeq, applied: plan.applied };
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
      const { docId, key, versionId, scope } = body;
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
      const target = docOf(content.blocks);
      if (
        scope.kind === "scene" &&
        sceneBlocks(target, scope.headingId).length === 0
      )
        return { ok: false, code: "not_restorable" };
      if (!isFreeFor(file, body, userId))
        return { ok: false, code: "bad_request" };
      const outcome = await write(file, userId, body, target);
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
