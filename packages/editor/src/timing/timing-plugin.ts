// Live script timing plugin: incremental per-block totals, per-frame publishing on change, and unread T= underlines.
import type { BracketTime, SlugTime, TimeTotal } from "@manent/pagination";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, PluginView } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { Frames } from "../script-editor/ports.ts";
import type { UnreadTimeWords } from "./decorations.ts";
import { initialTiming, updateTiming } from "./model.ts";
import type { TimingState } from "./model.ts";
import { combineSections, isSameTotal } from "./sections.ts";
import type { TimingUnread } from "./sections.ts";
import { selectionTotal } from "./selection.ts";

/** What the timing plugin tells its sink when the script's timing, its slugs, its selection or its unread forms change. */
export interface TimingFacts {
  readonly script: TimeTotal;
  readonly slugs: readonly SlugTime[];
  readonly selection: TimeTotal | null;
  readonly unread: readonly {
    readonly blockId: string;
    readonly slugId: string | null;
    readonly time: Extract<BracketTime, { ok: false }>;
  }[];
}

export interface TimingSink {
  publish(facts: TimingFacts): void;
}

const timingKey = new PluginKey<TimingState>("timing");

const isSameSelection = (a: TimeTotal | null, b: TimeTotal | null): boolean => {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return isSameTotal(a, b);
};

function isSameSlugs(a: readonly SlugTime[], b: readonly SlugTime[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every(
    (slug, i) =>
      slug.slugId === b[i]!.slugId && isSameTotal(slug.total, b[i]!.total),
  );
}

function isSameUnread(
  a: readonly TimingUnread[],
  b: readonly TimingUnread[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((entry, i) => {
    const other = b[i]!;
    return (
      entry.blockId === other.blockId &&
      entry.slugId === other.slugId &&
      entry.time.code === other.time.code &&
      entry.time.from === other.time.from &&
      entry.time.to === other.time.to
    );
  });
}

function isSameFacts(a: TimingFacts, b: TimingFacts): boolean {
  return (
    isSameTotal(a.script, b.script) &&
    isSameSelection(a.selection, b.selection) &&
    isSameSlugs(a.slugs, b.slugs) &&
    isSameUnread(a.unread, b.unread)
  );
}

/** Animation-frame scheduler from the view's own window, falling back to a cancellable microtask when none exists. */
function defaultFrames(view: EditorView): Frames {
  const win = view.dom.ownerDocument.defaultView;
  if (
    win !== null &&
    typeof win.requestAnimationFrame === "function" &&
    typeof win.cancelAnimationFrame === "function"
  ) {
    return {
      request(fn) {
        const id = win.requestAnimationFrame(() => fn());
        return () => win.cancelAnimationFrame(id);
      },
    };
  }
  return {
    request(fn) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) fn();
      });
      return () => {
        cancelled = true;
      };
    },
  };
}

function timingView(
  view: EditorView,
  sink: TimingSink,
  frames: Frames,
): PluginView {
  let lastPublished: TimingFacts | null = null;
  let cachedVersion = -1;
  let cachedParts: {
    readonly slugs: readonly SlugTime[];
    readonly unread: readonly TimingUnread[];
  } | null = null;
  let cancelFrame: (() => void) | null = null;

  const publish = (): void => {
    cancelFrame = null;
    const timing = timingKey.getState(view.state);
    if (timing === undefined) return;
    if (cachedParts === null || cachedVersion !== timing.version) {
      cachedParts = combineSections(timing.sections);
      cachedVersion = timing.version;
    }
    const next: TimingFacts = {
      script: timing.script,
      slugs: cachedParts.slugs,
      selection: selectionTotal(timing, view.state.selection),
      unread: cachedParts.unread,
    };
    if (lastPublished !== null && isSameFacts(lastPublished, next)) return;
    lastPublished = next;
    sink.publish(next);
  };

  const request = (): void => {
    cancelFrame ??= frames.request(publish);
  };

  request();

  return {
    update(_view, prev: EditorState) {
      const nextTiming = timingKey.getState(view.state);
      const prevTiming = timingKey.getState(prev);
      const selectionChanged =
        !view.state.selection.eq(prev.selection) &&
        !(view.state.selection.empty && prev.selection.empty);
      const selectedDocChanged =
        view.state.doc !== prev.doc && !view.state.selection.empty;
      if (
        nextTiming?.version !== prevTiming?.version ||
        selectionChanged ||
        selectedDocChanged
      )
        request();
    },
    destroy() {
      cancelFrame?.();
      cancelFrame = null;
    },
  };
}

/**
 * Keeps a script's timing live without walking the document after start: recomputes only the blocks a transaction
 * changed (local or remote), draws a dotted `.mn-timing-unread` underline with `words.unreadTime` over every `T=`
 * form that sets no time, and publishes `TimingFacts` to `sink` at most once per frame when a value changed.
 */
export function timingPlugin(options: {
  sink: TimingSink;
  words: { unreadTime: UnreadTimeWords };
  frames?: Frames;
}): Plugin {
  const { sink, words } = options;
  return new Plugin<TimingState>({
    key: timingKey,
    state: {
      init: (_config, state) => initialTiming(state.doc, words.unreadTime),
      apply: (tr, prev) => updateTiming(prev, tr, words.unreadTime),
    },
    props: {
      decorations: (state) => timingKey.getState(state)?.decorations,
    },
    view: (view) =>
      timingView(view, sink, options.frames ?? defaultFrames(view)),
  });
}
