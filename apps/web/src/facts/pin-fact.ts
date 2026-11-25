// Pin to project facts: the More ▾ selection-toolbar action that pins a single-block selection to the project's facts.
import { readEpisodes } from "@manent/crdt";
import { textAnchorAt } from "@manent/schema";
import type { TextAnchor } from "@manent/schema";
import type { DocHandle } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import { FACTS_WORDS } from "@manent/ui";
import { liveEditor } from "../editor-host/live-editor.ts";
import type {
  SelectionActionContext,
  SelectionActionSlot,
} from "../selection/slots.ts";
import type { PersonServices } from "../services/ports.ts";
import {
  readContinueMap,
  readWorkspace,
} from "../services/sync/index-entries.ts";
import { liveMap } from "../services/sync/private-index.ts";
import { checkFactsAccess, isHandleWriteBlocked } from "./facts-access.ts";
import type { FactValue } from "./facts-entries.ts";

/** What is captured synchronously from the live editor at the moment Pin to project facts runs. */
interface CapturedSelection {
  readonly anchor: TextAnchor;
  readonly sceneHeadingId: string | null;
  readonly sceneLabel: string | null;
}

/**
 * Reads the current selection when it is non-empty, lies inside one editable textblock with a block id, and the open
 * editor allows editing; null otherwise (including for view-only and commenter roles).
 */
function captureSingleBlockSelection(
  context: Pick<SelectionActionContext, "docId" | "facts">,
): CapturedSelection | null {
  const editor = liveEditor(context.docId);
  if (editor === null || !editor.editable) return null;
  const { $from, $to, empty } = editor.view.state.selection;
  if (empty || $from.parent !== $to.parent || !$from.parent.isTextblock)
    return null;
  const blockId = $from.parent.attrs.id;
  if (typeof blockId !== "string" || blockId === "") return null;
  const start = $from.parentOffset;
  const end = $to.parentOffset;
  if (start >= end) return null;
  const anchor = textAnchorAt(
    { id: blockId, text: $from.parent.textContent },
    start,
    end,
  );
  return {
    anchor,
    sceneHeadingId: context.facts.get("sceneId"),
    sceneLabel: context.facts.get("scene"),
  };
}

/** Whether Pin to project facts may be offered for the current selection in `context.docId`. */
export function canPinSelection(context: SelectionActionContext): boolean {
  return captureSingleBlockSelection(context) !== null;
}

/** Finds the project holding `docId`: from the Library first, else through Continue and its workspace index. */
async function resolveProjectId(
  services: PersonServices,
  docId: string,
): Promise<string | null> {
  const known = services.library.documentProject(docId).get();
  if (known !== null) return known;
  const own = await services.openHandle(indexDocId("user", services.userId));
  let workspaceId: string | null = null;
  try {
    workspaceId =
      readContinueMap(liveMap(own, "continue")).get(docId)?.workspaceId ?? null;
  } finally {
    await own.close();
  }
  if (workspaceId === null) return null;
  const workspace = await services.openHandle(
    indexDocId("workspace", workspaceId),
  );
  try {
    return (
      readWorkspace({
        projects: liveMap(workspace, "projects"),
        documents: liveMap(workspace, "documents"),
      }).documents.get(docId)?.projectId ?? null
    );
  } finally {
    await workspace.close();
  }
}

/** Waits for an index that has never synced to finish its initial sync before reading episodes, unless offline or blocked. */
function waitForIndexReady(handle: DocHandle): Promise<void> {
  const ready = (): boolean => {
    if (isHandleWriteBlocked(handle)) return true;
    const status = handle.status.get();
    return (
      status.docSync === "synced" ||
      status.link === "offline" ||
      !status.neverSynced ||
      status.waiting > 0
    );
  };
  if (ready()) return Promise.resolve();
  return new Promise((resolve) => {
    const done = (): void => {
      stopStatus();
      stopReadOnly();
      resolve();
    };
    const check = (): void => {
      if (ready()) done();
    };
    const stopStatus = handle.status.subscribe(check);
    const stopReadOnly = handle.readOnly.subscribe(check);
    check();
  });
}

/**
 * Pins the current single-block selection of `context.docId` to its project's `facts` map and posts the brief message.
 * Refuses without mutating when the selection is invalid, the person lacks edit access on the project index, or sync
 * cannot open the index.
 */
export async function pinSelectionToFacts(
  context: SelectionActionContext,
): Promise<boolean> {
  const captured = captureSingleBlockSelection(context);
  if (captured === null) return false;
  const { docId, services, environment } = context;
  const projectId = await resolveProjectId(services, docId).catch(() => null);
  if (projectId === null) return false;
  if (environment.online()) {
    const access = await checkFactsAccess({
      projectId,
      userId: services.userId,
      tabStorage: environment.tabStorage,
    });
    if (access === "read_only" || access === "no_access") return false;
  }
  const index = services.projectIndex(projectId);
  try {
    const [handle, facts] = await Promise.all([
      index.handle(),
      index.map("facts"),
    ]).catch(() => [null, null] as const);
    if (handle === null || facts === null) return false;
    await waitForIndexReady(handle);
    if (isHandleWriteBlocked(handle)) return false;
    const episode = [...readEpisodes(handle.doc()).values()].find(
      (entry) =>
        entry.docIds.script === docId ||
        entry.docIds.outline === docId ||
        entry.docIds.roomLog === docId,
    );
    const value: FactValue = {
      docId,
      episodeId: episode?.id ?? null,
      sceneHeadingId: captured.sceneHeadingId,
      sceneLabel: captured.sceneLabel,
      anchor: captured.anchor,
      byUserId: services.userId,
      at: environment.now(),
    };
    facts.set(environment.randomId(), value);
    services.messages.push({
      id: "fact_pinned",
      text: FACTS_WORDS.pinned,
      actions: [
        {
          label: FACTS_WORDS.projectSettings,
          commandId: "project.openSettings",
        },
      ],
      lifetime: "brief",
      ownWork: false,
    });
    return true;
  } finally {
    void index.close();
  }
}

/** The selection toolbar's More ▾ item: Pin to project facts (not a command). */
export const pinFactSelectionSlot: SelectionActionSlot = Object.freeze({
  id: "facts.pin",
  label: FACTS_WORDS.pin,
  place: "more",
  rank: 0,
  available: canPinSelection,
  run: (context: SelectionActionContext): void => {
    void pinSelectionToFacts(context);
  },
});
