import { expect, test } from "bun:test";
import { parseXmlChecked, writeXml } from "../src/index.ts";
import type { XmlNode } from "../src/index.ts";
import { XML_EXPECTED, bunXml, fixtureText } from "../src/testing/index.ts";

test("the test adapter reads each fixture to its expected tree", () => {
  for (const [file, tree] of Object.entries(XML_EXPECTED))
    expect(bunXml(fixtureText(`xml/${file}`))).toEqual(tree);
});

test("written XML reads back to the same tree, text exact", () => {
  for (const tree of Object.values(XML_EXPECTED))
    expect(bunXml(writeXml(tree))).toEqual(tree);
});

test("whitespace that only lays elements out is dropped, and a run's space is kept", () => {
  expect(bunXml("<A>\n  <B/>\n  <Text> </Text>\n</A>")).toEqual({
    name: "A",
    attributes: {},
    children: [
      { name: "B", attributes: {}, children: [] },
      { name: "Text", attributes: {}, children: [" "] },
    ],
  });
});

test("inside a run, a space beside an element is text", () => {
  expect(bunXml("<Text> <B/>\n</Text>")).toEqual({
    name: "Text",
    attributes: {},
    children: [" ", { name: "B", attributes: {}, children: [] }, "\n"],
  });
});

test("an attribute named __proto__ is refused by the adapter, so the file is malformed", () => {
  expect(() => parseXmlChecked('<A __proto__="x"/>', bunXml)).toThrow(
    expect.objectContaining({ code: "malformed" }),
  );
});

test("element-only content is indented and an element with text stays on one line", () => {
  expect(
    writeXml({
      name: "A",
      attributes: { x: "1" },
      children: [
        { name: "B", attributes: {}, children: ["  two  "] },
        { name: "C", attributes: {}, children: [] },
      ],
    }),
  ).toBe(
    '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n<A x="1">\n  <B>  two  </B>\n  <C/>\n</A>\n',
  );
});

test("attribute values keep quotes, tabs and line ends", () => {
  const tree = {
    name: "A",
    attributes: { v: 'a "b"\t\nc & <d>' },
    children: [],
  };
  expect(bunXml(writeXml(tree))).toEqual(tree);
});

test("text between elements is written as it stands, with nothing added", () => {
  expect(
    writeXml({
      name: "P",
      attributes: { at: "\r" },
      children: [
        "The lamp ",
        {
          name: "B",
          attributes: {},
          children: [{ name: "I", attributes: {}, children: [] }],
        },
        " & <the> gulls]]>\r",
      ],
    }),
  ).toBe(
    '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n<P at="&#13;">The lamp <B><I/></B> &amp; &lt;the&gt; gulls]]&gt;&#13;</P>\n',
  );
});

const element = (name: string, attribute: string, text: string): XmlNode => ({
  name,
  attributes: { [attribute]: "1" },
  children: [text],
});

/** The message of the RangeError writing `tree` throws, or "written". */
function refusal(tree: XmlNode): string {
  try {
    writeXml(tree);
    return "written";
  } catch (error) {
    return error instanceof RangeError ? error.message : "another error";
  }
}

test("a name that is not an XML name, or a character XML cannot hold, is refused and named", () => {
  expect([
    refusal(element("1A", "x", "")),
    refusal(element("A", "has space", "")),
    refusal(element("A", "x", "bell \u0007")),
    refusal(element("A", "x", "half \ud83d")),
    refusal(element("Écran", "x:y", "👁 \t\n")),
  ]).toEqual([
    'an XML name cannot be "1A"',
    'an XML name cannot be "has space"',
    "XML cannot hold the character U+0007",
    "XML cannot hold the character U+D83D",
    "written",
  ]);
});

test("a document type or an entity declaration is refused before parsing", () => {
  expect(() =>
    parseXmlChecked('<!DOCTYPE x [<!ENTITY e "boom">]><R>&e;</R>', bunXml),
  ).toThrow(expect.objectContaining({ code: "unsupported" }));
});

test("text that is not XML, or nested past the limit, is malformed and keeps its cause", () => {
  expect(() => parseXmlChecked("<R><A></R>", bunXml)).toThrow(
    expect.objectContaining({
      code: "malformed",
      cause: expect.any(SyntaxError),
    }),
  );
  expect(() =>
    parseXmlChecked("<a>".repeat(65) + "</a>".repeat(65), bunXml),
  ).toThrow(expect.objectContaining({ code: "malformed" }));
  expect(
    parseXmlChecked("<a>".repeat(64) + "</a>".repeat(64), bunXml).name,
  ).toBe("a");
});
