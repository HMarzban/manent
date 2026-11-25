// Async rundown row commands that create or copy story documents: Paste and Start a script.
import {
  insertRows,
  readRundown,
  removeRows,
  setCell,
  setRowUnnumbered,
} from "@manent/crdt";
import { randomBlockId } from "@manent/schema";
import { LIBRARY_WORDS, RUNDOWN_WORDS } from "@manent/ui";
import {
  PASTE_NEEDS_ROWS_TEXT,
  pasteRundownRows,
  readCopiedRows,
} from "./clipboard.ts";
import type { RundownClipboardData } from "./clipboard.ts";
import { rowTitleOf } from "./dur-format.ts";
import { STORED_COLUMNS } from "./previous-value-model.ts";
import { insertAfterRowId, targetRowIdsOf } from "./row-actions.ts";
import type { RowActionContext } from "./row-actions.ts";
import {
  createStoryForRow,
  removeQuietlyFromIndex,
  resolveRundownPlace,
  restoreQuietlyToIndex,
} from "./rundown-stories.ts";

const UNDO_ACTION = Object.freeze([{ label: "Undo", commandId: "edit.undo" }]);
const OPEN_BESIDE_ACTION = Object.freeze([
  { label: "Open beside", commandId: "rundown.openBeside" },
]);

/** Pastes rundown rows from `explicit` or the in-memory clipboard, copying any scripts and registering single-step Undo. */
export async function pasteIntoRundown(
  ctx: RowActionContext,
  explicit?: RundownClipboardData | null,
): Promise<void> {
  const { docId, session, titleColumn, services, environment, gridRef } = ctx;
  const handle = session.getHandle();
  const rundown = session.view.rundown;
  if (handle === null || rundown === null || session.view.access !== "edit")
    return;
  const payload = explicit === undefined ? readCopiedRows() : explicit;
  if (payload === null) {
    services.messages.withdraw("rundown.action");
    services.messages.withdraw("rundown.undo");
    services.messages.push({
      id: "rundown.action",
      text: PASTE_NEEDS_ROWS_TEXT,
      lifetime: "brief",
      ownWork: false,
      actions: [],
    });
    return;
  }
  const afterRowId = insertAfterRowId(
    rundown,
    session.view.selectedRowIds,
    session.view.activeCell,
  );
  const result = await pasteRundownRows({
    docId,
    doc: handle.doc(),
    data: payload,
    afterRowId,
    titleColumn,
    services,
    now: environment.now,
    schedule: environment.schedule,
  });
  let removedEntries: ReadonlyMap<string, unknown> = new Map();
  session.recordUndo({
    message: RUNDOWN_WORDS.undidPaste,
    steps: result.steps,
    onUndo:
      result.copiedScriptIds.length > 0 && result.workspaceId !== null
        ? () => {
            const ws = result.workspaceId!;
            void removeQuietlyFromIndex(
              services,
              ws,
              result.copiedScriptIds,
            ).then((saved) => {
              removedEntries = saved;
            });
          }
        : undefined,
    onRedo:
      result.copiedScriptIds.length > 0 && result.workspaceId !== null
        ? () => {
            const ws = result.workspaceId!;
            void restoreQuietlyToIndex(services, ws, removedEntries);
          }
        : undefined,
  });
  if (result.insertedIds.length > 0) {
    session.setSelection(result.insertedIds);
    const first = result.insertedIds[0]!;
    session.setActiveCell({ rowId: first, columnId: titleColumn });
    gridRef.current?.focusCell(first, titleColumn);
  }
  services.messages.withdraw("rundown.action");
  services.messages.withdraw("rundown.undo");
  services.messages.push({
    id: "rundown.action",
    text: RUNDOWN_WORDS.pastedRows(
      result.insertedIds.length,
      result.copiedScriptIds.length,
    ),
    lifetime: "reverse",
    ownWork: false,
    actions: [...UNDO_ACTION],
  });
}

/** Turns an item row into a script row with a new empty story document in the rundown's project. */
export async function startScriptForRow(ctx: RowActionContext): Promise<void> {
  const { docId, session, services, environment, titleColumn, gridRef } = ctx;
  const handle = session.getHandle();
  const rundown = session.view.rundown;
  if (handle === null || rundown === null || session.view.access !== "edit")
    return;
  const targets = targetRowIdsOf(
    rundown,
    session.view.selectedRowIds,
    session.view.activeCell,
  );
  const rowId = targets[0];
  if (rowId === undefined) return;
  const row = rundown.rows.find((candidate) => candidate.id === rowId);
  if (row === undefined || row.kind !== "item") return;

  const place = await resolveRundownPlace(
    services,
    docId,
    environment.schedule,
  );
  if (place === null) return;
  const title = rowTitleOf(row) || LIBRARY_WORDS.untitledScript;
  const storyDocId = await createStoryForRow({
    services,
    place,
    rundownId: docId,
    title,
    language: environment.language,
  });

  const liveDoc = handle.doc();
  const currentRows = readRundown(liveDoc).rows;
  if (!currentRows.some((candidate) => candidate.id === row.id)) return;
  const newRowId = randomBlockId();
  insertRows(
    liveDoc,
    [{ id: newRowId, kind: "script", docId: storyDocId, blockId: null }],
    row.id,
  );
  let steps = 1;
  const by = { userId: services.userId, now: environment.now };
  for (const col of STORED_COLUMNS) {
    const cell = row.cells[col];
    if (cell === undefined) continue;
    setCell(liveDoc, newRowId, col, cell.value, by);
    steps += 1;
  }
  if (row.unnumbered) {
    setRowUnnumbered(liveDoc, newRowId, true);
    steps += 1;
  }
  removeRows(liveDoc, [row.id]);
  steps += 1;

  let removedEntries: ReadonlyMap<string, unknown> = new Map();
  session.recordUndo({
    message: null,
    steps,
    onUndo: () => {
      void removeQuietlyFromIndex(services, place.workspaceId, [
        storyDocId,
      ]).then((saved) => {
        removedEntries = saved;
      });
    },
    onRedo: () => {
      void restoreQuietlyToIndex(services, place.workspaceId, removedEntries);
    },
  });
  session.setSelection([newRowId]);
  session.setActiveCell({ rowId: newRowId, columnId: titleColumn });
  gridRef.current?.focusCell(newRowId, titleColumn);
  services.messages.withdraw("rundown.action");
  services.messages.withdraw("rundown.undo");
  services.messages.push({
    id: "rundown.action",
    text: RUNDOWN_WORDS.startedScript(title),
    lifetime: "brief",
    ownWork: false,
    actions: [...OPEN_BESIDE_ACTION],
  });
}
