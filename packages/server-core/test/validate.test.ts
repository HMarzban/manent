import { expect, test } from "bun:test";
import {
  applyInspecting,
  loadDoc,
  scriptBody,
  scriptDocFromJSON,
  scriptSettings,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { validateBlocks } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { validatePush } from "../src/index.ts";
import { BLOCK, rawEdit } from "./seed.ts";
import type { ElementNode, Fragment, Shapes } from "./seed.ts";

const RAIN: BlockJSON = {
  type: "block",
  attrs: { id: BLOCK, type: "action" },
  content: [{ type: "text", text: "Rain" }],
};

/** One section of one action block, built the same way every time. */
function roomDoc(): CrdtDoc {
  return scriptDocFromJSON(
    { type: "doc", content: [{ type: "section", content: [RAIN] }] },
    { clientId: 1 },
  );
}

/** A replica of roomDoc() under another client id. */
const replica = (): CrdtDoc =>
  loadDoc(roomDoc().encodeState(), { clientId: 2 });

/** An edit node by node; `section` and `block` are the replica's one section and block. */
function raw(
  edit: (
    body: Fragment,
    make: Shapes,
    section: ElementNode,
    block: ElementNode,
  ) => void,
): () => Uint8Array {
  return () =>
    rawEdit(replica(), (body, make) => {
      const section = body.get(0) as ElementNode;
      edit(body, make, section, section.get(0) as ElementNode);
    });
}

function written(
  edit: Parameters<ReturnType<typeof scriptBody>["write"]>[0],
): () => Uint8Array {
  return () => {
    const doc = replica();
    const before = doc.encodeStateVector();
    scriptBody(doc).write(edit);
    return doc.diff(before);
  };
}

const HOSTILE: readonly [string, () => Uint8Array][] = [
  [
    "a page element at the top",
    raw((body, make) => body.insert(1, [make.element("page")])),
  ],
  [
    "a block at the top",
    raw((body, make) =>
      body.insert(1, [
        make.element("block", { id: "b000000000000009", type: "action" }),
      ]),
    ),
  ],
  [
    "an image inside a block",
    raw((_body, make, _section, block) =>
      block.insert(1, [make.element("img")]),
    ),
  ],
  [
    "a dual of middle",
    raw((_body, _make, _section, block) =>
      block.setAttribute("dual", "middle"),
    ),
  ],
  [
    "a text node in a section",
    raw((_body, make, section) => section.insert(1, [make.text("loose")])),
  ],
  [
    "a block with no id",
    written((w) =>
      w.insertBlocks(BLOCK, [
        { type: "block", attrs: { id: null, type: "action" }, content: [] },
      ]),
    ),
  ],
  [
    "a mark this server does not know",
    written((w) => w.insertText(BLOCK, 0, "x", [{ type: "blink" }])),
  ],
  [
    "an attribute this server does not know",
    raw((_body, _make, _section, block) => block.setAttribute("glow", "1")),
  ],
];

const ordinaryTyping = written((w) => w.insertText(BLOCK, 4, " falls"));
const aTelLink = written((w) =>
  w.insertText(BLOCK, 0, "call", [
    { type: "link", attrs: { href: "tel:5550100" } },
  ]),
);
function aClientWritingSettings(): Uint8Array {
  const doc = replica();
  const before = doc.encodeStateVector();
  scriptSettings(doc).set("script.paper", "a4", {
    userId: "sam",
    setAt: 1,
    replaced: null,
  });
  return doc.diff(before);
}

test("a hostile push is refused for what it touched, whatever else the script holds", () => {
  for (const [, make] of HOSTILE)
    expect(
      validatePush(applyInspecting(roomDoc(), make())!).length,
    ).toBeGreaterThan(0);
  expect(validatePush(applyInspecting(roomDoc(), ordinaryTyping())!)).toEqual(
    [],
  );
  // an unsafe link is a repair, never a refusal
  expect(validatePush(applyInspecting(roomDoc(), aTelLink())!)).toEqual([]);
  // a client never writes these
  expect(
    validatePush(applyInspecting(roomDoc(), aClientWritingSettings())!).map(
      (i) => i.path,
    ),
  ).toEqual(["maps.settings", "maps.settingsMeta"]);
});

/** A script of `blocks` action blocks, and a keystroke typed into one of them by another client. */
function bigScriptAndKeystroke(blocks: number): {
  doc: CrdtDoc;
  keystroke: Uint8Array;
} {
  const ids = Array.from(
    { length: blocks },
    (_, i) => `b${String(i).padStart(15, "0")}`,
  );
  const sections = [];
  for (let at = 0; at < blocks; at += 50)
    sections.push({
      type: "section" as const,
      content: ids.slice(at, at + 50).map((id): BlockJSON => ({
        type: "block",
        attrs: { id, type: "action" },
        content: [],
      })),
    });
  const doc = scriptDocFromJSON(
    { type: "doc", content: sections },
    { clientId: 1 },
  );
  const typist = loadDoc(doc.encodeState(), { clientId: 2 });
  const before = typist.encodeStateVector();
  scriptBody(typist).write((w) =>
    w.insertText(ids[Math.floor(blocks / 2)]!, 0, "a"),
  );
  return { doc, keystroke: typist.diff(before) };
}

/** How many blocks a keystroke's validation looks at, and how many id questions it asks. */
function cost(blocks: number): [number, number] {
  const { doc, keystroke } = bigScriptAndKeystroke(blocks);
  let asked = 0;
  const touched = applyInspecting(doc, keystroke)!.touched();
  validateBlocks(touched, {
    isIdTaken: () => {
      asked++;
      return false;
    },
  });
  return [touched.length, asked];
}

test("validating a keystroke costs the same in a 200-block script and a 20,000-block one", () => {
  // one block looked at, one question asked, whatever the script holds
  expect(cost(200)).toEqual([1, 1]);
  expect(cost(20_000)).toEqual([1, 1]);
  // and no second argument through which a document could arrive
  expect(validatePush.length).toBe(1);
});
