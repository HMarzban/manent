// Ink problem and visited line marks: problem underline + gutter mark + hover/caret tooltip + once-per-entry
// polite announcement, and visited gutter dot + tooltip.
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, PluginView } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import { blockNumber } from "../cursors/place.ts";
import { INK_MARKS_CSS } from "./marks-css.ts";

/** One compiler or play problem on a 1-based line of an Ink script. */
export interface InkProblem {
  /** 1-based line number. */
  readonly line: number;
  readonly message: string;
}

/** Reactive source of problem lines and visited lines for an Ink script. */
export interface InkMarkSource {
  problems(): readonly InkProblem[];
  /** 1-based line numbers visited during play. */
  visited(): ReadonlySet<number>;
  subscribe(listener: () => void): () => void;
}

/** Optional host hooks for mounting the plugin's styles/tooltip and announcing problem lines. */
export interface InkMarksHost {
  readonly layer?: HTMLElement | null | (() => HTMLElement | null);
  readonly announce?: (text: string) => void;
}

interface InkMarksState {
  readonly decorations: DecorationSet;
  readonly problemsByLine: ReadonlyMap<number, string>;
}

const inkMarksKey: PluginKey<InkMarksState> = new PluginKey("ink-marks");

const VISITED_LABEL = "Visited";

const problemMarkLabel = (line: number): string => `Problem on line ${line}`;
const problemAnnouncement = (line: number, message: string): string =>
  `Line ${line}: ${message}`;

function groupProblems(problems: readonly InkProblem[]): Map<number, string> {
  const byLine = new Map<number, string>();
  for (const { line, message } of problems) {
    if (line < 1 || message === "") continue;
    const existing = byLine.get(line);
    byLine.set(
      line,
      existing === undefined ? message : `${existing} · ${message}`,
    );
  }
  return byLine;
}

function createGutterElement(
  doc: Document,
  line: number,
  problemMessage: string | undefined,
  isVisited: boolean,
): HTMLElement {
  const box = doc.createElement("span");
  box.className = "mn-ink-gutter";
  box.contentEditable = "false";
  if (problemMessage !== undefined) {
    const mark = doc.createElement("span");
    mark.className = "mn-ink-mark mn-ink-mark-problem";
    mark.setAttribute("role", "img");
    mark.setAttribute("aria-label", problemMarkLabel(line));
    mark.dataset["inkMark"] = "problem";
    mark.dataset["inkLine"] = String(line);
    mark.dataset["inkTip"] = problemMessage;
    box.append(mark);
  }
  if (isVisited) {
    const dot = doc.createElement("span");
    dot.className = "mn-ink-mark mn-ink-mark-visited";
    dot.setAttribute("role", "img");
    dot.setAttribute("aria-label", VISITED_LABEL);
    dot.dataset["inkMark"] = "visited";
    dot.dataset["inkLine"] = String(line);
    dot.dataset["inkTip"] = VISITED_LABEL;
    box.append(dot);
  }
  return box;
}

function buildState(
  doc: ProseMirrorNode,
  source: InkMarkSource,
): InkMarksState {
  const problemsByLine = groupProblems(source.problems());
  const visited = source.visited();
  if (problemsByLine.size === 0 && visited.size === 0)
    return { decorations: DecorationSet.empty, problemsByLine };

  let maxLine = 0;
  for (const line of problemsByLine.keys()) if (line > maxLine) maxLine = line;
  for (const line of visited) if (line > maxLine) maxLine = line;

  const decorations: Decoration[] = [];
  let line = 1;
  let pos = 0;
  for (let s = 0; s < doc.childCount && line <= maxLine; s++) {
    const section = doc.child(s);
    let blockPos = pos + 1;
    for (let c = 0; c < section.childCount && line <= maxLine; c++) {
      const block = section.child(c);
      const message = problemsByLine.get(line);
      const isVisited = visited.has(line);
      if (message !== undefined) {
        decorations.push(
          Decoration.node(blockPos, blockPos + block.nodeSize, {
            class: "mn-ink-problem",
            "data-ink-problem-line": String(line),
          }),
        );
      }
      if (message !== undefined || isVisited) {
        const currentLine = line;
        const key = `ink-mark-${currentLine}-${message ?? ""}-${isVisited ? "1" : "0"}`;
        decorations.push(
          Decoration.widget(
            blockPos + 1,
            (view) =>
              createGutterElement(
                view.dom.ownerDocument,
                currentLine,
                message,
                isVisited,
              ),
            { side: -1, ignoreSelection: true, key },
          ),
        );
      }
      blockPos += block.nodeSize;
      line++;
    }
    pos += section.nodeSize;
  }

  return {
    decorations: DecorationSet.create(doc, decorations),
    problemsByLine,
  };
}

function resolveLayer(view: EditorView, host?: InkMarksHost): HTMLElement {
  const fromHost =
    typeof host?.layer === "function" ? host.layer() : host?.layer;
  return fromHost ?? view.dom.parentElement ?? view.dom.ownerDocument.body;
}

function caretLineOf(state: EditorState): number | null {
  const { $head } = state.selection;
  if ($head.depth < 2) return null;
  return blockNumber(state, $head) + 1;
}

function marksView(
  view: EditorView,
  source: InkMarkSource,
  host?: InkMarksHost,
): PluginView {
  const doc = view.dom.ownerDocument;
  const style = doc.createElement("style");
  style.textContent = INK_MARKS_CSS;
  const tooltip = doc.createElement("div");
  tooltip.className = "mn-ink-tooltip";
  tooltip.setAttribute("role", "tooltip");
  let live: HTMLElement | null = null;
  let root = resolveLayer(view, host);
  root.append(style);

  let hovered: HTMLElement | null = null;
  let announcedLine: number | null = null;
  let announcedMessage: string | null = null;
  let destroyed = false;

  const ensureRoot = (): HTMLElement => {
    const next = resolveLayer(view, host);
    if (next !== root) {
      root = next;
      if (style.parentNode !== root) root.append(style);
      if (live !== null && live.parentNode !== root) root.append(live);
    }
    return root;
  };

  const announce = (text: string): void => {
    if (host?.announce !== undefined) {
      host.announce(text);
      return;
    }
    const target = ensureRoot();
    if (live === null) {
      live = doc.createElement("div");
      live.className = "mn-ink-live";
      live.setAttribute("aria-live", "polite");
      live.setAttribute("aria-atomic", "true");
      target.append(live);
    }
    live.textContent = "";
    live.textContent = text;
  };

  const showTooltip = (text: string, anchor: HTMLElement | null): void => {
    const target = ensureRoot();
    tooltip.textContent = text;
    if (tooltip.parentNode !== target) target.append(tooltip);
    if (anchor !== null) {
      const box = target.getBoundingClientRect();
      const rect = anchor.getBoundingClientRect();
      tooltip.style.left = `${Math.max(0, rect.left - box.left)}px`;
      tooltip.style.top = `${rect.bottom - box.top + 4}px`;
    }
  };

  const hideTooltip = (): void => {
    tooltip.remove();
  };

  const syncCaret = (): void => {
    const pluginState = inkMarksKey.getState(view.state);
    const line = caretLineOf(view.state);
    const message =
      line === null ? undefined : pluginState?.problemsByLine.get(line);
    if (message === undefined || line === null) {
      announcedLine = null;
      announcedMessage = null;
      if (hovered === null) hideTooltip();
      return;
    }
    if (hovered === null) {
      const anchor = view.dom.querySelector<HTMLElement>(
        `[data-ink-problem-line="${line}"]`,
      );
      showTooltip(message, anchor);
    }
    if (line !== announcedLine || message !== announcedMessage) {
      announcedLine = line;
      announcedMessage = message;
      announce(problemAnnouncement(line, message));
    }
  };

  const onMouseOver = (event: MouseEvent): void => {
    const target =
      event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>("[data-ink-tip]")
        : null;
    if (target === null || target === hovered) return;
    hovered = target;
    const tip = target.dataset["inkTip"];
    if (tip !== undefined) showTooltip(tip, target);
  };

  const onMouseOut = (event: MouseEvent): void => {
    if (hovered === null) return;
    const related = event.relatedTarget;
    if (related instanceof Element && hovered.contains(related)) return;
    hovered = null;
    syncCaret();
  };

  view.dom.addEventListener("mouseover", onMouseOver);
  view.dom.addEventListener("mouseout", onMouseOut);

  const unsubscribe = source.subscribe(() => {
    if (destroyed) return;
    view.dispatch(
      view.state.tr.setMeta("addToHistory", false).setMeta(inkMarksKey, true),
    );
  });

  syncCaret();

  return {
    update() {
      syncCaret();
    },
    destroy() {
      destroyed = true;
      unsubscribe();
      view.dom.removeEventListener("mouseover", onMouseOver);
      view.dom.removeEventListener("mouseout", onMouseOut);
      tooltip.remove();
      live?.remove();
      style.remove();
    },
  };
}

/**
 * Draws Ink problem underlines, problem and visited gutter marks, hover/caret tooltips, and once-per-entry polite
 * problem announcements driven by `source`.
 */
export function inkMarksPlugin(
  source: InkMarkSource,
  host?: InkMarksHost,
): Plugin<InkMarksState> {
  return new Plugin<InkMarksState>({
    key: inkMarksKey,
    state: {
      init: (_config, state) => buildState(state.doc, source),
      apply(tr, prev) {
        if (!tr.docChanged && tr.getMeta(inkMarksKey) !== true) return prev;
        return buildState(tr.doc, source);
      },
    },
    props: {
      decorations: (state) => inkMarksKey.getState(state)?.decorations ?? null,
    },
    view: (view) => marksView(view, source, host),
  });
}
