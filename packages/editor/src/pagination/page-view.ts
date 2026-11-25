// The paged editor put together: section editing, pagination and the page's frame, with what touches the world passed in.
import { fontRanges, sanitizeText } from "@manent/pagination";
import { Fragment, Slice } from "prosemirror-model";
import type { Node } from "prosemirror-model";
import { EditorState, Plugin } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  faceDescriptors,
  loadScriptFonts,
  scriptFontsReady,
} from "../page/fonts.ts";
import type { FaceDescriptor, FontSet, LoadableFace } from "../page/fonts.ts";
import {
  PAGE_VIEW_CLASS,
  createPageScaffold,
  detectEngine,
  withBatchedScaffold,
} from "../page/scaffold.ts";
import type { PageFurnitureOptions, PageScaffold } from "../page/index.ts";
import type { SectionOptions } from "../sections/commands.ts";
import { edgeKeysPlugin } from "../sections/edge-keys.ts";
import { keepPlugin } from "../sections/keep.ts";
import { sectionEditingPlugin } from "../sections/plugin.ts";
import { driftPlugin } from "./drift.ts";
import type { DriftReport } from "./drift.ts";
import { paginationKey, paginationPlugin } from "./plugin.ts";
import type { PaginationOptions } from "./plugin.ts";
import { sectionNodeView, spellcheckFor } from "./section-view.ts";

/** Whether a transaction came from another writer; whoever binds the shared document supplies it. */
export type IsRemote = (tr: Transaction) => boolean;

/** Everything that touches the world, supplied by the composition root. */
export interface PageViewPorts {
  /** `document.fonts`, and `FontFace`. */
  readonly fonts: FontSet;
  readonly makeFace: (d: FaceDescriptor) => LoadableFace;
  /** A timer. */
  readonly wait: (ms: number) => Promise<void>;
  /** A microtask. */
  readonly defer: (run: () => void) => void;
  /** `requestIdleCallback`, or a timer of DRIFT.idleMs. */
  readonly whenIdle: (run: () => void) => void;
  readonly userAgent: string;
}

export interface TypesettingOptions
  extends Omit<PaginationOptions, "defer" | "whenIdle">, SectionOptions {
  readonly ports: PageViewPorts;
  readonly onDrift?: (report: DriftReport) => void;
}

/**
 * Section editing, the edge keys, pagination, the kept sections and the drift monitor, in that order. Reflow view has
 * no drift monitor: its lines wrap to the window and were never the engine's.
 */
export function typesettingPlugins(options: TypesettingOptions): Plugin[] {
  return [
    sectionEditingPlugin(options),
    edgeKeysPlugin(),
    paginationPlugin({
      ...options,
      defer: options.ports.defer,
      whenIdle: options.ports.whenIdle,
    }),
    keepPlugin(),
    ...(options.view === "reflow"
      ? []
      : [driftPlugin({ ...options, whenIdle: options.ports.whenIdle })]),
  ];
}

// Pasted or dropped text as sanitizeText leaves it; a text node it empties is dropped.
function sanitizedFragment(fragment: Fragment): Fragment {
  const nodes: Node[] = [];
  fragment.forEach((node) => {
    if (!node.isText) {
      nodes.push(node.copy(sanitizedFragment(node.content)));
      return;
    }
    const text = sanitizeText(node.text ?? "");
    if (text !== "") nodes.push(node.type.schema.text(text, node.marks));
  });
  return Fragment.from(nodes);
}

function sanitizedSlice(slice: Slice): Slice {
  return new Slice(
    sanitizedFragment(slice.content),
    slice.openStart,
    slice.openEnd,
  );
}

/**
 * The page's frame in `place` and an editor of `doc` inside it, with `before`, the typesetting plugins and then
 * `plugins`. The script font starts loading at once; the page is shown when it has loaded or the wait ends.
 * `spelling` says whether the person wants spelling checked; above SPELLCHECK_MAX_BLOCKS blocks it never is.
 */
export function mountPageView(
  options: TypesettingOptions & {
    place: HTMLElement;
    doc: Node;
    plugins?: readonly Plugin[];
    readonly before?: readonly Plugin[];
    readonly dispatchTransaction?: (view: EditorView, tr: Transaction) => void;
    readonly editable?: () => boolean;
    readonly spelling?: () => boolean;
    readonly furniture?: PageFurnitureOptions;
  },
): { view: EditorView; scaffold: PageScaffold; destroy(): void } {
  const { ports, dispatchTransaction, spelling } = options;
  const engine = options.engine ?? detectEngine(ports.userAgent);
  const fontsReady = scriptFontsReady(ports.fonts);
  return withBatchedScaffold(options.place, () => {
    const scaffold = createPageScaffold({
      place: options.place,
      profile: options.profile,
      engine,
      view: options.view,
      furniture: options.furniture,
      initialFontState: fontsReady ? "ready" : "loading",
    });
    if (fontsReady) {
      scaffold.pages.dataset["fonts"] = "ready";
    } else {
      scaffold.pages.dataset["fonts"] = "loading";
      void loadScriptFonts({
        fonts: ports.fonts,
        makeFace: ports.makeFace,
        faces: faceDescriptors(fontRanges("latin"), fontRanges("latin-ext")),
        wait: ports.wait,
      }).then((state) => {
        scaffold.setFontState(state);
        // the drift monitor reports the font state it measured under
        scaffold.pages.dataset["fonts"] = state;
      });
    }
    const plugins = typesettingPlugins({
      ...options,
      engine,
      onPages: (count) => {
        scaffold.setPageCount(count);
        options.onPages?.(count);
      },
    });
    const labelSyncPlugin = new Plugin({
      view(editorView) {
        let lastPagination = paginationKey.getState(
          editorView.state,
        )?.pagination;
        if (lastPagination !== undefined)
          scaffold.setPageLabels(
            lastPagination.pages.map((page) => page.label),
          );
        return {
          update(nextView) {
            const nextPagination = paginationKey.getState(
              nextView.state,
            )?.pagination;
            if (
              nextPagination !== undefined &&
              nextPagination !== lastPagination
            ) {
              lastPagination = nextPagination;
              scaffold.setPageLabels(
                nextPagination.pages.map((page) => page.label),
              );
            }
          },
        };
      },
    });
    const view = new EditorView(scaffold.pages, {
      state: EditorState.create({
        doc: options.doc,
        plugins: [
          ...(options.before ?? []),
          ...plugins,
          labelSyncPlugin,
          ...(options.plugins ?? []),
        ],
      }),
      dispatchTransaction:
        dispatchTransaction && ((tr) => dispatchTransaction(view, tr)),
      editable: options.editable,
      // every state of this view holds the typesetting plugins, the pagination plugin among them
      attributes: (state) => ({
        class: PAGE_VIEW_CLASS,
        spellcheck:
          spelling?.() === false
            ? "false"
            : spellcheckFor(paginationKey.getState(state)!.index.blocks.length),
      }),
      nodeViews: { section: sectionNodeView(engine) },
      transformPasted: sanitizedSlice,
      transformPastedText: sanitizeText,
    });
    return {
      view,
      scaffold,
      destroy() {
        view.destroy();
        scaffold.destroy();
      },
    };
  });
}
