import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { textAnchorAt } from "@manent/schema";
import type { Node } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  GUTTER_COLUMNS,
  annotationsPlugin,
  changesPlugin,
  createPageScaffold,
  gutterColumnPx,
  markPosition,
  paginationPlugin,
  setChanges,
} from "../src/index.ts";
import { compareDocs } from "@manent/revisions";
import type { DocJSON } from "@manent/schema";
import type { Annotation } from "../src/index.ts";
import { bid, docOfBlocks, sp } from "./docs.ts";

withDom();

interface MountedAnnotations {
  view: EditorView;
  frame: HTMLElement;
  setList(next: readonly Annotation[]): void;
  activations: {
    id: string;
    at: { left: number; top: number };
    ids: readonly string[];
  }[];
  labels: [number, number][];
  destroy(): void;
}

function mountAnnotations(
  doc: Node,
  initial: readonly Annotation[],
): MountedAnnotations {
  const place = document.createElement("div");
  Object.defineProperty(place, "clientHeight", { value: 100_000 });
  document.body.append(place);
  const scaffold = createPageScaffold({
    place,
    profile: sp,
    engine: "chromium",
  });
  let list = initial;
  const listeners = new Set<() => void>();
  const activations: MountedAnnotations["activations"] = [];
  const labels: [number, number][] = [];
  const view = new EditorView(scaffold.pages, {
    state: EditorState.create({
      doc,
      plugins: [
        paginationPlugin({
          profile: sp,
          defer: (run) => run(),
          offFontNote: "note",
          onPages: (count) => scaffold.setPageCount(count),
        }),
        changesPlugin(),
        annotationsPlugin({
          annotations: () => list,
          subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
          label: (comments, notes) => {
            labels.push([comments, notes]);
            return `${comments}c/${notes}n`;
          },
          onActivate: (id, at, ids) => {
            activations.push({ id, at, ids });
          },
          onRemoved() {},
          noteTrigger: { enabled: () => false, onTyped() {} },
        }),
      ],
    }),
  });
  return {
    view,
    frame: scaffold.pages,
    setList(next) {
      list = next;
      for (const listener of listeners) listener();
    },
    activations,
    labels,
    destroy() {
      view.destroy();
      scaffold.destroy();
      place.remove();
    },
  };
}

test("comment and note inline decorations use distinct elements and toggle active state on open or hover", () => {
  const doc = docOfBlocks([
    ["action", "Rain taps the glass window."],
    ["dialogue", "Quiet in the hallway now."],
  ]);
  const commentAnchor = textAnchorAt(
    { id: bid(0), text: "Rain taps the glass window." },
    5,
    19,
  );
  const noteAnchor = textAnchorAt(
    { id: bid(1), text: "Quiet in the hallway now." },
    0,
    12,
  );
  const initial: readonly Annotation[] = [
    { id: "c1", kind: "comment", anchor: commentAnchor, open: false },
    { id: "n1", kind: "note", anchor: noteAnchor, open: false },
  ];
  const mounted = mountAnnotations(doc, initial);

  const commentEl = () =>
    mounted.view.dom.querySelector<HTMLElement>("mn-comment");
  const noteEl = () => mounted.view.dom.querySelector<HTMLElement>("mn-note");

  expect([
    commentEl()?.className,
    commentEl()?.hasAttribute("data-active"),
    noteEl()?.className,
    noteEl()?.hasAttribute("data-active"),
  ]).toEqual(["mn-comment", false, "mn-note", false]);

  mounted.setList([
    { id: "c1", kind: "comment", anchor: commentAnchor, open: false },
    { id: "n1", kind: "note", anchor: noteAnchor, open: true },
  ]);

  expect([
    commentEl()?.hasAttribute("data-active"),
    noteEl()?.hasAttribute("data-active"),
    mounted.frame
      .querySelector<HTMLButtonElement>(
        `button.mn-marker[data-block="${bid(0)}"]`,
      )
      ?.getAttribute("aria-pressed"),
    mounted.frame
      .querySelector<HTMLButtonElement>(
        `button.mn-marker[data-block="${bid(1)}"]`,
      )
      ?.getAttribute("aria-pressed"),
  ]).toEqual([false, true, "false", "true"]);

  const commentMarker = mounted.frame.querySelector<HTMLButtonElement>(
    `button.mn-marker[data-block="${bid(0)}"]`,
  )!;
  commentMarker.dispatchEvent(new MouseEvent("mouseenter"));
  expect(commentEl()?.hasAttribute("data-active")).toBe(true);
  commentMarker.dispatchEvent(new MouseEvent("mouseleave"));
  expect(commentEl()?.hasAttribute("data-active")).toBe(false);

  mounted.destroy();
});

test("gutter markers distinguish comments, notes and mixed blocks and pass all block ids on click", () => {
  const doc = docOfBlocks([
    ["action", "First line has a comment."],
    ["action", "Second line has a note."],
    ["action", "Third line has both marks."],
  ]);
  const a0 = textAnchorAt(
    { id: bid(0), text: "First line has a comment." },
    0,
    10,
  );
  const a1 = textAnchorAt(
    { id: bid(1), text: "Second line has a note." },
    0,
    11,
  );
  const a2c = textAnchorAt(
    { id: bid(2), text: "Third line has both marks." },
    0,
    10,
  );
  const a2n = textAnchorAt(
    { id: bid(2), text: "Third line has both marks." },
    15,
    25,
  );
  const mounted = mountAnnotations(doc, [
    { id: "c0", kind: "comment", anchor: a0, open: false },
    { id: "n1", kind: "note", anchor: a1, open: false },
    { id: "c2", kind: "comment", anchor: a2c, open: false },
    { id: "n2", kind: "note", anchor: a2n, open: false },
  ]);

  const markers = [
    ...mounted.frame.querySelectorAll<HTMLButtonElement>("button.mn-marker"),
  ];
  expect(
    markers.map((m) => ({
      block: m.dataset["block"],
      kind: m.dataset["kind"],
      label: m.getAttribute("aria-label"),
      title: m.title,
      text: m.textContent,
      svgs: m.querySelectorAll("svg").length,
      commentIcons: m.querySelectorAll("[data-comment-icon]").length,
    })),
  ).toEqual([
    {
      block: bid(0),
      kind: "comment",
      label: "1c/0n",
      title: "1c/0n",
      text: "1",
      svgs: 1,
      commentIcons: 1,
    },
    {
      block: bid(1),
      kind: "note",
      label: "0c/1n",
      title: "0c/1n",
      text: "1",
      svgs: 1,
      commentIcons: 0,
    },
    {
      block: bid(2),
      kind: "mixed",
      label: "1c/1n",
      title: "1c/1n",
      text: "2",
      svgs: 2,
      commentIcons: 1,
    },
  ]);

  markers[2]!.click();
  expect(mounted.activations).toEqual([
    { id: "c2", at: { left: 0, top: 0 }, ids: ["c2", "n2"] },
  ]);

  mounted.destroy();
});

test("clicking a hovered gutter marker clears hover so closing the annotation does not leave its underline active", () => {
  const doc = docOfBlocks([["action", "Rain taps the glass window."]]);
  const anchor = textAnchorAt(
    { id: bid(0), text: "Rain taps the glass window." },
    5,
    19,
  );
  const mounted = mountAnnotations(doc, [
    { id: "c1", kind: "comment", anchor, open: false },
  ]);

  const underline = () =>
    mounted.view.dom.querySelector<HTMLElement>("mn-comment");
  const marker = () =>
    mounted.frame.querySelector<HTMLButtonElement>(
      `button.mn-marker[data-block="${bid(0)}"]`,
    )!;

  marker().dispatchEvent(new MouseEvent("mouseenter"));
  expect(underline()?.hasAttribute("data-active")).toBe(true);

  marker().click();
  // Host opens the annotation in response to click, replacing the marker DOM node before mouseleave fires.
  mounted.setList([{ id: "c1", kind: "comment", anchor, open: true }]);
  expect(underline()?.hasAttribute("data-active")).toBe(true);

  mounted.setList([{ id: "c1", kind: "comment", anchor, open: false }]);
  expect(underline()?.hasAttribute("data-active")).toBe(false);

  // Removing a hovered marker during redraw also clears hover.
  marker().dispatchEvent(new MouseEvent("mouseenter"));
  expect(underline()?.hasAttribute("data-active")).toBe(true);
  mounted.setList([]);
  mounted.setList([{ id: "c1", kind: "comment", anchor, open: false }]);
  expect(underline()?.hasAttribute("data-active")).toBe(false);

  mounted.destroy();
});

test("annotation markers sit right beside the sheet normally and shift clear of diff initials in page compare mode", () => {
  const doc = docOfBlocks([["action", "Rain taps the glass window."]]);
  const anchor = textAnchorAt(
    { id: bid(0), text: "Rain taps the glass window." },
    5,
    19,
  );
  const mounted = mountAnnotations(doc, [
    { id: "c1", kind: "comment", anchor, open: false },
  ]);
  const markerLeft = () =>
    Number.parseFloat(
      mounted.frame.querySelector<HTMLButtonElement>("button.mn-marker")?.style
        .left ?? "NaN",
    );
  const baseGutter = markPosition(sp, 0, 0).gutterPx;
  expect(markerLeft()).toBe(gutterColumnPx(baseGutter, GUTTER_COLUMNS.changes));

  const docJson = doc.toJSON() as DocJSON;
  mounted.view.dispatch(
    setChanges(mounted.view.state.tr, {
      baseline: docJson,
      comparison: compareDocs(docJson, docJson),
      display: "page",
    }),
  );
  expect(markerLeft()).toBe(
    gutterColumnPx(baseGutter, GUTTER_COLUMNS.comments),
  );

  mounted.view.dispatch(setChanges(mounted.view.state.tr, null));
  expect(markerLeft()).toBe(gutterColumnPx(baseGutter, GUTTER_COLUMNS.changes));

  mounted.destroy();
});
