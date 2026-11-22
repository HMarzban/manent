import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { FORMAT_ELEMENTS } from "@manent/schema";
import type { ActBreakKind, BlockType } from "@manent/schema";
import type { Node } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  CUT_MARKER_ATTR,
  NO_PASTED_TEXT,
  blockPos,
  clipboardPlugin,
  idRegistryPlugin,
  paginationPlugin,
  sectionEditingPlugin,
  staticBinding,
  toIndex,
} from "../src/index.ts";
import { bid, counter, docOf, ids, sp, texts } from "./docs.ts";

withDom();

interface ClipboardOptions {
  readonly plainElement?: () => {
    readonly type: BlockType;
    readonly kind: ActBreakKind | null;
  };
  readonly formatElements?: () => readonly string[];
}

const isUndoRedo = (tr: Transaction): boolean => tr.getMeta("undo") === true;

/**
 * A view of `doc` with the clipboard plugin, section editing, pagination and the registry. Pasted blocks get
 * ids from n000000000000001, renamed duplicates from r000000000000001, and each cut the marker m<count>.
 */
function viewWithClipboard(
  doc: Node,
  options: ClipboardOptions = {},
): { view: EditorView } {
  let cuts = 0;
  const view = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      doc,
      plugins: [
        clipboardPlugin({
          ids: counter("n"),
          plainElement:
            options.plainElement ?? (() => ({ type: "action", kind: null })),
          formatElements:
            options.formatElements ?? (() => FORMAT_ELEMENTS.screenplay),
          random: () => `m${++cuts}`,
          isUndoRedo,
          history: staticBinding(doc).history,
          pastedText: NO_PASTED_TEXT,
        }),
        sectionEditingPlugin({ ids: counter("e") }),
        paginationPlugin({
          profile: sp,
          defer: (work) => work(),
          offFontNote: "note",
        }),
        idRegistryPlugin({ ids: counter("r"), isRemote: () => false }),
      ],
    }),
  });
  return { view };
}

const posIn = (doc: Node, block: number, offset: number): number =>
  blockPos(toIndex(doc), block) + 1 + offset;

/** From block `block` at `offset` to block `toBlock` at `toOffset`, blocks counted in document order. */
function select(
  view: EditorView,
  block: number,
  offset: number,
  toBlock: number,
  toOffset: number,
): void {
  const { doc } = view.state;
  view.dispatch(
    view.state.tr.setSelection(
      TextSelection.create(
        doc,
        posIn(doc, block, offset),
        posIn(doc, toBlock, toOffset),
      ),
    ),
  );
}

/** The block whose id is bid(n), at `offset`. */
const at =
  (n: number, offset: number) =>
  (doc: Node): number => {
    const block = ids(doc).flat().indexOf(bid(n));
    if (block < 0) throw new RangeError(`no block ${bid(n)} in the doc`);
    return posIn(doc, block, offset);
  };

function fire(
  view: EditorView,
  type: "cut" | "copy" | "paste",
  data: DataTransfer,
): void {
  view.dom.dispatchEvent(
    new ClipboardEvent(type, {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function cut(view: EditorView): DataTransfer {
  const data = new DataTransfer();
  fire(view, "cut", data);
  return data;
}

function paste(
  view: EditorView,
  data: DataTransfer,
  place: (doc: Node) => number,
): void {
  const pos = place(view.state.doc);
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)),
  );
  fire(view, "paste", data);
}

function pastePlain(view: EditorView, text: string): void {
  const data = new DataTransfer();
  data.setData("text/plain", text);
  fire(view, "paste", data);
}

function pasteHtml(view: EditorView, html: string): void {
  const data = new DataTransfer();
  data.setData("text/html", html);
  fire(view, "paste", data);
}

const types = (s: EditorState): string[] =>
  toIndex(s.doc).blocks.map((block) => block.type);

/** The marker on the outer element of the clipboard's HTML, or null. */
function markerOf(data: DataTransfer): string | null {
  const holder = document.createElement("div");
  holder.innerHTML = data.getData("text/html");
  return holder.firstElementChild?.getAttribute(CUT_MARKER_ATTR) ?? null;
}

test("a cut marks the clipboard's outer element, and a copy does not", () => {
  const { view } = viewWithClipboard(docOf([["a", "b", "c"], ["d"]]));
  select(view, 1, 0, 2, 1);
  const copied = new DataTransfer();
  fire(view, "copy", copied);
  expect([markerOf(copied), markerOf(cut(view))]).toEqual([null, "m1"]);
});

test("only the first paste after a cut keeps the ids", () => {
  const { view } = viewWithClipboard(docOf([["a", "b", "c"], ["d"]]));
  select(view, 1, 0, 2, 1);
  const data = cut(view); // c leaves; b is emptied and keeps its id
  paste(view, data, at(3, 1));
  expect(ids(view.state.doc)).toEqual([
    [bid(0), bid(1)],
    [bid(3)],
    ["r000000000000001", bid(2)],
  ]);
  paste(view, data, at(0, 1));
  expect(ids(view.state.doc)).toEqual([
    [bid(0), "n000000000000001", "n000000000000002", bid(1)],
    [bid(3)],
    ["r000000000000001", bid(2)],
  ]);
});

test("after the cut is undone a paste gets new ids", () => {
  const { view } = viewWithClipboard(docOf([["a", "b", "c"], ["d"]]));
  select(view, 1, 0, 2, 1);
  const data = cut(view);
  view.dispatch(view.state.tr.setMeta("undo", true));
  paste(view, data, at(3, 1));
  expect(ids(view.state.doc)).toEqual([
    [bid(0), bid(1)],
    [bid(3)],
    ["n000000000000001", "n000000000000002"],
  ]);
});

test("plain text pastes as one element per line", () => {
  const { view } = viewWithClipboard(docOf([[""]]), {
    plainElement: () => ({ type: "action", kind: null }),
  });
  pastePlain(view, "Rain falls.\nThunder.\n\nSilence.");
  expect([texts(view.state.doc), types(view.state)]).toEqual([
    [["Rain falls.", "Thunder.", "", "Silence."]],
    ["action", "action", "action", "action"],
  ]);
});

test("a pasted element the format does not have becomes its plain element", () => {
  const { view } = viewWithClipboard(docOf([[""]]), {
    plainElement: () => ({ type: "body", kind: null }),
    formatElements: () => FORMAT_ELEMENTS.manuscript,
  });
  pasteHtml(
    view,
    '<p data-type="action">Rain.</p><p data-type="transition">CUT TO:</p><h2>Two</h2>',
  );
  expect(types(view.state)).toEqual(["body", "body", "body"]);
});

test("pasted text is made safe for the page", () => {
  const { view } = viewWithClipboard(docOf([["", "end"]]));
  pasteHtml(view, "<p>Rain­fall</p><p>​Thunder\tnow</p>");
  expect(texts(view.state.doc)).toEqual([["Rainfall", "Thunder now", "end"]]);
});
