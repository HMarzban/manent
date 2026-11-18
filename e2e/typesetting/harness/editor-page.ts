// The editor page: a script named by the query in the paged editor, mounted with the browser's own ports,
// and a probe the tests read it through.
import {
  DRIFT,
  MID_BLOCK_BREAKS,
  blockAt,
  blockPos,
  contentHeightPx,
  detectEngine,
  faceDescriptors,
  loadScriptFonts,
  mountPageView,
  paginationKey,
  sectionHeightPx,
  sectionNodeView,
  zoomBox,
} from "@manent/editor";
import type {
  BreakStyle,
  DriftReport,
  LoadableFace,
  PageScaffold,
} from "@manent/editor";
import { fontRanges, pageSizePx, profileFor } from "@manent/pagination";
import type { FontFaceKey, Page } from "@manent/pagination";
import {
  CORPUS_FORMATS,
  RULE_SCRIPTS,
  corpusDoc,
  generateBlocks,
} from "@manent/pagination/testing";
import type { CorpusBlock, CorpusFormat } from "@manent/pagination/testing";
import { blocksOf, parseDoc } from "@manent/schema";
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { domLineStarts } from "./dom-lines.ts";

/** Where a page starts. */
export interface PageStart {
  readonly label: string;
  readonly block: number;
  readonly line: number;
}

export interface EditorProbe {
  readonly view: EditorView;
  readonly scaffold: PageScaffold;
  readonly ready: Promise<"ready" | "fallback">;
  /** The plugin's pages. */
  pages(): PageStart[];
  /** The pages of a fresh pagination of the current document. */
  cold(): PageStart[];
  engineRuns(): number;
  /** Calls to the section node views' update since the page loaded. */
  sectionUpdates(): number;
  /** Each section's height in px as the engine gives it, which its intrinsic size is written from. */
  sectionHeights(): number[];
  /** Focuses the editor and selects from `anchor` to `head` (default: a caret), without scrolling. */
  select(anchor: number, head?: number): void;
  /** How this engine draws a page break inside a block. */
  readonly breakStyle: BreakStyle;
  /** The document positions where a page continues a block split across the break. */
  midBreaks(): number[];
  /** The zoomed size of the scroll area at `percent`, as the page count gives it. */
  zoomBox(percent: number): { widthPx: number; heightPx: number };
  /** Resolves once no idle work is waiting, after the next two frames. */
  idle(): Promise<void>;
  /** Every drift report since the page loaded. */
  drift(): DriftReport[];
  /** Where the browser starts each line of the block element, and where the engine does. */
  lineStarts(block: HTMLElement): { dom: number[]; model: number[] };
}

declare global {
  interface Window {
    __mn: EditorProbe;
  }
}

const OFF_FONT_NOTE =
  "Outside the script font — page breaks near this text may differ and it will not print correctly.";

function isCorpusFormat(format: string): format is CorpusFormat {
  return CORPUS_FORMATS.some((known) => known === format);
}

/** `corpus:<blocks>` in `format` (default screenplay), or a rule script by name, in its own format unless one is given. */
function scriptOf(query: URLSearchParams): {
  format: string;
  blocks: readonly CorpusBlock[];
} {
  const name = query.get("script") ?? "corpus:750";
  const format = query.get("format");
  if (name.startsWith("corpus:")) {
    const corpusFormat = format ?? "screenplay";
    if (!isCorpusFormat(corpusFormat))
      throw new RangeError(`the corpus has no format ${corpusFormat}`);
    const count = Number(name.slice("corpus:".length));
    return {
      format: corpusFormat,
      blocks: generateBlocks(corpusFormat, count, 1),
    };
  }
  const rule = RULE_SCRIPTS.find((s) => s.name === name);
  if (rule === undefined) throw new RangeError(`no rule script ${name}`);
  return { format: format ?? rule.format, blocks: rule.blocks };
}

function startsOf(pages: readonly Page[]): PageStart[] {
  return pages.map(({ label, block, line }) => ({ label, block, line }));
}

const query = new URL(location.href).searchParams;
const { format, blocks } = scriptOf(query);
const paper = query.get("paper") === "a4" ? "a4" : "letter";
const profile = profileFor(format, { paper });
if (profile === null) throw new RangeError(`the format ${format} has no pages`);
const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const faces = new Map<FontFaceKey, FontFace>();
const descriptors = faceDescriptors(
  fontRanges("latin"),
  fontRanges("latin-ext"),
);

// idle work waiting to run, and who waits for there to be none
let waiting = 0;
let settled: (() => void)[] = [];
const idleSoon: (run: () => void) => void =
  "requestIdleCallback" in window
    ? (run) => requestIdleCallback(() => run())
    : (run) => setTimeout(run, DRIFT.idleMs);
const reports: DriftReport[] = [];
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

const { view, scaffold } = mountPageView({
  place: document.getElementById("place")!,
  doc: parseDoc(corpusDoc(blocks)),
  profile,
  offFontNote: OFF_FONT_NOTE,
  isRemote: (tr) => tr.getMeta("remote") === true,
  onDrift: (report) => reports.push(report),
  ports: {
    fonts: document.fonts,
    makeFace: (d) => {
      const face = new FontFace(d.family, `url(${d.source}) format("woff2")`, {
        weight: d.weight,
        style: d.style,
        unicodeRange: d.unicodeRange,
        display: d.display,
      });
      faces.set(d.key, face);
      return face;
    },
    wait,
    defer: queueMicrotask,
    whenIdle: (run) => {
      waiting++;
      idleSoon(() => {
        run();
        waiting--;
        if (waiting > 0) return;
        for (const resolve of settled) resolve();
        settled = [];
      });
    },
    userAgent: navigator.userAgent,
  },
});
scaffold.applyZoom(Number(query.get("zoom") ?? "100"));

const engine = detectEngine(navigator.userAgent);
// the editor's own section views, each update counted
let sectionUpdates = 0;
const sectionView = sectionNodeView(engine);
view.setProps({
  nodeViews: {
    section: (...args) => {
      const made = sectionView(...args);
      return {
        ...made,
        update: (...next) => {
          sectionUpdates++;
          return made.update?.(...next) ?? false;
        },
      };
    },
  },
});

// brackets, as the lint refuses a member name that begins with an underscore
window["__mn"] = {
  view,
  scaffold,
  // the faces the editor loads, waited for again as the editor waits for them
  ready: loadScriptFonts({
    fonts: { add: () => {} },
    makeFace: (d): LoadableFace => faces.get(d.key)!,
    faces: descriptors,
    wait,
  }),
  pages: () => startsOf(paginationKey.getState(view.state)!.pagination.pages),
  cold: () => {
    const { settings } = paginationKey.getState(view.state)!;
    const fresh = settings.engine.paginate(
      settings.engine.toLayoutBlocks(blocksOf(view.state.doc)),
      settings.profile,
      settings.locks,
    );
    return startsOf(fresh.pages);
  },
  engineRuns: () => paginationKey.getState(view.state)!.engineRuns,
  sectionUpdates: () => sectionUpdates,
  sectionHeights: () => {
    const state = paginationKey.getState(view.state)!;
    return Array.from(state.index.sectionPos, (_, i) =>
      sectionHeightPx(state, i),
    );
  },
  select: (anchor, head) => {
    view.focus();
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, anchor, head),
      ),
    );
  },
  breakStyle: MID_BLOCK_BREAKS[engine],
  midBreaks: () => {
    const { index, pagination } = paginationKey.getState(view.state)!;
    return pagination.pages
      .filter((p) => p.line > 0)
      .map((p) => blockPos(index, p.block) + 1 + p.offset);
  },
  zoomBox: (percent) => {
    const state = paginationKey.getState(view.state)!;
    const { widthPx, heightPx } = zoomBox(
      pageSizePx(profile).width,
      contentHeightPx(state),
      percent,
    );
    return { widthPx, heightPx };
  },
  idle: async () => {
    await frame();
    await frame();
    if (waiting > 0)
      await new Promise<void>((resolve) => settled.push(resolve));
  },
  drift: () => [...reports],
  lineStarts: (el) => {
    const { index, pagination, settings } = paginationKey.getState(view.state)!;
    const block = blockAt(index, view.posAtDOM(el, 0));
    return {
      dom: domLineStarts(el),
      model: [...settings.engine.lineStartsOf(pagination, block)],
    };
  },
};
