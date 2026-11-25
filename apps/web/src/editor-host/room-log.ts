// The room log editor plugin host: inert for any non-room_log document; connects tags, links, gutter and main-editor jumps.
import {
  askRoomLogLink,
  caretBlockOf,
  roomLogPlugin as editorRoomLogPlugin,
  setRoomLogLink,
  toggleRoomLogTag,
} from "@manent/editor";
import type { EditorView, Plugin, RoomLogLink } from "@manent/editor";
import { ROOM_LOG_WORDS } from "@manent/ui";
import {
  markRoomLogFocused,
  publishRoomLogLine,
  registerRoomLogHost,
} from "../room-log/room-log-bridge.ts";
import { EMPTY_TARGETS, followEpisodeTargets } from "../room-log/targets.ts";
import type { EpisodeTargets } from "../room-log/targets.ts";
import { liveEditor } from "./live-editor.ts";
import type { EditorPluginContext } from "./plugins.ts";

const MAIN_PAGE = "[data-editor-host]";

/** Moves the main script's caret to `link.blockId` through the Beside host when that script is on the main page. */
function openTargetLink(
  context: EditorPluginContext,
  targets: EpisodeTargets,
  link: RoomLogLink,
): void {
  const targetDocId =
    link.kind === "scene" ? targets.scriptDocId : targets.outlineDocId;
  if (targetDocId === null) return;
  const target = liveEditor(targetDocId);
  if (target === null) return;
  if (target.view.dom.closest(MAIN_PAGE) !== null) {
    // focusing the main page detaches Beside's forwarder so `services.editor` targets the main script
    target.view.focus();
    context.services.editor.run({
      kind: "go_to",
      blockId: link.blockId,
      offset: 0,
    });
  }
}

/** Room log editor plugin; inert for every document whose kind is not `room_log`. */
export function roomLogPlugin(context: EditorPluginContext): Plugin {
  const { services, docId } = context;
  const kindSource = services.library.docKindOf(docId);
  const isRoomLog = (): boolean => kindSource.get() === "room_log";

  let targets: EpisodeTargets = EMPTY_TARGETS;
  let currentView: EditorView | null = null;
  let unregisterHost: (() => void) | null = null;
  let stopFocus: (() => void) | null = null;

  const detachHost = (): void => {
    stopFocus?.();
    stopFocus = null;
    unregisterHost?.();
    unregisterHost = null;
  };

  const syncHost = (): void => {
    if (currentView === null || !isRoomLog()) {
      detachHost();
      return;
    }
    if (unregisterHost !== null) return;
    const view = currentView;
    const onFocusIn = (): void => markRoomLogFocused(docId);
    view.dom.addEventListener("focusin", onFocusIn);
    stopFocus = () => view.dom.removeEventListener("focusin", onFocusIn);
    unregisterHost = registerRoomLogHost(docId, {
      toggleTag: (tag) => toggleRoomLogTag(view, tag),
      askLink: (items, choose) => askRoomLogLink(view, items, choose),
      setLink: (linkTo) => setRoomLogLink(view, linkTo),
      isOnLine: () => caretBlockOf(view.state) !== null,
      isEditable: () => view.editable,
    });
  };

  return editorRoomLogPlugin({
    active: isRoomLog,
    layer: () => context.layer(),
    zoom: () => context.zoom(),
    emptyPlaceholder: ROOM_LOG_WORDS.empty,
    tagText: (tag) => ROOM_LOG_WORDS.tags[tag],
    taggedLabel: (tags) => ROOM_LOG_WORDS.tagged(tags),
    resolveLink(link) {
      if (link.kind === "scene") {
        const scene = targets.scenesById.get(link.blockId);
        if (scene === undefined) return null;
        return {
          label: ROOM_LOG_WORDS.sceneMarker(scene.sceneNumber),
          ariaLabel: ROOM_LOG_WORDS.linkedScene(scene.sceneNumber),
        };
      }
      const beat = targets.beatsById.get(link.blockId);
      if (beat === undefined) return null;
      return {
        label: beat.beatText,
        ariaLabel: ROOM_LOG_WORDS.linkedBeat(beat.beatText),
      };
    },
    onOpenLink: (link) => openTargetLink(context, targets, link),
    onView(view) {
      currentView = view;
      if (view === null) detachHost();
      else syncHost();
    },
    onLineChange(line) {
      publishRoomLogLine(docId, {
        onLine: line.onLine,
        editable: line.editable,
        tags: line.tags,
        hasLink: line.linkTo !== null,
      });
    },
    subscribe(listener) {
      let stopTargets: (() => void) | null = null;
      const syncTargets = (notify: boolean): void => {
        if (!isRoomLog()) {
          stopTargets?.();
          stopTargets = null;
          targets = EMPTY_TARGETS;
          syncHost();
          if (notify) listener();
          return;
        }
        syncHost();
        if (stopTargets !== null) return;
        stopTargets = followEpisodeTargets(services, docId, (next) => {
          targets = next;
          listener();
        });
      };
      const stopKind = kindSource.subscribe(() => syncTargets(true));
      syncTargets(false);
      return () => {
        stopKind();
        stopTargets?.();
        stopTargets = null;
        detachHost();
      };
    },
  });
}
