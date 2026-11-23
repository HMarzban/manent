// A script's alternates on its page: the marker of each speech that has some, the speech the caret is in, and the
// alternates popover under a speech, which swaps one in as one change.
import { ALTERNATES_MAP, jsonMap, swapAlternate } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import {
  materialPlugin as editorMaterialPlugin,
  speechPlace,
} from "@manent/editor";
import type { EditorView, Plugin } from "@manent/editor";
import { randomBlockId } from "@manent/schema";
import { MATERIAL_WORDS } from "@manent/ui";
import type { AlternatesPopoverProps } from "../material/alternates/alternates-popover.tsx";
import { createAlternatesRoot } from "../material/alternates/popover-root.ts";
import type { AlternatesRoot } from "../material/alternates/popover-root.ts";
import { alternatesBySpeech } from "../material/alternates/speech-alternates.ts";
import type { KeptAlternate } from "../material/alternates/speech-alternates.ts";
import { nameOf } from "../services/sync/index-entries.ts";
import { materialActions } from "../state/material.store.ts";
import { liveEditor, subscribeLiveEditors } from "./live-editor.ts";
import type { EditorPluginContext } from "./plugins.ts";

type Focus = AlternatesPopoverProps["focus"];
type SwapIn =
  { type: "alternate"; alternateId: string } | { type: "text"; text: string };

// the popover's gap under the speech, px
const GAP_PX = 4;
const UNDO = Object.freeze({ label: "Undo", commandId: "edit.undo" });

/** Each page that shows alternates, with what opens the popover of the speech its caret is in. */
const openers = new Map<EditorView, (focus: Focus) => boolean>();

const noop = (): void => {};

/** Opens the alternates popover under the speech the caret of `docId`'s page is in; false when it is in none. */
export function showAlternatesIn(docId: string, focus: Focus): boolean {
  const editor = liveEditor(docId);
  return editor !== null && (openers.get(editor.view)?.(focus) ?? false);
}

export function materialPlugin(context: EditorPluginContext): Plugin {
  const { docId, services } = context;
  // the document of this page while its editor may edit it; null otherwise, when it shows no alternates
  let doc: CrdtDoc | null = null;
  let bySpeech: ReadonlyMap<string, readonly KeptAlternate[]> = new Map();
  let counts: ReadonlyMap<string, number> = new Map();
  let caret: string | null = null;
  let shown: { blockId: string; focus: Focus } | null = null;
  let root: AlternatesRoot | null = null;
  let view: EditorView | null = null;

  const alternatesOf = (): Readonly<Record<string, unknown>> =>
    doc === null ? {} : jsonMap(doc, ALTERNATES_MAP).entries();
  const read = (entries: Readonly<Record<string, unknown>>): void => {
    bySpeech = alternatesBySpeech(entries);
    counts = new Map(
      [...bySpeech].map(([blockId, kept]) => [blockId, kept.length]),
    );
  };
  // after the change that told it: no interface store is written while the editor applies one; a page with the caret
  // outside a speech and no alternates tells nothing
  const publish = (): void =>
    queueMicrotask(() => {
      if (doc === null) return;
      if (caret === null && counts.size === 0)
        return materialActions.leave(docId, alternatesOf);
      materialActions.follow(docId, {
        caretInSpeech: caret !== null,
        alternates: caret === null ? 0 : (counts.get(caret) ?? 0),
        alternatesOf,
      });
    });

  const close = (): void => {
    if (shown === null) return;
    shown = null;
    root?.render(null);
    document.removeEventListener("scroll", draw, true);
    window.removeEventListener("resize", draw);
  };
  const closeToPage = (): void => {
    close();
    view?.focus();
  };

  const swap = (swapIn: SwapIn): void => {
    if (shown === null || doc === null || view === null || !view.editable)
      return;
    const { blockId } = shown;
    const chosen =
      swapIn.type === "alternate"
        ? (bySpeech.get(blockId)?.find((a) => a.id === swapIn.alternateId) ??
          null)
        : null;
    const swapped = swapAlternate(doc, {
      blockId,
      swapIn,
      authorUserId: services.userId,
      now: Date.now,
      ids: randomBlockId,
    });
    closeToPage();
    if (!swapped.ok) return;
    const writer =
      chosen === null || chosen.authorUserId === services.userId
        ? null
        : nameOf(chosen.authorUserId);
    services.messages.push({
      id: "alternate_swapped",
      text: MATERIAL_WORDS.swapped(writer),
      actions: [UNDO],
      lifetime: "reverse",
      ownWork: false,
    });
  };

  function draw(): void {
    if (shown === null || view === null) return;
    const place = speechPlace(view, shown.blockId);
    if (place === null) return close();
    root ??= createAlternatesRoot();
    root.render({
      blockId: shown.blockId,
      props: {
        rows: (bySpeech.get(shown.blockId) ?? []).map((alternate) => ({
          id: alternate.id,
          text: alternate.text,
          writer: nameOf(alternate.authorUserId),
          pitched: alternate.pitched,
        })),
        place: { left: place.left, top: place.bottom + GAP_PX },
        focus: shown.focus,
        onUse: (alternateId) => swap({ type: "alternate", alternateId }),
        onType: (text) => swap({ type: "text", text }),
        onClose: closeToPage,
      },
    });
  }

  const show = (blockId: string, focus: Focus): void => {
    if (shown === null) {
      document.addEventListener("scroll", draw, true);
      window.addEventListener("resize", draw);
    }
    shown = { blockId, focus };
    draw();
  };

  return editorMaterialPlugin({
    follow(page, changed) {
      view = page;
      let stopMap = noop;
      // the page's editor is registered once it is made, after this plugin's view
      const attach = (): void => {
        const editor = liveEditor(docId);
        if (editor === null || editor.view !== page || editor.doc === doc)
          return;
        if (!editor.editable) return;
        stopMap();
        doc = editor.doc;
        const map = jsonMap(doc, ALTERNATES_MAP);
        read(map.entries());
        stopMap = map.subscribe(() => {
          read(map.entries());
          changed();
          publish();
          draw();
        });
        changed();
        publish();
      };
      const stopEditors = subscribeLiveEditors(attach);
      attach();
      openers.set(page, (focus) => {
        if (caret === null || doc === null) return false;
        show(caret, focus);
        return true;
      });
      return () => {
        stopEditors();
        stopMap();
        openers.delete(page);
        close();
        root?.destroy();
        root = null;
        queueMicrotask(() => materialActions.leave(docId, alternatesOf));
      };
    },
    counts: () => counts,
    marker: (count) => ({
      text: MATERIAL_WORDS.marker(count),
      name: MATERIAL_WORDS.markerName(count),
    }),
    onOpen: (blockId) => show(blockId, "list"),
    onCaretSpeech(blockId) {
      caret = blockId;
      publish();
    },
  });
}
