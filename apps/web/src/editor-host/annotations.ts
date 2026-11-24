// Bridges @manent/editor's annotations plugin (underlines, gutter markers, [[ note trigger) with the comment popover.
import { annotationsPlugin as editorAnnotationsPlugin } from "@manent/editor";
import type { Annotation, EditorView, Plugin } from "@manent/editor";
import { textAnchorAt } from "@manent/schema";
import type { TextAnchor } from "@manent/schema";
import { COMMENTS_WORDS } from "@manent/ui";
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
import { liveEditor, subscribeLiveEditors } from "./live-editor.ts";
import type { EditorPluginContext } from "./plugins.ts";

type PmDoc = EditorView["state"]["doc"];
type PmNode = NonNullable<PmDoc["firstChild"]>;

const GAP_PX = 6;
const SCENE_TYPES = new Set(["scene_heading", "slug", "chapter"]);
const noop = (): void => {};

function scanBlockScenes(doc: PmDoc): ReadonlyMap<string, SceneBlockInfo> {
  const map = new Map<string, SceneBlockInfo>();
  let sceneBlockId = "";
  let heading = "";
  doc.descendants((node: PmNode) => {
    if (node.type.name !== "block") return true;
    const id = typeof node.attrs.id === "string" ? node.attrs.id : "";
    const kind = typeof node.attrs.type === "string" ? node.attrs.type : "";
    if (SCENE_TYPES.has(kind) && id !== "") {
      sceneBlockId = id;
      heading = node.textContent;
    }
    if (id !== "" && sceneBlockId !== "") {
      map.set(id, { sceneBlockId, heading });
    }
    return false;
  });
  return map;
}

function findBlock(
  doc: PmDoc,
  blockId: string,
): { node: PmNode; contentPos: number } | null {
  let found: { node: PmNode; contentPos: number } | null = null;
  doc.descendants((node: PmNode, pos: number) => {
    if (found !== null) return false;
    if (node.type.name !== "block") return true;
    if (node.attrs.id === blockId) {
      found = { node, contentPos: pos + 1 };
      return false;
    }
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
    const blockStart = $from.start(depth);
    const start = Math.max(0, Math.min(text.length, from - blockStart));
    const end = Math.max(start, Math.min(text.length, to - blockStart));
    return textAnchorAt({ id, text }, start, end);
  }
  return null;
}

function fallbackPlace(view: EditorView): { left: number; top: number } {
  const rect = view.dom.getBoundingClientRect();
  return {
    left: Math.max(16, rect.left + rect.width / 2 - 140),
    top: Math.max(16, rect.top + 24),
  };
}

function coordsPlace(
  view: EditorView,
  pos: number,
): { left: number; top: number } {
  try {
    const coords = view.coordsAtPos(pos);
    return { left: coords.left, top: coords.bottom + GAP_PX };
  } catch {
    return fallbackPlace(view);
  }
}

function anchorPlace(
  view: EditorView,
  anchor: TextAnchor | null,
): { left: number; top: number } {
  if (anchor === null) return fallbackPlace(view);
  const block = findBlock(view.state.doc, anchor.blockId);
  if (block === null) return fallbackPlace(view);
  const offset = Math.min(anchor.start, block.node.textContent.length);
  return coordsPlace(view, block.contentPos + offset);
}

function currentSceneId(
  doc: PmDoc,
  pos: number,
  blockScenes: ReadonlyMap<string, SceneBlockInfo>,
): string | null {
  const anchor = anchorAt(doc, pos, pos);
  if (anchor === null) return null;
  return blockScenes.get(anchor.blockId)?.sceneBlockId ?? null;
}

function annotationsFor(state: ScriptCommentsState): readonly Annotation[] {
  const list: Annotation[] = Object.entries(state.threads).map(
    ([id, thread]) => ({
      id,
      kind: "comment",
      anchor: thread.anchor,
      open: thread.state.kind === "open",
    }),
  );
  if (state.canEdit) {
    for (const entry of state.notes) {
      list.push({
        id: entry.id,
        kind: "note",
        anchor: entry.note.anchor,
        open: true,
      });
    }
  }
  return list;
}

export function annotationsPlugin(context: EditorPluginContext): Plugin {
  const { docId, services } = context;
  let lastState: ScriptCommentsState | null = null;
  let cachedList: readonly Annotation[] = [];
  let view: EditorView | null = null;
  let lastScannedDoc: PmDoc | null = null;
  let root: CommentPopoverRoot | null = null;
  let shown: PopoverMode | null = null;
  let popoverKey = 0;

  const refreshScenes = (): void => {
    const currentView = liveEditor(docId)?.view ?? view;
    if (currentView === null || currentView.state.doc === lastScannedDoc)
      return;
    lastScannedDoc = currentView.state.doc;
    const scenes = scanBlockScenes(lastScannedDoc);
    queueMicrotask(() => commentsActions.setBlockScenes(docId, scenes));
  };

  const getAnnotations = (): readonly Annotation[] => {
    refreshScenes();
    const state = commentsActions.get(docId);
    if (
      lastState !== null &&
      lastState.threads === state.threads &&
      lastState.notes === state.notes &&
      lastState.canEdit === state.canEdit
    )
      return cachedList;
    lastState = state;
    cachedList = annotationsFor(state);
    return cachedList;
  };

  const close = (refocus: boolean): void => {
    if (shown === null) return;
    shown = null;
    root?.render("closed", null);
    commentsActions.setActive(docId, null);
    document.removeEventListener("scroll", redraw, true);
    window.removeEventListener("resize", redraw);
    if (refocus) view?.focus();
  };

  const writerName = (): string =>
    fullNameFor(services.userId, commentsActions.get(docId).people);

  function redraw(): void {
    if (shown === null || view === null) return;
    root ??= createCommentPopoverRoot();
    root.render(`${popoverKey}-${shown.kind}`, {
      docId,
      mode: shown,
      services,
      writerName: writerName(),
      now: Date.now,
      onSwitchMode(next) {
        shown = next;
        popoverKey += 1;
        if (next.kind === "thread") commentsActions.setActive(docId, next.id);
        redraw();
      },
      onClose: () => close(true),
    });
  }

  const openMode = (mode: PopoverMode): void => {
    const wasClosed = shown === null;
    shown = mode;
    popoverKey += 1;
    commentsActions.setActive(docId, mode.kind === "thread" ? mode.id : null);
    if (wasClosed) {
      document.addEventListener("scroll", redraw, true);
      window.addEventListener("resize", redraw);
    }
    redraw();
  };

  const handleTrigger = (trigger: PopoverTrigger): boolean => {
    const currentView = liveEditor(docId)?.view ?? view;
    if (currentView === null) return false;
    view = currentView;
    refreshScenes();
    const state = commentsActions.get(docId);
    if (trigger.kind === "selection_comment") {
      if (!state.canComment || currentView.state.selection.empty) return false;
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
      const anchor = textAnchorAt(
        { id: headingId, text: block.node.textContent },
        0,
        0,
      );
      openMode({
        kind: "comment",
        anchor,
        place: coordsPlace(currentView, block.contentPos),
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
      const format = services.openScriptStore(docId).get("script.format");
      if (!state.canEdit || !currentView.editable || format === "variety")
        return false;
      const { from, to } = currentView.state.selection;
      const anchor = anchorAt(currentView.state.doc, from, to);
      if (anchor === null) return false;
      openMode({
        kind: "note",
        anchor,
        place: coordsPlace(currentView, from),
      });
      return true;
    }
    const thread = state.threads[trigger.id];
    const note = state.canEdit
      ? state.notes.find((n) => n.id === trigger.id)
      : undefined;
    const anchor = thread?.anchor ?? note?.note.anchor ?? null;
    if (thread === undefined && note === undefined) return false;
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
        if (shown !== null) redraw();
      });
      return () => {
        stopEditors();
        stopDoc();
        stopStore();
        unbindOpener();
        close(false);
        root?.destroy();
        root = null;
        view = null;
        lastScannedDoc = null;
        releaseComments();
      };
    },
    label: (count) => COMMENTS_WORDS.gutterLabel(count),
    onActivate(id, at) {
      view = liveEditor(docId)?.view ?? view;
      openMode({
        kind: "thread",
        id,
        place: { left: at.left, top: at.top + GAP_PX },
      });
    },
    onRemoved: (ids) => commentsActions.syncRemoved(docId, ids),
    noteTrigger: {
      enabled: () => {
        const currentView = liveEditor(docId)?.view ?? view;
        return (
          (currentView?.editable ?? false) &&
          commentsActions.get(docId).canEdit &&
          services.openScriptStore(docId).get("script.format") !== "variety"
        );
      },
      onTyped(at) {
        const currentView = liveEditor(docId)?.view ?? view;
        if (currentView === null) return;
        view = currentView;
        const anchor = anchorAt(currentView.state.doc, at, at);
        if (anchor === null) return;
        openMode({
          kind: "note",
          anchor,
          place: coordsPlace(currentView, at),
        });
      },
    },
  });
}
