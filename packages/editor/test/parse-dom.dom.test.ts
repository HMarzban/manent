import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { DEFAULT_BLOCK_ATTRS, schema } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { DOMParser } from "prosemirror-model";

withDom();

/** The blocks ProseMirror reads from `html`, as a paste would. */
const read = (html: string): BlockJSON[] => {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  return DOMParser.fromSchema(schema).parseSlice(holder).content.toJSON();
};

const runs = (b: BlockJSON) =>
  b.content?.map((t) => [t.text, (t.marks ?? []).map((m) => m.type)]) ?? [];

test("a block copied from the page comes back as the same element, marks and all", () => {
  expect(
    read(
      '<p class="el el-character" data-type="character" data-id="b000000000000001">DANA <strong>R</strong></p>',
    ),
  ).toEqual([
    {
      type: "block",
      attrs: {
        ...DEFAULT_BLOCK_ATTRS,
        id: "b000000000000001",
        type: "character",
      },
      content: [
        { type: "text", text: "DANA " },
        { type: "text", text: "R", marks: [{ type: "bold" }] },
      ],
    },
  ]);
});

test("plain paragraphs are action, sections are read through, and suggestions and bad colours are dropped", () => {
  expect(
    read(
      '<div class="section"><p>one</p><p data-type="dialogue"><ins data-suggest="s1">two</ins><span data-color="teal">x</span></p></div>',
    ).map((b) => [b.attrs!.type, runs(b)]),
  ).toEqual([
    ["action", [["one", []]]],
    // the two runs lost their marks, so they are one text node
    ["dialogue", [["twox", []]]],
  ]);
});

test("a word processor's page becomes one block per paragraph, heading and list item, with its text only", () => {
  const html =
    '<h1 style="color:red">Title</h1><p class="MsoNormal">One<br>two</p><ul><li>a</li><li><b>b</b></li></ul><table><tr><td>c</td></tr></table>';
  expect(read(html).map((b) => [b.attrs!.type, runs(b)])).toEqual([
    ["action", [["Title", []]]],
    ["action", [["One two", []]]],
    ["action", [["a", []]]],
    ["action", [["b", ["bold"]]]],
    ["action", [["c", []]]],
  ]);
});

test("a list item, a quotation or a table cell that holds paragraphs is read through to them", () => {
  const html =
    "<ul><li><p>a</p></li></ul><blockquote><p>x</p><p>y</p></blockquote><table><tr><td><p>c</p></td></tr></table>";
  expect(read(html).map((b) => [b.attrs!.type, runs(b)])).toEqual([
    ["action", [["a", []]]],
    ["action", [["x", []]]],
    ["action", [["y", []]]],
    ["action", [["c", []]]],
  ]);
});

test("a link that is not safe is text", () => {
  expect(
    read('<p><a href="javascript:alert(1)">go</a></p>')[0]!.content,
  ).toEqual([{ type: "text", text: "go" }]);
});

test("a named colour, a named highlight, all-caps, a struck word and a safe link come back as marks", () => {
  expect(
    read(
      '<p><span data-color="blue">a</span><mark data-highlight="pink">b</mark><span class="caps">c</span><del>d</del><a href="https://example.com/">e</a></p>',
    )[0]!.content,
  ).toEqual([
    {
      type: "text",
      text: "a",
      marks: [{ type: "color", attrs: { value: "blue" } }],
    },
    {
      type: "text",
      text: "b",
      marks: [{ type: "highlight", attrs: { value: "pink" } }],
    },
    { type: "text", text: "c", marks: [{ type: "caps" }] },
    { type: "text", text: "d", marks: [{ type: "strike" }] },
    {
      type: "text",
      text: "e",
      marks: [{ type: "link", attrs: { href: "https://example.com/" } }],
    },
  ]);
});
