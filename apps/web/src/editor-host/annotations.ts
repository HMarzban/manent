// Bridges @manent/editor's annotations plugin (underlines, gutter markers, [[ note trigger) with the comment popover.
import { annotationsPlugin as editorAnnotationsPlugin } from "@manent/editor";
import type { Annotation, EditorView, Plugin } from "@manent/editor";
import type { Pagination } from "@manent/pagination";
import { textAnchorAt } from "@manent/schema";
import type { TextAnchor } from "@manent/schema";
import { COMMENTS_WORDS } from "@manent/ui";
import {
  annotationsFor,
  scanBlockScenes,
} from "../comments/annotations-map.ts";
import { fullNameFor } from "../comments/comments-format.ts";
import type {
  PopoverMode,
  PopoverTrigger,
  SceneBlockInfo,
  ScriptCommentsState,
} from "../comments/comments-types.ts";
import { createCommentPopoverRoot } from "../comments/popover-root.ts";
import type { CommentPopoverRoot } from "../comments/popover-root.ts";
import { commentsActions } from "../state/comments.store.ts";
import {
  liveEditor,
  livePagination,
  subscribeLiveEditors,
} from "./live-editor.ts";
import type { EditorPluginContext } from "./plugins.ts";

type PmDoc = EditorView["state"]["doc"];
type PmNode = NonNullable<PmDoc["firstChild"]>;
type Coords = { left: number; top: number };

const GAP_PX = 6;
const noop = (): void => {};

function findBlock(
  doc: PmDoc,
  blockId: string,
): { node: PmNode; contentPos: number } | null {
  let found: { node: PmNode; contentPos: number } | null = null;
  doc.descendants((node: PmNode, pos: number) => {
    if (found !== null) return false;
    if (node.type.name !== "block") return true;
    if (node.attrs.id === blockId) found = { node, contentPos: pos + 1 };
    return false;
  });
  return found;
}

function anchorAt(doc: PmDoc, from: number, to: number): TextAnchor | null {
  const $from = doc.resolve(from);
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name !== "block") continue;
    const id = typeof node.attrs.id === "string" ? node.attrs.id : "";
    if (id === "") return null;
    const text = node.textContent;
    const start = Math.max(0, Math.min(text.length, from - $from.start(depth)));
    const end = Math.max(start, Math.min(text.length, to - $from.start(depth)));
    return textAnchorAt({ id, text }, start, end);
  }
  return null;
}

function fallbackPlace(view: EditorView): Coords {
  const rect = view.dom.getBoundingClientRect();
  return {
    left: Math.max(16, rect.left + rect.width / 2 - 140),
    top: Math.max(16, rect.top + 24),
  };
}

function coordsPlace(view: EditorView, pos: number): Coords {
  try {
    const coords = view.coordsAtPos(pos);
    return { left: coords.left, top: coords.bottom + GAP_PX };
  } catch {
    return fallbackPlace(view);
  }
}

function anchorPlace(view: EditorView, anchor: TextAnchor | null): Coords {
  if (anchor === null) return fallbackPlace(view);
  const block = findBlock(view.state.doc, anchor.blockId);
  if (block === null) return fallbackPlace(view);
  return coordsPlace(
    view,
    block.contentPos + Math.min(anchor.start, block.node.textContent.length),
  );
}

function livePlace(
  view: EditorView,
  mode: PopoverMode,
  state: ScriptCommentsState,
): Coords {
  if (mode.kind === "comment" || mode.kind === "note")
    return anchorPlace(view, mode.anchor);
  const anchor =
    state.threads[mode.id]?.anchor ??
    (state.canEdit
      ? state.notes.find((n) => n.id === mode.id)?.note.anchor
      : null) ??
    null;
  if (anchor === null) return fallbackPlace(view);
  return state.removedIds.has(mode.id) ? mode.place : anchorPlace(view, anchor);
}

function currentSceneId(
  doc: PmDoc,
  pos: number,
  blockScenes: ReadonlyMap<string, SceneBlockInfo>,
): string | null {
  const anchor = anchorAt(doc, pos, pos);
  if (anchor === null) return null;
  const id = blockScenes.get(anchor.blockId)?.sceneBlockId ?? "";
  return id === "" ? null : id;
}

export function annotationsPlugin(context: EditorPluginContext): Plugin {
  const { docId, services } = context;
  let lastState: ScriptCommentsState | null = null;
  let lastActiveId: string | null = null;
  let cachedList: readonly Annotation[] = [];
  let view: EditorView | null = null;
  let lastScannedDoc: PmDoc | null = null;
  let lastScannedPages: Pagination | null = null;
  let root: CommentPopoverRoot | null = null;
  let shown: PopoverMode | null = null;
  let popoverKey = 0;
  let pendingFrame: number | null = null;

  const cancelPendingFrame = (): void => {
    if (pendingFrame === null) return;
    cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
  };

  const refreshScenes = (): void => {
    const currentView = liveEditor(docId)?.view ?? view;
    const pagination = livePagination(docId);
    if (
      currentView === null ||
      (currentView.state.doc === lastScannedDoc &&
        pagination === lastScannedPages)
    )
      return;
    lastScannedDoc = currentView.state.doc;
    lastScannedPages = pagination;
    const scenes = scanBlockScenes(lastScannedDoc, pagination);
    queueMicrotask(() => commentsActions.setBlockScenes(docId, scenes));
  };

  const getAnnotations = (): readonly Annotation[] => {
    refreshScenes();
    const state = commentsActions.get(docId);
    const activeId = commentsActions.getUi(docId).activeId;
    if (
      lastState !== null &&
      lastActiveId === activeId &&
      lastState.threads === state.threads &&
      lastState.notes === state.notes &&
      lastState.canEdit === state.canEdit
    )
      return cachedList;
    lastState = state;
    lastActiveId = activeId;
    cachedList = annotationsFor(state, activeId);
    return cachedList;
  };

  const close = (refocus: boolean): void => {
    cancelPendingFrame();
    if (shown === null) return;
    shown = null;
    root?.render("closed", null);
    commentsActions.setActive(docId, null);
    document.removeEventListener("scroll", onScrollOrResize, true);
    window.removeEventListener("resize", onScrollOrResize);
    if (refocus) view?.focus();
  };

  function renderPopover(): void {
    if (shown === null || view === null) return;
    root ??= createCommentPopoverRoot();
    root.render(String(popoverKey), {
      docId,
      mode: shown,
      services,
      writerName: fullNameFor(
        services.userId,
        commentsActions.get(docId).people,
      ),
      now: Date.now,
      onSwitchMode: openMode,
      onClose: () => close(true),
    });
  }

  function onScrollOrResize(event: Event): void {
    if (shown === null || view === null) return;
    if (
      event.type === "scroll" &&
      event.target instanceof Node &&
      !event.target.contains(view.dom)
    )
      return;
    const nextPlace = livePlace(view, shown, commentsActions.get(docId));
    if (
      nextPlace.left === shown.place.left &&
      nextPlace.top === shown.place.top
    )
      return;
    shown = { ...shown, place: nextPlace };
    renderPopover();
  }

  const openMode = (mode: PopoverMode): void => {
    cancelPendingFrame();
    const wasClosed = shown === null;
    shown = mode;
    commentsActions.setActive(docId, mode.kind === "thread" ? mode.id : null);
    if (wasClosed) {
      popoverKey += 1;
      document.addEventListener("scroll", onScrollOrResize, true);
      window.addEventListener("resize", onScrollOrResize);
    }
    renderPopover();
  };

  const handleTrigger = (trigger: PopoverTrigger): boolean => {
    const currentView = liveEditor(docId)?.view ?? view;
    if (currentView === null) return false;
    view = currentView;
    refreshScenes();
    const state = commentsActions.get(docId);
    if (trigger.kind === "selection_comment") {
      if (!state.canComment) return false;
      if (currentView.state.selection.empty) {
        services.messages.push({
          id: "comment_needs_selection",
          text: COMMENTS_WORDS.needsSelection,
          actions: [],
          lifetime: "brief",
          ownWork: false,
        });
        return false;
      }
      const { from, to } = currentView.state.selection;
      const anchor = anchorAt(currentView.state.doc, from, to);
      if (anchor === null) return false;
      openMode({
        kind: "comment",
        anchor,
        place: coordsPlace(currentView, from),
      });
      return true;
    }
    if (trigger.kind === "scene_comment") {
      if (!state.canComment) return false;
      const headingId =
        trigger.headingId ??
        currentSceneId(
          currentView.state.doc,
          currentView.state.selection.from,
          state.blockScenes,
        );
      if (headingId === null) return false;
      const block = findBlock(currentView.state.doc, headingId);
      if (block === null) return false;
      const headingText = block.node.textContent;
      const anchor = textAnchorAt({ id: headingId, text: headingText }, 0, 0);
      services.editor.run({ kind: "go_to", blockId: headingId, offset: 0 });
      cancelPendingFrame();
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = null;
        const latestView = liveEditor(docId)?.view ?? view;
        if (latestView === null) return;
        view = latestView;
        const latestBlock = findBlock(latestView.state.doc, headingId);
        openMode({
          kind: "comment",
          anchor,
          heading: latestBlock?.node.textContent ?? headingText,
          place:
            latestBlock !== null
              ? coordsPlace(latestView, latestBlock.contentPos)
              : fallbackPlace(latestView),
        });
      });
      return true;
    }
    if (trigger.kind === "script_comment") {
      if (!state.canComment) return false;
      openMode({
        kind: "comment",
        anchor: null,
        place: fallbackPlace(currentView),
      });
      return true;
    }
    if (trigger.kind === "note_at_caret") {
      if (!state.canEdit || !currentView.editable) return false;
      const { from, to } = currentView.state.selection;
      const anchor = anchorAt(currentView.state.doc, from, to);
      if (anchor === null) return false;
      openMode({ kind: "note", anchor, place: coordsPlace(currentView, from) });
      return true;
    }
    const thread = state.threads[trigger.id];
    const note = state.canEdit
      ? state.notes.find((n) => n.id === trigger.id)
      : undefined;
    if (thread === undefined && note === undefined) return false;
    const anchor = thread?.anchor ?? note?.note.anchor ?? null;
    if (anchor !== null && !state.removedIds.has(trigger.id)) {
      services.editor.run({
        kind: "go_to",
        blockId: anchor.blockId,
        offset: anchor.start,
      });
    }
    openMode({
      kind: "thread",
      id: trigger.id,
      place: anchorPlace(currentView, anchor),
    });
    return true;
  };

  return editorAnnotationsPlugin({
    annotations: getAnnotations,
    subscribe(listener) {
      const releaseComments = commentsActions.retain(docId, services);
      const unbindOpener = commentsActions.bindOpener(docId, handleTrigger);
      let stopDoc = noop;
      const attach = (): void => {
        const editor = liveEditor(docId);
        view = editor?.view ?? null;
        stopDoc();
        stopDoc =
          editor === null
            ? noop
            : editor.doc.subscribe(() => queueMicrotask(refreshScenes));
        refreshScenes();
      };
      const stopEditors = subscribeLiveEditors(attach);
      attach();
      const stopStore = commentsActions.subscribe(docId, () => {
        listener();
        if (shown !== null) renderPopover();
      });
      const stopUi = commentsActions.subscribeUi(docId, listener);
      return () => {
        stopEditors();
        stopDoc();
        stopStore();
        stopUi();
        unbindOpener();
        close(false);
        root?.destroy();
        root = null;
        view = null;
        lastScannedDoc = null;
        releaseComments();
      };
    },
    label: (comments, notes) => COMMENTS_WORDS.gutterLabel(comments, notes),
    onActivate(id, at, ids) {
      view = liveEditor(docId)?.view ?? view;
      openMode({
        kind: "thread",
        id,
        blockIds: ids.length > 1 ? ids : undefined,
        place: { left: at.left, top: at.top + GAP_PX },
      });
    },
    onRemoved: (ids) => commentsActions.syncRemoved(docId, ids),
    noteTrigger: {
      enabled: () =>
        ((liveEditor(docId)?.view ?? view)?.editable ?? false) &&
        commentsActions.get(docId).canEdit &&
        services.openScriptStore(docId).get("script.format") !== "variety",
      onTyped(at) {
        const currentView = liveEditor(docId)?.view ?? view;
        if (currentView === null) return;
        view = currentView;
        const anchor = anchorAt(currentView.state.doc, at, at);
        if (anchor !== null)
          openMode({
            kind: "note",
            anchor,
            place: coordsPlace(currentView, at),
          });
      },
    },
  });
}
