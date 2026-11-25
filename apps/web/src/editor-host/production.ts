// The editor's revisions feature over the document's production services, and what production asks of the open
// editor: its selection, its pages as production lays them out, the four commands that act on the text, and a place.
import {
  bringBackScene,
  clearRevised,
  commandKeymap,
  isNumberedHeading,
  markRevised,
  omitScene,
  paginationKey,
  productionOf,
  revisionKey,
  revisionPlugins,
} from "@manent/editor";
import type {
  EditorView,
  PageRow,
  Plugin,
  ProductionPort,
  ProductionView,
} from "@manent/editor";
import { profileFromSettings, readLayoutSettings } from "@manent/pagination";
import type { LockAnchorRecord } from "@manent/pagination";
import { baseEngine, layoutImpact } from "@manent/revisions";
import type { LockedLayout, RevisionSource } from "@manent/revisions";
import { blocksOf } from "@manent/schema";
import type { FlatBlock } from "@manent/schema";
import { PRODUCTION_WORDS } from "@manent/ui";
import {
  keepProductionServices,
  productionServicesFor,
} from "../production/live-services.ts";
import { LOCK_ICON } from "../production/lock-icon.ts";
import type {
  ProductionEditor,
  ProductionServices,
} from "../production/services.ts";
import { liveEditor } from "./live-editor.ts";
import type { EditorPluginContext } from "./plugins.ts";

export type RevisionCommand =
  "mark_revised" | "clear_revised" | "omit_scene" | "bring_back_scene";

type EditorState = EditorView["state"];

const COMMANDS: Readonly<Record<RevisionCommand, typeof markRevised>> =
  Object.freeze({
    mark_revised: markRevised,
    clear_revised: clearRevised,
    omit_scene: omitScene,
    bring_back_scene: bringBackScene,
  });

const SVG = "http://www.w3.org/2000/svg";

function lockIcon(): Element {
  const svg = document.createElementNS(SVG, "svg");
  for (const [name, value] of Object.entries(LOCK_ICON.svg))
    svg.setAttribute(name, value);
  for (const shape of LOCK_ICON.shapes) {
    const element = document.createElementNS(SVG, shape.tag);
    for (const [name, value] of Object.entries(shape.attrs))
      element.setAttribute(name, value);
    svg.append(element);
  }
  return svg;
}

/** The block the selection starts in. */
function startBlock(state: EditorState) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === "block") return node;
  }
  return null;
}

function selectionOf(
  state: EditorState,
): ReturnType<ProductionEditor["selection"]> {
  const block = startBlock(state);
  if (block === null) return null;
  if (!isNumberedHeading(block.attrs.type)) return "text";
  return block.attrs.omitted === true ? "omitted_scene" : "scene";
}

/** The heading's number as the page shows it: derived in production, else its own. */
function sceneNumberOf(state: EditorState): string {
  const block = startBlock(state);
  const id: unknown = block?.attrs.id;
  const own: unknown = block?.attrs.num;
  const derived =
    typeof id === "string"
      ? revisionKey.getState(state)?.layout?.patches.get(id)?.num
      : undefined;
  if (typeof derived === "string") return derived;
  return typeof own === "string" ? own : "";
}

/**
 * Runs `command` in `docId`'s open editor; false when none is open or it does nothing there. `scene` is the
 * number of the heading the selection starts in, as it was before the command ran.
 */
export function runRevisionCommand(
  docId: string,
  command: RevisionCommand,
): { ran: boolean; scene: string } {
  const view = liveEditor(docId)?.view;
  if (view === undefined) return { ran: false, scene: "" };
  const scene = sceneNumberOf(view.state);
  return { ran: COMMANDS[command](view.state, view.dispatch, view), scene };
}

/** A port and a sink over services that arrive after the editor is built: out of production until then. */
function deferred(): {
  port: ProductionPort;
  pages: { publish(rows: readonly PageRow[], scenes: readonly string[]): void };
  connect(services: ProductionServices, detach: () => void): void;
  isDisposed(): boolean;
} {
  let services: ProductionServices | null = null;
  let detachEditor: (() => void) | null = null;
  let hadSubscribers = false;
  let disposed = false;
  const viewStops = new Map<() => void, () => void>();
  const keyStops = new Map<(keys: readonly string[]) => void, () => void>();
  const releaseIfEmpty = (): void => {
    if (!hadSubscribers || viewStops.size > 0 || keyStops.size > 0) return;
    disposed = true;
    detachEditor?.();
    detachEditor = null;
  };
  return {
    port: {
      view: (): ProductionView | null => services?.port.view() ?? null,
      subscribe(listener) {
        hadSubscribers = true;
        viewStops.set(
          listener,
          services === null ? () => {} : services.port.subscribe(listener),
        );
        return () => {
          viewStops.get(listener)?.();
          viewStops.delete(listener);
          releaseIfEmpty();
        };
      },
      overrides: {
        get: (key) => services?.port.overrides.get(key) ?? null,
        set: (key, value) => services?.port.overrides.set(key, value),
        subscribe(listener) {
          hadSubscribers = true;
          keyStops.set(
            listener,
            services === null
              ? () => {}
              : services.port.overrides.subscribe(listener),
          );
          return () => {
            keyStops.get(listener)?.();
            keyStops.delete(listener);
            releaseIfEmpty();
          };
        },
      },
    },
    pages: { publish: (rows, scenes) => services?.sink.publish(rows, scenes) },
    connect(connected, detach) {
      if (disposed) {
        detach();
        return;
      }
      services = connected;
      detachEditor = detach;
      for (const [listener, stop] of viewStops) {
        stop();
        viewStops.set(listener, connected.port.subscribe(listener));
      }
      for (const [listener, stop] of keyStops) {
        stop();
        keyStops.set(listener, connected.port.overrides.subscribe(listener));
      }
      for (const listener of viewStops.keys()) listener();
    },
    isDisposed: () => disposed,
  };
}

/**
 * The revisions feature of `context.docId`'s editor. The document's production services are made on its first
 * mount for the person, from their handle of it, and the editor follows them from then on.
 */
export function productionEditorPlugin(context: EditorPluginContext): Plugin {
  const { docId, services: person } = context;
  // Ink has no pages to lock; its editor is built again when the format changes
  if (person.openScriptStore(docId).get("script.format") === "ink")
    return commandKeymap({ resolve: () => null, run: () => false });
  const { userId } = person;
  const live = deferred();
  const follow = (services: ProductionServices): void => {
    if (live.isDisposed()) return;
    const detach = services.attach({
      selection: () => {
        const view = liveEditor(docId)?.view;
        return view === undefined ? null : selectionOf(view.state);
      },
      revisedPages: () => {
        const view = liveEditor(docId)?.view;
        return view === undefined
          ? []
          : (revisionKey.getState(view.state)?.revisedPages ?? []);
      },
    });
    live.connect(services, detach);
  };
  const held = productionServicesFor(docId);
  if (held !== null && held.userId === userId) {
    if (held.port.view() !== null) context.setScenesNumbered(true);
    follow(held);
  } else
    // the services load apart from the editor, with the person's sync
    void Promise.all([
      person.openHandle(docId),
      import("../production/services.ts"),
    ]).then(
      ([handle, { createProductionServices }]) => {
        if (live.isDisposed()) return;
        follow(
          keepProductionServices(docId, userId, () =>
            createProductionServices({
              docId,
              handle,
              userId,
              now: Date.now,
              messages: person.messages,
            }),
          ),
        );
      },
      // a script whose sync never started, or whose services could not load, has no production to follow
      () => {},
    );
  return revisionPlugins({
    port: live.port,
    facts: context.facts,
    pages: live.pages,
    scaffold: () => liveEditor(docId)?.scaffold ?? null,
    layer: () => context.layer(),
    zoom: () => context.zoom(),
    scenesNumbered: (on) => context.setScenesNumbered(on),
    lockIcon,
    lockMarkerName: PRODUCTION_WORDS.lockMarkerName,
    frames: context.frames,
  });
}

/** What production lays out in an open editor: what the Issue screen checks, states and draws. */
export interface LiveProduction {
  readonly flat: readonly FlatBlock[];
  /** As the issued file lays the pages out. */
  readonly locked: LockedLayout;
  readonly records: readonly LockAnchorRecord[];
  /** Oldest first; the active revision last, with its marks as they are now. */
  readonly sources: readonly RevisionSource[];
  /** The labels of the pages the active revision marks, in page order. */
  readonly revisedPages: readonly string[];
}

/** Null while `docId` has no open editor, or its script is not in production. */
export function liveProduction(docId: string): LiveProduction | null {
  const state = liveEditor(docId)?.view.state;
  if (state === undefined) return null;
  const production = productionOf(state);
  const revision = revisionKey.getState(state);
  if (production === null || revision === undefined || revision.locked === null)
    return null;
  const { view } = production;
  return {
    flat: blocksOf(state.doc),
    locked: revision.locked,
    records: view.records,
    sources: [...view.earlier, { ...view.active, marks: revision.marks }],
    revisedPages: revision.revisedPages,
  };
}

/**
 * The locked pages a change of one setting would give A-pages and leave ending early, laid out from `read`, the
 * script's settings as they are now; null while `docId` has no open editor in production, or the change has no pages.
 */
export function layoutChangeImpact(
  docId: string,
  read: (key: string) => unknown,
  change: { key: string; value: unknown },
): { gainAPages: string[]; fallShort: string[] } | null {
  const state = liveEditor(docId)?.view.state;
  const pages = state === undefined ? undefined : paginationKey.getState(state);
  const production = state === undefined ? null : productionOf(state);
  if (pages === undefined || production === null) return null;
  const { engine, profile } = pages.settings;
  const after = profileFromSettings(engine, {
    ...readLayoutSettings((key) =>
      key === change.key ? change.value : read(key),
    ),
    scenesNumbered: true,
  });
  if (after === null) return null;
  return layoutImpact(
    pages.index.blocks,
    profile,
    after,
    production.view.records,
    baseEngine(engine),
  );
}

/** Scrolls `docId`'s open page to the start of the page labelled `label`; nothing when no such page is drawn. */
export function showPage(docId: string, label: string): void {
  const view = liveEditor(docId)?.view;
  const pages =
    view === undefined ? undefined : paginationKey.getState(view.state);
  if (view === undefined || pages === undefined) return;
  const page = pages.pagination.pages.find((held) => held.label === label);
  const block = page === undefined ? undefined : pages.index.blocks[page.block];
  if (block === undefined) return;
  view.dom
    .querySelector(`[data-id=${JSON.stringify(block.id)}]`)
    ?.scrollIntoView({ block: "start" });
}

/** Scrolls `docId`'s open page to the scene heading that shows `scene`; nothing when none does. */
export function showScene(docId: string, scene: string): void {
  const view = liveEditor(docId)?.view;
  if (view === undefined) return;
  const patches = revisionKey.getState(view.state)?.layout?.patches;
  const heading = blocksOf(view.state.doc).find(({ attrs }) => {
    if (!isNumberedHeading(attrs.type) || attrs.id === null) return false;
    return (patches?.get(attrs.id)?.num ?? attrs.num) === scene;
  });
  if (heading === undefined || heading.attrs.id === null) return;
  view.dom
    .querySelector(`[data-id=${JSON.stringify(heading.attrs.id)}]`)
    ?.scrollIntoView({ block: "start" });
}
