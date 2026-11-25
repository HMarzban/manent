// Extracts rundown rows from a script's acts and slugs, and applies grouped-undo split/import writes.
import {
  insertRows,
  readRundown,
  removeRows,
  scriptBody,
  setCell,
} from "@manent/crdt";
import type { CrdtDoc, NewRow } from "@manent/crdt";
import { isBlockId, randomBlockId } from "@manent/schema";
import type { BlockJSON, IdSource, RundownColumnId } from "@manent/schema";
import type { DocHandle } from "@manent/sync-client";
import { RUNDOWN_WORDS } from "@manent/ui";
import type { PersonServices } from "../services/ports.ts";
import { titleColumnOf } from "./dur-format.ts";
import { recordRundownUndo } from "./handlers.ts";
import type { RundownUndoEntry } from "./handlers.ts";

const STORY_HYDRATE_TIMEOUT_MS = 10_000;

/** One row extracted from a script's blocks in document order (act headers and slug script rows only). */
export interface ExtractedScriptRow {
  readonly kind: "header" | "script";
  readonly blockId: string | null;
  readonly title: string;
}

/** Result of splitting a script's blocks into rundown rows. */
export interface ScriptRowsExtraction {
  readonly rows: readonly ExtractedScriptRow[];
  readonly slugCount: number;
  readonly headerCount: number;
}

/** Whether a grouped rundown write came from a drop (`drop`), Split (`split`), or Import rows from script (`import`). */
export type GroupedStepKind = "drop" | "split" | "import";

/** One grouped undo entry covering `txCount` consecutive local CRDT transactions so Undo/Redo acts as one step. */
export interface GroupedUndoStep {
  readonly kind: GroupedStepKind | "single";
  readonly txCount: number;
}

// Fixed message kind ids so a later split or undo replaces the earlier reverse message at once.
export const MSG_DROP_ADDED = "rundown.drop.added";
export const MSG_SPLIT = "rundown.split";
export const MSG_IMPORT = "rundown.import";

// S3-RG-13 verbatim from the approved wording sheet (packages/ui/src/words/rundown.ts is closed to this lane).
export const SPLIT_NEEDS_MORE_SLUGS =
  "Split into rows by slug needs a script with more than one slug.";

/**
 * Turns a script's blocks into rundown rows: one header row per act (excluding `end_of_act`) and one script row
 * per slug with its `blockId`. Brackets and all other elements do not become rows.
 */
export function extractRowsFromBlocks(
  blocks: readonly BlockJSON[],
): ScriptRowsExtraction {
  const rows: ExtractedScriptRow[] = [];
  let slugCount = 0;
  let headerCount = 0;
  for (const block of blocks) {
    const type = block.attrs?.type;
    const isAct = type === "act_break" && block.attrs?.kind !== "end_of_act";
    if (!isAct && type !== "slug") continue;
    rows.push({
      kind: isAct ? "header" : "script",
      blockId: isBlockId(block.attrs?.id) ? block.attrs.id : null,
      title: (block.content ?? [])
        .map((run) => run.text)
        .join("")
        .trim(),
    });
    if (isAct) headerCount += 1;
    else slugCount += 1;
  }
  return { rows, slugCount, headerCount };
}

/**
 * Replaces `sourceRowId` in `rundownDoc` with the extracted act header and slug script rows using the document's own
 * CRDT writers. Returns the inserted row ids and exact transaction count, or null if `< 2` slugs or missing row.
 */
export function replaceRowWithSplit(options: {
  readonly rundownDoc: CrdtDoc;
  readonly sourceRowId: string;
  readonly storyDocId: string;
  readonly titleColumn: "segment" | "story";
  readonly extracted: ScriptRowsExtraction;
  readonly userId: string;
  readonly now: () => number;
  readonly ids?: IdSource;
}): { readonly rowIds: readonly string[]; readonly txCount: number } | null {
  const { rundownDoc, sourceRowId, storyDocId, titleColumn, extracted } =
    options;
  if (extracted.slugCount < 2) return null;
  if (!readRundown(rundownDoc).rows.some((row) => row.id === sourceRowId))
    return null;
  const ids = options.ids ?? randomBlockId;
  const planned: { row: NewRow; title: string }[] = extracted.rows.map(
    (item) => ({
      row: {
        id: ids(),
        kind: item.kind,
        docId: item.kind === "script" ? storyDocId : null,
        blockId: item.blockId,
      },
      title: item.title,
    }),
  );
  const by = { userId: options.userId, now: options.now };
  insertRows(
    rundownDoc,
    planned.map((entry) => entry.row),
    sourceRowId,
  );
  let txCount = 2;
  for (const entry of planned) {
    if (entry.title === "") continue;
    setCell(rundownDoc, entry.row.id, titleColumn, entry.title, by);
    txCount += 1;
  }
  removeRows(rundownDoc, [sourceRowId]);
  return { rowIds: planned.map((entry) => entry.row.id), txCount };
}

/** Inserts one script row with its title cell after `afterRowId` (or at the start when null). */
export function insertScriptRowStep(options: {
  readonly rundownDoc: CrdtDoc;
  readonly storyDocId: string;
  readonly title: string;
  readonly titleColumn: RundownColumnId;
  readonly afterRowId: string | null;
  readonly userId: string;
  readonly now: () => number;
  readonly ids?: IdSource;
}): { readonly rowId: string; readonly txCount: number } {
  const rowId = (options.ids ?? randomBlockId)();
  insertRows(
    options.rundownDoc,
    [{ id: rowId, kind: "script", docId: options.storyDocId, blockId: null }],
    options.afterRowId,
  );
  if (options.title === "") return { rowId, txCount: 1 };
  setCell(options.rundownDoc, rowId, options.titleColumn, options.title, {
    userId: options.userId,
    now: options.now,
  });
  return { rowId, txCount: 2 };
}

/** Opens `rundownDocId`, resolves its title column and appends one script row after `afterRowId`. */
export async function appendScriptRow(options: {
  readonly services: PersonServices;
  readonly rundownDocId: string;
  readonly storyDocId: string;
  readonly storyTitle: string;
  readonly afterRowId: string | null;
  readonly now: () => number;
  readonly ids?: IdSource;
  readonly onStep?: (step: GroupedUndoStep) => void;
}): Promise<string> {
  const { services, rundownDocId } = options;
  const handle = await services.openHandle(rundownDocId);
  try {
    const rundownDoc = handle.doc();
    const data = readRundown(rundownDoc);
    const targetAfter =
      options.afterRowId !== null &&
      data.rows.some((row) => row.id === options.afterRowId)
        ? options.afterRowId
        : (data.rows.at(-1)?.id ?? null);
    const result = insertScriptRowStep({
      rundownDoc,
      storyDocId: options.storyDocId,
      title: options.storyTitle,
      titleColumn: titleColumnOf(
        services.library.documentKind(rundownDocId).get(),
        data.columns,
      ),
      afterRowId: targetAfter,
      userId: services.userId,
      now: options.now,
      ids: options.ids,
    });
    const step: GroupedUndoStep = { kind: "drop", txCount: result.txCount };
    if (options.onStep !== undefined) options.onStep(step);
    else recordRundownUndo(rundownDocId, groupedUndoEntry(step, services));
    return result.rowId;
  } finally {
    await handle.close();
  }
}

function waitForStoryHydrated(
  handle: DocHandle,
  schedule?: (fn: () => void, delayMs: number) => () => void,
): Promise<void> {
  const ready = (): boolean => {
    const st = handle.status.get();
    return (
      st.side.length > 0 ||
      st.docSync === "synced" ||
      st.link === "offline" ||
      (st.neverSynced && st.waiting > 0)
    );
  };
  if (ready()) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    let stopTimer: (() => void) | null = null;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      stopSub();
      stopTimer?.();
      resolve();
    };
    const stopSub = handle.status.subscribe(() => {
      if (ready()) finish();
    });
    if (schedule !== undefined) {
      stopTimer = schedule(finish, STORY_HYDRATE_TIMEOUT_MS);
    } else {
      const timer = setTimeout(finish, STORY_HYDRATE_TIMEOUT_MS);
      stopTimer = () => clearTimeout(timer);
    }
  });
}

/** Reads every block of `storyDocId` in document order from its CRDT handle, waiting for sync hydration if needed. */
export async function readStoryBlocks(
  services: PersonServices,
  storyDocId: string,
  schedule?: (fn: () => void, delayMs: number) => () => void,
): Promise<readonly BlockJSON[]> {
  const handle = await services.openHandle(storyDocId);
  try {
    await waitForStoryHydrated(handle, schedule);
    const doc = scriptBody(handle.doc()).materialize();
    return (doc.content ?? []).flatMap((section) => section.content ?? []);
  } finally {
    await handle.close();
  }
}

const pushBrief = (services: PersonServices, id: string, text: string): void =>
  services.messages.push({
    id,
    text,
    lifetime: "brief",
    ownWork: false,
    actions: [],
  });

/**
 * Splits `sourceRowId`'s story into act header rows and slug script rows as one grouped undo step, pushing S3-RG-13
 * when the story holds fewer than two slugs or S3-RG-56 with Undo once split.
 */
export async function splitScriptRow(options: {
  readonly services: PersonServices;
  readonly rundownDocId: string;
  readonly sourceRowId: string;
  readonly storyDocId: string;
  readonly storyTitle: string;
  readonly titleColumn: "segment" | "story";
  readonly origin: "split" | "import";
  readonly now: () => number;
  readonly schedule?: (fn: () => void, delayMs: number) => () => void;
  readonly ids?: IdSource;
  readonly onStep?: (step: GroupedUndoStep) => void;
}): Promise<boolean> {
  const { services, rundownDocId, sourceRowId, storyDocId, origin } = options;
  const extracted = extractRowsFromBlocks(
    await readStoryBlocks(services, storyDocId, options.schedule),
  );
  if (extracted.slugCount < 2) {
    services.messages.withdraw(MSG_DROP_ADDED);
    pushBrief(services, "rundown.split.need_slugs", SPLIT_NEEDS_MORE_SLUGS);
    return false;
  }
  const rundownHandle = await services.openHandle(rundownDocId);
  try {
    const result = replaceRowWithSplit({
      rundownDoc: rundownHandle.doc(),
      sourceRowId,
      storyDocId,
      titleColumn: options.titleColumn,
      extracted,
      userId: services.userId,
      now: options.now,
      ids: options.ids,
    });
    if (result === null) return false;
    const step: GroupedUndoStep = { kind: origin, txCount: result.txCount };
    if (options.onStep !== undefined) options.onStep(step);
    else recordRundownUndo(rundownDocId, groupedUndoEntry(step, services));
  } finally {
    await rundownHandle.close();
  }
  services.messages.withdraw(MSG_DROP_ADDED);
  services.messages.push({
    id: origin === "split" ? MSG_SPLIT : MSG_IMPORT,
    text: RUNDOWN_WORDS.splitIntoRows(
      options.storyTitle,
      extracted.slugCount,
      extracted.headerCount,
    ),
    lifetime: "reverse",
    ownWork: false,
    actions: [
      {
        label: services.commands.state("edit.undo").label,
        commandId: "edit.undo",
      },
    ],
  });
  return true;
}

/**
 * Tracks local CRDT transactions on `rundownDoc` alongside grouped steps recorded by `drop`/`split`/`import`, so one
 * `undo()` or `redo()` call reverts or reapplies all transactions of a grouped step atomically.
 */
export interface UndoGroupTracker {
  recordGrouped(step: GroupedUndoStep): void;
  popUndo(): GroupedUndoStep | null;
  popRedo(): GroupedUndoStep | null;
  watchDoc(rundownDoc: CrdtDoc): () => void;
}

const popTransfer = (
  from: GroupedUndoStep[],
  to: GroupedUndoStep[],
): GroupedUndoStep | null => {
  const step = from.pop();
  if (step === undefined) return null;
  to.push(step);
  return step;
};

export function createUndoGroupTracker(): UndoGroupTracker {
  const undoStack: GroupedUndoStep[] = [];
  const redoStack: GroupedUndoStep[] = [];
  let pendingRawTx = 0;
  return {
    recordGrouped(step) {
      let n = Math.min(step.txCount, pendingRawTx);
      while (n > 0 && undoStack.length > 0) {
        undoStack.pop();
        n -= 1;
        pendingRawTx -= 1;
      }
      undoStack.push(step);
      redoStack.length = 0;
    },
    popUndo: () => popTransfer(undoStack, redoStack),
    popRedo: () => popTransfer(redoStack, undoStack),
    watchDoc: (rundownDoc) =>
      rundownDoc.subscribe((_update, origin) => {
        if (origin !== null) return;
        undoStack.push({ kind: "single", txCount: 1 });
        pendingRawTx += 1;
        redoStack.length = 0;
      }),
  };
}

/** Builds a unified `RundownUndoEntry` for a grouped drop, split or import write so undo/redo stays aligned. */
export function groupedUndoEntry(
  step: GroupedUndoStep,
  services: PersonServices,
): RundownUndoEntry {
  if (step.kind === "drop") {
    return {
      message: null,
      steps: step.txCount,
      onUndo: () => services.messages.withdraw(MSG_DROP_ADDED),
    };
  }
  if (step.kind === "split" || step.kind === "import") {
    const msgId = step.kind === "split" ? MSG_SPLIT : MSG_IMPORT;
    return {
      message:
        step.kind === "split"
          ? RUNDOWN_WORDS.undidSplitBySlug
          : RUNDOWN_WORDS.undidImportRows,
      steps: step.txCount,
      onUndo: () => services.messages.withdraw(msgId),
    };
  }
  return { message: null, steps: step.txCount };
}
