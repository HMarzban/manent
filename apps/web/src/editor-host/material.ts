// A script's writers' material on its page: speech alternates and moving/restoring cuts as single undo steps.
import {
  ALTERNATES_MAP,
  CUTS_MAP,
  isCut,
  jsonMap,
  moveToCuts,
  restoreCut,
  scriptBody,
  swapAlternate,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import {
  materialPlugin as editorMaterialPlugin,
  moveSelectionToCuts,
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
import { readCuts } from "../material/cuts/script-cuts.ts";
import type { KeptCut } from "../material/cuts/script-cuts.ts";
import { nameOf } from "../services/sync/index-entries.ts";
import { materialActions } from "../state/material.store.ts";
import { productionContextActions } from "../state/production-context.store.ts";
import { liveEditor, subscribeLiveEditors } from "./live-editor.ts";
import type { EditorPluginContext } from "./plugins.ts";

type Focus = AlternatesPopoverProps["focus"];
type SwapIn =
  { type: "alternate"; alternateId: string } | { type: "text"; text: string };

// the popover's gap under the speech, px
const GAP_PX = 4;
const UNDO = Object.freeze({ label: "Undo", commandId: "edit.undo" });
const SCENE_ENDS: ReadonlySet<string> = new Set([
  "scene_heading",
  "slug",
  "chapter",
  "act_break",
  "group",
]);
const NUMBERED_HEADINGS: ReadonlySet<string> = new Set([
  "scene_heading",
  "slug",
]);

interface MaterialHost {
  userId: string;
  messages: EditorPluginContext["services"]["messages"];
  openPopover(focus: Focus): boolean;
}

/** Each editable page's material host, with what opens the alternates popover and pushes messages. */
const hosts = new Map<EditorView, MaterialHost>();

const noop = (): void => {};

const pushUndoMessage = (
  messages: MaterialHost["messages"],
  id: string,
  text: string,
): void =>
  messages.push({
    id,
    text,
    actions: [UNDO],
    lifetime: "reverse",
    ownWork: false,
  });

const refuseCuttingWholeScript = (host: MaterialHost): void =>
  host.messages.push({
    id: "cuts_refused",
    text: MATERIAL_WORDS.cannotCutOnly,
    actions: [],
    lifetime: "brief",
    ownWork: true,
  });

/** Opens the alternates popover under the speech the caret of `docId`'s page is in; false when it is in none. */
export function showAlternatesIn(docId: string, focus: Focus): boolean {
  const editor = liveEditor(docId);
  return (
    editor !== null && (hosts.get(editor.view)?.openPopover(focus) ?? false)
  );
}

/** True when cutting `blockIds` would delete every block in `doc`, which would violate ProseMirror's `section+` schema. */
export function wouldEmptyScript(
  doc: Parameters<typeof scriptBody>[0],
  blockIds: readonly string[],
): boolean {
  const total = (scriptBody(doc).materialize().content ?? []).reduce(
    (sum, s) => sum + (s.content?.length ?? 0),
    0,
  );
  return total > 0 && new Set(blockIds).size >= total;
}

function editableHost(docId: string) {
  const editor = liveEditor(docId);
  const host = editor ? hosts.get(editor.view) : undefined;
  return editor?.editable && host ? { editor, host } : null;
}

function moveBlocksToCuts(
  editor: NonNullable<ReturnType<typeof liveEditor>>,
  host: MaterialHost,
  blockIds: readonly string[],
) {
  return moveToCuts(editor.doc, {
    blockIds,
    authorUserId: host.userId,
    now: Date.now,
    ids: randomBlockId,
  });
}

/** Moves every element covered by the selection of `docId`'s open page to cuts in one transaction. */
export function moveSelectionToCutsIn(docId: string): boolean {
  const active = editableHost(docId);
  if (active === null) return false;
  const { editor, host } = active;
  return moveSelectionToCuts(editor.view, (blockIds) => {
    if (wouldEmptyScript(editor.doc, blockIds)) {
      refuseCuttingWholeScript(host);
      return false;
    }
    if (!moveBlocksToCuts(editor, host, blockIds).ok) return false;
    pushUndoMessage(
      host.messages,
      "material_cut",
      MATERIAL_WORDS.movedToCuts(blockIds.length),
    );
    return true;
  });
}

/** Moves the scene whose heading is `headingId` in `docId`'s open page to cuts in one transaction. */
export function moveSceneToCutsIn(
  docId: string,
  headingId: string,
  sceneNumber: string | null,
): boolean {
  const active = editableHost(docId);
  if (active === null) return false;
  const { editor, host } = active;
  const blocks = (scriptBody(editor.doc).materialize().content ?? []).flatMap(
    (s) => s.content ?? [],
  );
  const start = blocks.findIndex((b) => b.attrs?.id === headingId);
  if (start === -1) return false;
  const headingType = String(blocks[start]?.attrs?.type);
  if (
    productionContextActions.get(docId)?.locked === true &&
    NUMBERED_HEADINGS.has(headingType)
  )
    return false;
  const next = blocks.findIndex(
    (b, i) => i > start && SCENE_ENDS.has(String(b.attrs?.type)),
  );
  const blockIds = blocks
    .slice(start, next === -1 ? blocks.length : next)
    .flatMap((b) => (typeof b.attrs?.id === "string" ? [b.attrs.id] : []));
  if (blockIds.length === 0) return false;
  if (new Set(blockIds).size >= blocks.length) {
    refuseCuttingWholeScript(host);
    return false;
  }
  if (!moveBlocksToCuts(editor, host, blockIds).ok) return false;
  pushUndoMessage(
    host.messages,
    "material_cut",
    sceneNumber !== null
      ? MATERIAL_WORDS.movedSceneToCuts(sceneNumber)
      : headingType === "chapter"
        ? MATERIAL_WORDS.movedChapterToCuts
        : MATERIAL_WORDS.movedToCuts(blockIds.length),
  );
  return true;
}

/** Restores the cut `cutId` in `docId`'s open page in one transaction and says so in the message slot. */
export function restoreCutIn(docId: string, cutId: string): boolean {
  const active = editableHost(docId);
  if (active === null) return false;
  const { editor, host } = active;
  const entry = jsonMap(editor.doc, CUTS_MAP).get(cutId);
  if (!isCut(entry)) return false;
  const restored = restoreCut(editor.doc, { cutId, ids: randomBlockId });
  if (!restored.ok) return false;
  pushUndoMessage(
    host.messages,
    "material_restored",
    MATERIAL_WORDS.restoredFromCuts(
      entry.blocks.length,
      restored.placed === "end",
    ),
  );
  return true;
}

export function materialPlugin(context: EditorPluginContext): Plugin {
  const { docId, services } = context;
  // the document of this page while its editor may edit it; null otherwise, when it shows no material
  let doc: CrdtDoc | null = null;
  let bySpeech: ReadonlyMap<string, readonly KeptAlternate[]> = new Map();
  let counts: ReadonlyMap<string, number> = new Map();
  let cuts: readonly KeptCut[] = [];
  let caret: string | null = null;
  let hasSelection = false;
  let shown: { blockId: string; focus: Focus } | null = null;
  let root: AlternatesRoot | null = null;
  let view: EditorView | null = null;

  const mapEntries = (name: typeof ALTERNATES_MAP | typeof CUTS_MAP) =>
    doc === null ? {} : jsonMap(doc, name).entries();
  const alternatesOf = () => mapEntries(ALTERNATES_MAP);
  const cutsOf = () => mapEntries(CUTS_MAP);
  const readAlternates = (entries: Readonly<Record<string, unknown>>): void => {
    bySpeech = alternatesBySpeech(entries);
    counts = new Map([...bySpeech].map(([id, kept]) => [id, kept.length]));
  };
  const publish = (): void =>
    queueMicrotask(() => {
      if (doc === null) return;
      if (!caret && counts.size === 0 && !hasSelection && cuts.length === 0)
        return materialActions.leave(docId, alternatesOf);
      materialActions.follow(docId, {
        caretInSpeech: caret !== null,
        alternates: caret === null ? 0 : (counts.get(caret) ?? 0),
        alternatesOf,
        selection: hasSelection,
        cuts,
        cutsOf,
      });
    });

  let returnFocus: HTMLElement | null = null;
  const close = (): void => {
    if (shown === null) return;
    shown = null;
    root?.render(null);
    document.removeEventListener("scroll", draw, true);
    window.removeEventListener("resize", draw);
  };
  const closeToPage = (): void => {
    const target = returnFocus;
    returnFocus = null;
    close();
    if (target?.isConnected) target.focus({ preventScroll: true });
    else view?.focus();
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
    pushUndoMessage(
      services.messages,
      "alternate_swapped",
      MATERIAL_WORDS.swapped(writer),
    );
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
        place: {
          left: place.left,
          top: place.bottom + GAP_PX,
          above: place.top - GAP_PX,
        },
        focus: shown.focus,
        onUse: (alternateId) => swap({ type: "alternate", alternateId }),
        onType: (text) => swap({ type: "text", text }),
        onClose: closeToPage,
      },
    });
  }

  const show = (blockId: string, focus: Focus): void => {
    if (shown === null) {
      const a = document.activeElement;
      returnFocus = a instanceof HTMLElement && a !== document.body ? a : null;
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
      const attach = (): void => {
        const editor = liveEditor(docId);
        if (!editor?.editable || editor.view !== page || editor.doc === doc)
          return;
        stopMap();
        doc = editor.doc;
        const alternatesMap = jsonMap(doc, ALTERNATES_MAP);
        const cutsMap = jsonMap(doc, CUTS_MAP);
        readAlternates(alternatesMap.entries());
        cuts = readCuts(cutsMap.entries());
        const stopA = alternatesMap.subscribe(() => {
          readAlternates(alternatesMap.entries());
          changed();
          publish();
          draw();
        });
        const stopC = cutsMap.subscribe(() => {
          cuts = readCuts(cutsMap.entries());
          publish();
        });
        stopMap = () => {
          stopA();
          stopC();
        };
        changed();
        publish();
      };
      const stopEditors = subscribeLiveEditors(attach);
      attach();
      hosts.set(page, {
        userId: services.userId,
        messages: services.messages,
        openPopover(focus) {
          if (caret === null || doc === null) return false;
          show(caret, focus);
          return true;
        },
      });
      return () => {
        stopEditors();
        stopMap();
        hosts.delete(page);
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
    onOpen: (blockId) => {
      if (blockId === caret) services.commands.run("alternate.show", "control");
      else show(blockId, "list");
    },
    onCaretSpeech(blockId) {
      caret = blockId;
      publish();
    },
    onSelection(selected) {
      hasSelection = selected;
      publish();
    },
  });
}
