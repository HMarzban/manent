// Opens and follows a script's comments document (edit or view) and, for writers only, its private notes map.
import {
  NOTES_MAP,
  jsonMap,
  readCommentFlags,
  readCommentItems,
  readCommentRounds,
  readCommentThreads,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { isScriptNote } from "@manent/schema";
import type { DocHandle, ViewHandle } from "@manent/sync-client";
import { commentsDocId, projectHome } from "@manent/sync-protocol";
import { COMMENTS_WORDS } from "@manent/ui";
import type { StatusFacts } from "@manent/ui";
import {
  liveEditor,
  subscribeLiveEditors,
} from "../editor-host/live-editor.ts";
import type { DocumentServices, PersonServices } from "../services/ports.ts";
import type {
  CommentsRole,
  CommentsUiState,
  PopoverTrigger,
  SceneBlockInfo,
  ScriptCommentsState,
  StoredNote,
} from "./comments-types.ts";
import type { CommentPerson } from "./people-request.ts";

export type Opener = (trigger: PopoverTrigger) => boolean;

const EMPTY_SET: ReadonlySet<string> = new Set();
const EMPTY_RECORD: Readonly<Record<string, never>> = Object.freeze({});
const EMPTY_NOTES: readonly StoredNote[] = Object.freeze([]);
const EMPTY_PEOPLE: readonly CommentPerson[] = Object.freeze([]);
const EMPTY_SCENES: ReadonlyMap<string, SceneBlockInfo> = new Map();
const EMPTY_DATA = Object.freeze({
  threads: EMPTY_RECORD,
  items: EMPTY_RECORD,
  rounds: EMPTY_RECORD,
  flags: EMPTY_RECORD,
  notes: EMPTY_NOTES,
});

export const DEFAULT_UI: CommentsUiState = Object.freeze({
  filter: "open",
  activeId: null,
});

export const noop = (): void => {};

export const emptyCommentsState = (docId: string): ScriptCommentsState => ({
  docId,
  access: "view",
  role: "viewer",
  canComment: false,
  canEdit: false,
  loading: true,
  ...EMPTY_DATA,
  people: EMPTY_PEOPLE,
  peopleState: "idle",
  removedIds: EMPTY_SET,
  blockScenes: EMPTY_SCENES,
});

const isAccessLost = (server: StatusFacts["server"]): boolean =>
  server === "access_removed" || server === "deleted";

function roleOf(
  access: StatusFacts["access"],
  readOnly: boolean,
  server: StatusFacts["server"],
): CommentsRole {
  if (
    access === "view" ||
    access === "too_old" ||
    readOnly ||
    isAccessLost(server)
  )
    return "viewer";
  return access === "comment" ? "commenter" : "editor";
}

function readNotesFrom(doc: CrdtDoc): readonly StoredNote[] {
  const list: StoredNote[] = [];
  for (const [id, value] of Object.entries(jsonMap(doc, NOTES_MAP).entries()))
    if (isScriptNote(value)) list.push({ id, note: value });
  return list.toSorted((a, b) => (a.note.at ?? 0) - (b.note.at ?? 0));
}

export interface CommentsEntry {
  readonly docId: string;
  readonly services: PersonServices;
  readonly docServices: DocumentServices;
  refs: number;
  state: ScriptCommentsState;
  ui: CommentsUiState;
  listeners: Set<() => void>;
  uiListeners: Set<() => void>;
  opener: Opener | null;
  handle: DocHandle | null;
  view: ViewHandle | null;
  openingMode: "none" | "edit" | "view";
  checkingDevice: boolean;
  loadProblemNotified: boolean;
  closed: boolean;
  stopDocMaps: () => void;
  stopHandleEvents: () => void;
  stopNotes: () => void;
  stopScriptStatus: () => void;
  stopProject: () => void;
  stopEditors: () => void;
  loadingPeople: Promise<void> | null;
}

export const emitComments = (entry: CommentsEntry): void => {
  for (const listener of entry.listeners) listener();
};

export const emitCommentsUi = (entry: CommentsEntry): void => {
  for (const listener of entry.uiListeners) listener();
};

function attachCommentsDoc(entry: CommentsEntry, doc: CrdtDoc): void {
  entry.stopDocMaps();
  const refresh = (): void => {
    entry.state = {
      ...entry.state,
      loading: false,
      threads: readCommentThreads(doc),
      items: readCommentItems(doc),
      rounds: readCommentRounds(doc),
      flags: readCommentFlags(doc),
    };
    emitComments(entry);
  };
  const stops = [
    jsonMap(doc, "threads").subscribe(refresh),
    jsonMap(doc, "items").subscribe(refresh),
    jsonMap(doc, "rounds").subscribe(refresh),
    jsonMap(doc, "flags").subscribe(refresh),
  ];
  entry.stopDocMaps = () => {
    for (const stop of stops) stop();
  };
  refresh();
}

function syncNotes(entry: CommentsEntry): void {
  entry.stopNotes();
  entry.stopNotes = noop;
  const editor = liveEditor(entry.docId);
  // Private notes live in the script CRDT and must never be read for commenters or viewers.
  if (!entry.state.canEdit || editor === null || !editor.editable) {
    if (entry.state.notes.length > 0) {
      entry.state = { ...entry.state, notes: EMPTY_NOTES };
      emitComments(entry);
    }
    return;
  }
  const scriptDoc = editor.doc;
  const refresh = (): void => {
    const nowEditor = liveEditor(entry.docId);
    const notes =
      entry.state.canEdit && nowEditor !== null && nowEditor.editable
        ? readNotesFrom(scriptDoc)
        : EMPTY_NOTES;
    entry.state = { ...entry.state, notes };
    emitComments(entry);
  };
  entry.stopNotes = jsonMap(scriptDoc, NOTES_MAP).subscribe(refresh);
  refresh();
}

function applyAccess(entry: CommentsEntry, status: StatusFacts): void {
  const handleReadOnly =
    entry.handle !== null && entry.handle.readOnly.get() !== null;
  const role = roleOf(status.access, handleReadOnly, status.server);
  const canComment = role === "editor" || role === "commenter";
  const canEdit = role === "editor";
  if (
    entry.state.access === status.access &&
    entry.state.role === role &&
    entry.state.canComment === canComment &&
    entry.state.canEdit === canEdit
  )
    return;
  entry.state = {
    ...entry.state,
    access: status.access,
    role,
    canComment,
    canEdit,
  };
  if (!canEdit && entry.ui.filter === "writers") {
    entry.ui = { ...entry.ui, filter: "open" };
    emitCommentsUi(entry);
  }
  syncNotes(entry);
  emitComments(entry);
}

function closeHandles(entry: CommentsEntry): void {
  entry.stopDocMaps();
  entry.stopDocMaps = noop;
  entry.stopHandleEvents();
  entry.stopHandleEvents = noop;
  if (entry.handle !== null) {
    void entry.handle.close();
    entry.handle = null;
  }
  if (entry.view !== null) {
    entry.view.close();
    entry.view = null;
  }
  entry.openingMode = "none";
}

function notifyLoadProblem(entry: CommentsEntry): void {
  if (entry.loadProblemNotified) return;
  entry.loadProblemNotified = true;
  entry.services.messages?.push({
    id: `comments_load_problem_${entry.docId}`,
    text: COMMENTS_WORDS.loadProblem,
    actions: [],
    lifetime: "brief",
    ownWork: false,
  });
}

function clearOnAccessLost(entry: CommentsEntry): void {
  closeHandles(entry);
  entry.state = { ...entry.state, loading: false, ...EMPTY_DATA };
  emitComments(entry);
}

function handleOpenFailure(entry: CommentsEntry, mode: "view" | "edit"): void {
  if (entry.closed || entry.openingMode !== mode) return;
  entry.openingMode = "none";
  entry.state = { ...entry.state, loading: false };
  emitComments(entry);
  notifyLoadProblem(entry);
}

function startView(entry: CommentsEntry): void {
  if (entry.closed || entry.openingMode === "view") return;
  closeHandles(entry);
  entry.openingMode = "view";
  entry.state = { ...entry.state, ...EMPTY_DATA };
  emitComments(entry);
  void entry.services
    .viewComments(entry.docId)
    .then((view) => {
      if (entry.closed || entry.openingMode !== "view") return view.close();
      entry.view = view;
      entry.loadProblemNotified = false;
      entry.state = { ...entry.state, loading: false };
      emitComments(entry);
    })
    .catch(() => handleOpenFailure(entry, "view"));
}

function startEdit(entry: CommentsEntry, home: string | null): void {
  if (entry.closed || entry.openingMode === "edit") return;
  closeHandles(entry);
  entry.openingMode = "edit";
  void entry.services
    .openComments(entry.docId, home)
    .then((handle) => {
      if (entry.closed || entry.openingMode !== "edit") {
        void handle.close();
        return;
      }
      entry.handle = handle;
      entry.loadProblemNotified = false;
      const stopReplaced = handle.on((event) => {
        if (event.type === "replaced") attachCommentsDoc(entry, handle.doc());
      });
      const stopReadOnly = handle.readOnly.subscribe(() =>
        applyAccess(entry, entry.docServices.status.get()),
      );
      entry.stopHandleEvents = () => {
        stopReplaced();
        stopReadOnly();
      };
      attachCommentsDoc(entry, handle.doc());
      applyAccess(entry, entry.docServices.status.get());
    })
    .catch(() => handleOpenFailure(entry, "edit"));
}

const isSettled = (status: StatusFacts): boolean =>
  status.network === "offline" ||
  status.neverSynced ||
  status.server !== "syncing";

function ensureOpen(entry: CommentsEntry, status: StatusFacts): void {
  if (entry.closed) return;
  if (isAccessLost(status.server)) return clearOnAccessLost(entry);
  if (status.access === "view" || status.access === "too_old")
    return startView(entry);
  if (entry.openingMode === "edit") return;
  const homeOf = (): string | null => {
    const projectId = entry.services.library.documentProject(entry.docId).get();
    return projectId === null ? null : projectHome(projectId);
  };
  const home = homeOf();
  if (
    isSettled(status) &&
    (home !== null || status.network === "offline" || status.neverSynced)
  )
    return startEdit(entry, home);
  if (entry.checkingDevice) return;
  entry.checkingDevice = true;
  const finishIfSettled = (): void => {
    if (entry.closed || entry.openingMode !== "none") return;
    const latest = entry.docServices.status.get();
    if (isAccessLost(latest.server)) return clearOnAccessLost(entry);
    if (latest.access === "view" || latest.access === "too_old") return;
    if (isSettled(latest)) startEdit(entry, homeOf());
  };
  void entry.services
    .onDevice([commentsDocId(entry.docId)])
    .then((held) => {
      entry.checkingDevice = false;
      if (entry.closed || entry.openingMode !== "none") return;
      const latest = entry.docServices.status.get();
      if (isAccessLost(latest.server)) return clearOnAccessLost(entry);
      if (latest.access === "view" || latest.access === "too_old") return;
      if (held.has(commentsDocId(entry.docId))) startEdit(entry, homeOf());
      else finishIfSettled();
    })
    .catch(() => {
      entry.checkingDevice = false;
      finishIfSettled();
    });
}

export function createCommentsEntry(
  docId: string,
  services: PersonServices,
): CommentsEntry {
  const docServices = services.documents.open(docId);
  const initial = docServices.status.get();
  const role = roleOf(initial.access, false, initial.server);
  const entry: CommentsEntry = {
    docId,
    services,
    docServices,
    refs: 0,
    state: {
      ...emptyCommentsState(docId),
      access: initial.access,
      role,
      canComment: role === "editor" || role === "commenter",
      canEdit: role === "editor",
    },
    ui: DEFAULT_UI,
    listeners: new Set(),
    uiListeners: new Set(),
    opener: null,
    handle: null,
    view: null,
    openingMode: "none",
    checkingDevice: false,
    loadProblemNotified: false,
    closed: false,
    stopDocMaps: noop,
    stopHandleEvents: noop,
    stopNotes: noop,
    stopScriptStatus: noop,
    stopProject: noop,
    stopEditors: noop,
    loadingPeople: null,
  };
  const onStatus = (): void => {
    const status = docServices.status.get();
    applyAccess(entry, status);
    ensureOpen(entry, status);
  };
  entry.stopScriptStatus = docServices.status.subscribe(onStatus);
  entry.stopProject = services.library
    .documentProject(docId)
    .subscribe(() => ensureOpen(entry, docServices.status.get()));
  entry.stopEditors = subscribeLiveEditors(() => syncNotes(entry));
  syncNotes(entry);
  onStatus();
  return entry;
}

export function disposeCommentsEntry(entry: CommentsEntry): void {
  entry.closed = true;
  entry.stopScriptStatus();
  entry.stopProject();
  entry.stopEditors();
  entry.stopNotes();
  closeHandles(entry);
  entry.services.documents.close(entry.docId);
}
