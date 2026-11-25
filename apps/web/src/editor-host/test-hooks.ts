// The test build's hooks into the open editor, which the end-to-end tests and the benchmark drive; never installed in production.
import { paginationKey } from "@manent/editor";
import type { EditorView, SavedPlace } from "@manent/editor";
import type { Page } from "@manent/pagination";
import { readMarks, setMarksEnabled } from "@manent/perf";
import type { MarkRecord } from "@manent/perf";
import { FORMATS, blocksOf, parseDoc } from "@manent/schema";
import type { DocJSON, FormatId } from "@manent/schema";
import type { StatusFacts } from "@manent/ui";
import { afterNextPaint } from "../next-paint.ts";
import type { PersonServices } from "../services/ports.ts";
import type { OpenEditor } from "./editor-mount.ts";
import type { LocalSession } from "./editor-sessions.ts";
import { firstBlock } from "./first-block.ts";
import { liveEditor, subscribeLiveEditors } from "./live-editor.ts";
import { createSimulatedWriter } from "./simulated-writer.ts";
import type { SimulatedWriter } from "./simulated-writer.ts";

type Access = "edit" | "comment" | "view";

/** The services with the access the hooks recorded for a document reported in place of its own, every other fact as it is. */
export function withRecordedAccess(
  services: PersonServices,
  access: ReadonlyMap<string, StatusFacts["access"]>,
): PersonServices {
  const { documents } = services;
  return {
    ...services,
    documents: {
      open(docId) {
        const opened = documents.open(docId);
        const recorded = access.get(docId);
        if (recorded === undefined) return opened;
        const over = (facts: StatusFacts): StatusFacts => ({
          ...facts,
          access: recorded,
        });
        const { status } = opened;
        return {
          ...opened,
          status: {
            get: () => over(status.get()),
            subscribe: (listener) =>
              status.subscribe((facts) => listener(over(facts))),
          },
        };
      },
      close: (docId) => documents.close(docId),
    },
  };
}

interface PageStart {
  label: string;
  block: number;
  line: number;
}

export interface EditorHooks {
  /** A new film project whose script has this format and content (null: the format's first block), opened with this access (default "edit"); resolves to its doc id once its editor is open. */
  open(format: string, doc: DocJSON | null, access?: Access): Promise<string>;
  blocks(): {
    id: string;
    type: string;
    kind: string | null;
    text: string;
    section: number;
  }[];
  /** The plugin's pages. */
  pages(): PageStart[];
  /** The pages of a fresh pagination of the current document. */
  cold(): PageStart[];
  engineRuns(): number;
  undoDepth(): number;
  /** The open editor's place now. */
  place(): SavedPlace | null;
  remote: {
    join(person: { userId: string; name: string; colorIndex: number }): void;
    type(block: number, offset: number, text: string): void;
    select(block: number, offset: number): void;
    leave(): void;
  };
  /** Keydown to the next paint, ms. */
  keystrokes: { start(): void; stop(): number[] };
  /** The durations of the editor's document-changing dispatches, ms. */
  dispatchMs: { start(): void; stop(): number[] };
  /** The product marks kept under `name`, oldest first. */
  marks(name: string): MarkRecord[];
}

const startsOf = (pages: readonly Page[]): PageStart[] =>
  pages.map(({ label, block, line }) => ({ label, block, line }));

/** A press's time to the next paint. */
function createKeystrokeProbe(view: () => EditorView): {
  start(): void;
  stop(): number[];
} {
  let samples: number[] = [];
  let watched: HTMLElement | null = null;
  const onKey = (): void => {
    const pressedAt = performance.now();
    afterNextPaint(() => samples.push(performance.now() - pressedAt));
  };
  return {
    start() {
      samples = [];
      watched = view().dom;
      watched.addEventListener("keydown", onKey, { capture: true });
    },
    stop() {
      watched?.removeEventListener("keydown", onKey, { capture: true });
      watched = null;
      return samples;
    },
  };
}

/** Resolves once `docId` has a live editor. */
function whenLive(docId: string): Promise<void> {
  return new Promise((resolve) => {
    if (liveEditor(docId) !== null) {
      resolve();
      return;
    }
    const stop = subscribeLiveEditors(() => {
      if (liveEditor(docId) === null) return;
      stop();
      resolve();
    });
  });
}

interface HookDeps {
  services: PersonServices;
  navigate(path: string): void;
  current(): OpenEditor | null;
  /** The sessions the mount opens: an open document's is the one it holds. */
  sessions: { open(docId: string, format: FormatId): LocalSession };
  /** The access `withRecordedAccess` reports for each document opened through the hooks. */
  access: Map<string, StatusFacts["access"]>;
}

/** The editor the mount has open now; throws when it has none. */
function openEditor(deps: HookDeps): OpenEditor {
  const current = deps.current();
  if (current === null) throw new RangeError("no editor is open");
  return current;
}

/** The hooks' `open`: a new film project in `format`, navigated to, filled with `doc`, or the format's first block, once its editor is live. */
function openScript(deps: HookDeps): EditorHooks["open"] {
  const { services } = deps;
  return async (format, doc, access = "edit") => {
    const known = FORMATS.find((id) => id === format);
    if (known === undefined) throw new RangeError(`no format ${format}`);
    const { docId } = await services.library.createProject(
      services.userId,
      "film",
    );
    deps.access.set(docId, access);
    services.openScriptStore(docId).set("script.format", known);
    deps.navigate(`/s/${docId}`);
    await whenLive(docId);
    // the Library writes the first element of the default format, so a script of another format starts from its own
    const start: DocJSON = doc ?? {
      type: "doc",
      content: [{ type: "section", content: [firstBlock(known)] }],
    };
    const { view } = openEditor(deps).editor;
    view.dispatch(
      view.state.tr
        .replaceWith(0, view.state.doc.content.size, parseDoc(start).content)
        .setMeta("addToHistory", false),
    );
    return docId;
  };
}

/** The hooks' `remote`: one simulated writer at a time over the open document's session. */
function createRemote(deps: HookDeps): EditorHooks["remote"] {
  let writer: SimulatedWriter | null = null;
  const joined = (): SimulatedWriter => {
    if (writer === null) throw new RangeError("nobody has joined");
    return writer;
  };
  return {
    join(person) {
      const { docId } = openEditor(deps);
      const format = deps.services.openScriptStore(docId).get("script.format");
      writer?.leave();
      writer = createSimulatedWriter({
        session: deps.sessions.open(docId, format),
        person,
        clientId: Math.floor(Math.random() * 2 ** 31),
      });
    },
    type: (block, offset, text) => joined().type(block, offset, text),
    select: (block, offset) => joined().select(block, offset),
    leave() {
      joined().leave();
      writer = null;
    },
  };
}

/** Sets `target.editor`: the hooks over the editor the mount has open now, which `current` gives. Turns the product marks on, so the first mount is recorded. */
export function installEditorHooks(
  target: { editor?: EditorHooks },
  deps: HookDeps,
): void {
  const view = (): EditorView => openEditor(deps).editor.view;
  const pagination = () => {
    const state = paginationKey.getState(view().state);
    if (state === undefined)
      throw new RangeError("the open script has no pages");
    return state;
  };
  let dispatchesFromMs = 0;
  target.editor = {
    open: openScript(deps),
    blocks: () =>
      blocksOf(view().state.doc).map((block) => ({
        id: block.attrs.id ?? "",
        type: block.attrs.type,
        kind: block.attrs.kind,
        text: block.runs.map((run) => run.text).join(""),
        section: block.section,
      })),
    pages: () => startsOf(pagination().pagination.pages),
    cold() {
      const { settings } = pagination();
      const fresh = settings.engine.paginate(
        settings.engine.toLayoutBlocks(blocksOf(view().state.doc)),
        settings.profile,
        settings.locks,
      );
      return startsOf(fresh.pages);
    },
    engineRuns: () => pagination().engineRuns,
    undoDepth: () => openEditor(deps).undoDepth(),
    place: () => openEditor(deps).editor.place(),
    remote: createRemote(deps),
    keystrokes: createKeystrokeProbe(view),
    dispatchMs: {
      start() {
        dispatchesFromMs = performance.now();
      },
      stop: () =>
        readMarks("editor.dispatch")
          .filter((record) => record.startMs >= dispatchesFromMs)
          .map((record) => record.durationMs),
    },
    marks: readMarks,
  };
  setMarksEnabled(true);
}
