// Bridges @manent/editor's annotations plugin (underlines, gutter markers, [[ note trigger) with the comment popover.
import { annotationsPlugin as editorAnnotationsPlugin } from "@manent/editor";
import type { Annotation, EditorView, Plugin } from "@manent/editor";
import type { Pagination } from "@manent/pagination";
import { textAnchorAt } from "@manent/schema";
import { COMMENTS_WORDS } from "@manent/ui";
import {
  EMPTY_BLOCK_SCENES,
  anchoredBlockIds,
  annotationsFor,
  isSameIdSet,
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
  ANNOTATION_GAP_PX,
  anchorAt,
  anchorPlace,
  coordsPlace,
  currentSceneId,
  fallbackPlace,
  findBlock,
  livePlace,
} from "./annotation-places.ts";
import type { PmDoc } from "./annotation-places.ts";
import {
  liveEditor,
  livePagination,
  subscribeLiveEditors,
} from "./live-editor.ts";
import type { EditorPluginContext } from "./plugins.ts";

const noop = (): void => {};

export function annotationsPlugin(context: EditorPluginContext): Plugin {
  const { docId, services, frames } = context;
  let lastState: ScriptCommentsState | null = null;
  let lastActiveId: string | null = null;
  let cachedList: readonly Annotation[] = [];
  let view: EditorView | null = null;
  let lastScannedDoc: PmDoc | null = null;
  let lastScannedPages: Pagination | null = null;
  let lastAnchorIds: ReadonlySet<string> = new Set();
  let cancelRefresh: (() => void) | null = null;
  let root: CommentPopoverRoot | null = null;
  let shown: PopoverMode | null = null;
  let popoverKey = 0;
  let pendingFrame: number | null = null;
  let commitSeq = 0;

  const cancelPendingFrame = (): void => {
    if (pendingFrame === null) return;
    cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
  };

  const commitScenes = (
    scenes: ReadonlyMap<string, SceneBlockInfo>,
    deferCommit: boolean,
  ): void => {
    const seq = ++commitSeq;
    if (!deferCommit) return commentsActions.setBlockScenes(docId, scenes);
    queueMicrotask(() => {
      if (seq === commitSeq) commentsActions.setBlockScenes(docId, scenes);
    });
  };

  const refreshScenes = (deferCommit = false): void => {
    const currentView = liveEditor(docId)?.view ?? view;
    const pagination = livePagination(docId);
    if (currentView === null) return;
    const state = commentsActions.get(docId);
    const anchorIds = anchoredBlockIds(state);
    if (anchorIds.size === 0) {
      lastScannedDoc = currentView.state.doc;
      lastScannedPages = pagination;
      lastAnchorIds = anchorIds;
      if (state.blockScenes.size > 0)
        commitScenes(EMPTY_BLOCK_SCENES, deferCommit);
      return;
    }
    if (
      currentView.state.doc === lastScannedDoc &&
      pagination === lastScannedPages &&
      isSameIdSet(anchorIds, lastAnchorIds)
    )
      return;
    lastScannedDoc = currentView.state.doc;
    lastScannedPages = pagination;
    lastAnchorIds = anchorIds;
    commitScenes(
      scanBlockScenes(lastScannedDoc, pagination, anchorIds),
      deferCommit,
    );
  };

  const scheduleRefresh = (): void => {
    if (cancelRefresh !== null) return;
    const state = commentsActions.get(docId);
    if (anchoredBlockIds(state).size === 0 && state.blockScenes.size === 0)
      return;
    cancelRefresh = frames.request(() => {
      cancelRefresh = null;
      refreshScenes(false);
    });
  };

  const getAnnotations = (): readonly Annotation[] => {
    refreshScenes(true);
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
          editor === null ? noop : editor.doc.subscribe(scheduleRefresh);
        refreshScenes(true);
      };
      const stopEditors = subscribeLiveEditors(attach);
      attach();
      const stopStore = commentsActions.subscribe(docId, () => {
        scheduleRefresh();
        listener();
        if (shown !== null) renderPopover();
      });
      const stopUi = commentsActions.subscribeUi(docId, listener);
      return () => {
        commitSeq += 1;
        cancelRefresh?.();
        cancelRefresh = null;
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
        lastScannedPages = null;
        lastAnchorIds = new Set();
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
        place: { left: at.left, top: at.top + ANNOTATION_GAP_PX },
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
