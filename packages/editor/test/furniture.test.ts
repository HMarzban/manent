import { expect, test } from "bun:test";
import { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { renameLocationEntry } from "../src/actions/rename-character.ts";
import { createFurnitureSync } from "../src/script-editor/furniture.ts";
import type { Timers } from "../src/script-editor/ports.ts";
import { docOfBlocks } from "./docs.ts";

function fakeTimers(): Timers & { advance(ms: number): void } {
  let now = 1_700_000_000_000;
  let jobs: { at: number; fn: () => void }[] = [];
  return {
    now: () => now,
    schedule(fn, delayMs) {
      const job = { at: now + delayMs, fn };
      jobs.push(job);
      return () => {
        jobs = jobs.filter((other) => other !== job);
      };
    },
    advance(ms) {
      now += ms;
      const due = jobs.filter((job) => job.at <= now);
      jobs = jobs.filter((job) => job.at > now);
      for (const job of due) job.fn();
    },
  };
}

test("furniture fallback duration debounces during typing without timingPlugin and updates after 250 ms", () => {
  const timers = fakeTimers();
  const calls: (number | null | undefined)[] = [];
  const header = {
    left: { kind: "duration" },
    center: { kind: "none" },
    right: { kind: "page_number" },
    firstPage: true,
    rule: false,
  };
  const sync = createFurnitureSync({
    script: {
      get: (key) => (key === "script.header" ? header : null),
      subscribe: () => () => {},
    },
    title: { get: () => "Show" },
    timers,
    format: () => "variety",
    scaffold: () =>
      ({
        setFurniture: (opts: { durationMs?: number | null }) =>
          calls.push(opts.durationMs),
      }) as unknown as ReturnType<
        Parameters<typeof createFurnitureSync>[0]["scaffold"]
      >,
  });
  const doc1 = docOfBlocks([["dialogue", "One two three four five."]]);
  const plugin = sync.plugin();
  const state1 = EditorState.create({ doc: doc1, plugins: [plugin] });
  const fakeView = { state: state1 } as unknown as EditorView;
  const view = plugin.spec.view!(fakeView);
  sync.sync(state1);
  expect(calls.length).toBe(1);
  const initialDuration = calls[0]!;

  // Typing updates doc without recomputing duration immediately
  const state2 = state1.apply(
    state1.tr.insertText(" six seven eight nine ten eleven twelve", 2),
  );
  (fakeView as { state: EditorState }).state = state2;
  view.update!(fakeView, state1);
  expect(calls).toEqual([initialDuration]);

  // After 250 ms debounce, the new duration is published
  timers.advance(250);
  expect(calls.length).toBe(2);
  expect(calls[1]! > initialDuration).toBe(true);
  view.destroy!();
});

test("rename_location accepts multiple variant spellings in one undo step", () => {
  const doc = docOfBlocks([
    ["scene_heading", "INT. CAFE - DAY"],
    ["scene_heading", "EXT. CAFFE - NIGHT"],
    ["scene_heading", "INT. CAFÉ - DAY"],
  ]);
  let state = EditorState.create({ doc });
  let closedSteps = 0;
  let dispatches = 0;
  const view = {
    get state() {
      return state;
    },
    dispatch(tr: EditorState["tr"]) {
      dispatches += 1;
      state = state.apply(tr);
    },
  } as unknown as EditorView;
  const res = renameLocationEntry.run(
    view,
    { kind: "rename_location", from: ["CAFE", "CAFFE"], to: "CAFÉ" },
    {
      history: {
        undo: () => false,
        redo: () => false,
        canUndo: () => false,
        canRedo: () => false,
        closeStep: () => {
          closedSteps += 1;
        },
        onStep: () => () => {},
      },
    } as unknown as Parameters<typeof renameLocationEntry.run>[2],
  );
  const headings: string[] = [];
  state.doc.descendants((node) => {
    if (node.isTextblock) headings.push(node.textContent);
  });
  expect([res, dispatches, closedSteps, headings]).toEqual([
    { ok: true },
    1,
    2,
    ["INT. CAFÉ - DAY", "EXT. CAFÉ - NIGHT", "INT. CAFÉ - DAY"],
  ]);
});
