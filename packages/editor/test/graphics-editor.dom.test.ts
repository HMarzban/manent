import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import {
  ENGINE_VERSION,
  LINE_PX,
  engineFor,
  profileFor,
} from "@manent/pagination";
import type { LayoutBlock } from "@manent/pagination";
import { schema } from "@manent/schema";
import type { Node as PMNode } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import {
  GRAPHIC_CSS,
  NO_PASTED_TEXT,
  createScriptEditor,
  driftKey,
  driftModelLines,
  forceLines,
  graphicBoxLines,
  graphicExtraPx,
  mountPageView,
  staticBinding,
} from "../src/index.ts";
import type {
  DriftReport,
  GraphicAssetPort,
  PageViewPorts,
  ScriptEditor,
  SettingsReader,
} from "../src/index.ts";
import { bid, counter, docOf, keysOf, stateWithDrift } from "./docs.ts";

withDom();

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const fn of cleanups.splice(0)) fn();
  document.body.innerHTML = "";
});

function readyPorts(
  whenIdle: (run: () => void) => void = () => {},
): PageViewPorts {
  return {
    fonts: { add() {} },
    makeFace: () => ({ load: () => Promise.resolve() }),
    wait: () => Promise.resolve(),
    defer: (run) => run(),
    whenIdle,
    userAgent: "Mozilla/5.0 Chrome/130.0.0.0",
  };
}

function fakeSettings(values: Record<string, unknown> = {}): SettingsReader {
  const map = new Map<string, unknown>(Object.entries(values));
  return {
    get: (key) => map.get(key),
    subscribe: () => () => {},
  };
}

function mountTestEditor(
  doc: PMNode,
  graphics?: GraphicAssetPort,
  editable = true,
): { editor: ScriptEditor; place: HTMLElement } {
  const place = document.createElement("div");
  document.body.append(place);
  const editor = createScriptEditor({
    place,
    binding: staticBinding(doc),
    editable,
    personal: fakeSettings(),
    script: fakeSettings({ "script.format": "screenplay" }),
    layoutEngine: engineFor(ENGINE_VERSION)!,
    facts: { publish() {} },
    outline: { publish() {} },
    guard: { enter() {}, leave() {} },
    words: {
      element: (_format, type) => type,
      offFontNote: "Off-font note",
      placeholder: () => null,
      picker: "Elements",
    },
    frames: { request: () => () => {} },
    timers: { now: () => 0, schedule: () => () => {} },
    ports: readyPorts(),
    platform: "mac",
    ids: counter("g"),
    random: () => "r",
    pastedText: NO_PASTED_TEXT,
    onUndoStep() {},
    title: { get: () => "Untitled", subscribe: () => () => {} },
    keys: { resolve: () => null, run: () => false },
    zoom: 100,
    titlePage: null,
    view: "page",
    desk: { widthPx: () => 900, paddingPx: () => 64, observe: () => () => {} },
    extraPlugins: () => [],
    graphics,
  });
  cleanups.push(() => editor.destroy());
  return { editor, place };
}

function docWithGraphic(
  graphic: Record<string, unknown>,
  caption = "",
): PMNode {
  return schema.node(
    "doc",
    null,
    schema.node("section", null, [
      schema.node(
        "block",
        { id: bid(0), type: "action" },
        schema.text("Opening."),
      ),
      schema.node(
        "block",
        { id: bid(1), type: "graphic", graphic },
        caption === "" ? [] : schema.text(caption),
      ),
    ]),
  );
}

test("GRAPHIC_CSS uses only --page-* and --geo-* tokens with fixed --graphic-lines height", () => {
  expect(GRAPHIC_CSS).toContain(
    "calc(var(--graphic-lines, 6) * var(--geo-line))",
  );
  expect(GRAPHIC_CSS).toContain("var(--page-paper)");
  expect(GRAPHIC_CSS).toContain("var(--page-ink)");
  expect(GRAPHIC_CSS).toContain("var(--page-edge)");
  expect(GRAPHIC_CSS).toContain("var(--page-skeleton)");
  expect(GRAPHIC_CSS).not.toContain("var(--p-");
});

test("Graphic NodeView renders fixed height, inline caption, data-selected and async image resolution", async () => {
  const assetId = "c".repeat(64);
  const calls: string[] = [];
  const graphics: GraphicAssetPort = {
    async resolveUrl(id) {
      calls.push(id);
      return `blob:test/${id}`;
    },
  };
  const { editor, place } = mountTestEditor(
    docWithGraphic(
      {
        kind: "image",
        assetId,
        heightLines: 8,
        label: "Map of harbour",
        alt: "Harbour chart",
        aspectWidth: 800,
        aspectHeight: 600,
      },
      "Figure 1.",
    ),
    graphics,
  );

  const el = place.querySelector<HTMLElement>("p.mn-graphic");
  expect(el).not.toBeNull();
  expect(el!.style.getPropertyValue("--graphic-lines")).toBe("8");
  expect(el!.getAttribute("data-graphic-lines")).toBe("8");
  expect(el!.getAttribute("data-graphic-kind")).toBe("image");
  expect(el!.querySelector(".mn-graphic-caption")?.textContent).toBe(
    "Figure 1.",
  );
  // Zero paper chrome buttons when loading or resolved.
  expect(el!.querySelectorAll("button").length).toBe(0);

  await Promise.resolve();
  await Promise.resolve();

  expect(calls).toEqual([assetId]);
  const img = el!.querySelector<HTMLImageElement>("img.mn-graphic-img");
  expect(img).not.toBeNull();
  expect(img!.getAttribute("src")).toBe(`blob:test/${assetId}`);
  expect(img!.getAttribute("alt")).toBe("Harbour chart");
  expect(el!.querySelectorAll("button").length).toBe(0);

  // Moving the caret into the caption marks data-selected for forced-colours outline.
  const graphicPos = editor.view.state.doc.child(0).child(0).nodeSize + 2;
  editor.view.dispatch(
    editor.view.state.tr.setSelection(
      TextSelection.create(editor.view.state.doc, graphicPos),
    ),
  );
  expect(el!.hasAttribute("data-selected")).toBe(true);

  // Typing inside caption edits the block's text without losing the resolved image.
  editor.view.dispatch(
    editor.view.state.tr.insertText(" Amended", graphicPos + 9),
  );
  expect(editor.view.state.doc.child(0).child(1).textContent).toBe(
    "Figure 1. Amended",
  );
  expect(calls).toEqual([assetId]);
});

test("missing asset shows quiet Try again button that retries resolution", async () => {
  const assetId = "d".repeat(64);
  let attempt = 0;
  const graphics: GraphicAssetPort = {
    async resolveUrl() {
      attempt += 1;
      return attempt === 1 ? null : `blob:test/recovered-${assetId}`;
    },
  };
  const { place } = mountTestEditor(
    docWithGraphic({
      kind: "image",
      assetId,
      heightLines: 6,
      label: "Still frame",
      alt: "",
      aspectWidth: 640,
      aspectHeight: 360,
    }),
    graphics,
  );

  await Promise.resolve();
  await Promise.resolve();

  const el = place.querySelector<HTMLElement>("p.mn-graphic")!;
  const buttons = el.querySelectorAll<HTMLButtonElement>(
    "button.mn-graphic-retry",
  );
  expect(buttons.length).toBe(1);
  expect(buttons[0]!.textContent).toBe("Try again");
  expect(el.querySelectorAll("button").length).toBe(1);

  buttons[0]!.click();
  await Promise.resolve();
  await Promise.resolve();

  expect(attempt).toBe(2);
  expect(el.querySelector("img.mn-graphic-img")?.getAttribute("src")).toBe(
    `blob:test/recovered-${assetId}`,
  );
  expect(el.querySelectorAll("button").length).toBe(0);
});

test("ScriptEditor graphic commands insert, update, resize and remove image cleanly", () => {
  const { editor, place } = mountTestEditor(docOf([["First action."]]));

  expect(
    editor.insertGraphic({
      kind: "lower_third",
      heightLines: 5,
      label: "HOST CHYRON",
      caption: "DANA CHEN",
    }),
  ).toBe(true);
  expect(editor.view.state.doc.child(0).childCount).toBe(2);
  const inserted = editor.view.state.doc.child(0).child(1);
  expect(inserted.attrs.type).toBe("graphic");
  expect(inserted.textContent).toBe("DANA CHEN");
  expect(inserted.attrs.graphic).toEqual({
    kind: "lower_third",
    assetId: null,
    heightLines: 5,
    label: "HOST CHYRON",
    alt: "",
    aspectWidth: null,
    aspectHeight: null,
  });

  const blockId = String(inserted.attrs.id);
  expect(editor.setGraphicHeightLines(99, blockId)).toBe(true);
  expect(
    editor.view.state.doc.child(0).child(1).attrs.graphic.heightLines,
  ).toBe(24);
  expect(
    place
      .querySelector<HTMLElement>("p.mn-graphic")
      ?.style.getPropertyValue("--graphic-lines"),
  ).toBe("24");

  const assetId = "e".repeat(64);
  expect(
    editor.updateGraphicAttrs(
      { assetId, aspectWidth: 1200, aspectHeight: 800, alt: "Studio desk" },
      blockId,
    ),
  ).toBe(true);
  expect(editor.view.state.doc.child(0).child(1).attrs.graphic.assetId).toBe(
    assetId,
  );

  expect(editor.removeGraphicImage(blockId)).toBe(true);
  expect(editor.view.state.doc.child(0).child(1).attrs.graphic).toEqual({
    kind: "lower_third",
    assetId: null,
    heightLines: 24,
    label: "HOST CHYRON",
    alt: "Studio desk",
    aspectWidth: null,
    aspectHeight: null,
  });

  // Read-only editor refuses graphic commands.
  editor.setEditable(false);
  expect(editor.setGraphicHeightLines(6, blockId)).toBe(false);
});

test("graphicExtraPx and drift monitor produce zero false positives for graphic blocks", () => {
  const layoutBlock: LayoutBlock = {
    id: bid(1),
    type: "graphic",
    text: "Short caption.",
    num: null,
    dual: null,
    kind: null,
    indent: null,
    width: null,
    spaceBefore: null,
    align: null,
    noContd: false,
    styles: null,
    graphic: {
      kind: "image",
      assetId: null,
      heightLines: 6,
      label: "",
      alt: "",
      aspectWidth: null,
      aspectHeight: null,
    },
  };
  expect(graphicBoxLines(layoutBlock)).toBe(6);
  expect(graphicExtraPx(layoutBlock)).toBe(6 * LINE_PX);
  expect(driftModelLines(layoutBlock, 7)).toBe(1);
  expect(
    driftModelLines({ ...layoutBlock, type: "action", graphic: null }, 3),
  ).toBe(3);

  // Verify heldDecorations skips the graphic box slots and only breaks wrapped caption lines.
  const wrappedCaption = "A".repeat(45) + " " + "B".repeat(45);
  const s = stateWithDrift(
    docWithGraphic(
      {
        kind: "image",
        assetId: null,
        heightLines: 6,
        label: "",
        alt: "",
        aspectWidth: null,
        aspectHeight: null,
      },
      wrappedCaption,
    ),
  );
  const forced = s.apply(forceLines(s.tr, [bid(1)]));
  const keys = keysOf(driftKey.getState(forced)!.decorations);
  expect(keys.filter((k) => k.includes(":lb:"))).toEqual(["58:58:lb:46"]);

  // Verify live drift monitor measures box + caption height with zero false positives.
  const idle: (() => void)[] = [];
  const reports: DriftReport[] = [];
  const place = document.createElement("div");
  document.body.append(place);
  const doc = docWithGraphic(
    {
      kind: "image",
      assetId: null,
      heightLines: 6,
      label: "",
      alt: "",
      aspectWidth: null,
      aspectHeight: null,
    },
    "One caption line.",
  );
  const mounted = mountPageView({
    place,
    doc,
    profile: profileFor("screenplay")!,
    ids: counter("m"),
    nextElement: () => ({ type: "action", kind: null }),
    offFontNote: "note",
    ports: readyPorts((run) => idle.push(run)),
    onDrift: (r) => reports.push(r),
  });
  cleanups.push(() => mounted.destroy());

  const blocks = mounted.view.dom.querySelectorAll<HTMLElement>("p.el");
  // Mock matching heights: action = 1 line, graphic = 6 box lines + 1 caption line = 7 * LINE_PX.
  Object.defineProperty(blocks[0]!, "offsetHeight", { value: LINE_PX });
  Object.defineProperty(blocks[1]!, "offsetHeight", { value: 7 * LINE_PX });
  for (const el of blocks) {
    el.style.paddingTop = "0px";
  }
  const section = mounted.view.dom.children[0]!;
  section.getBoundingClientRect = () =>
    ({
      top: 0,
      bottom: 300,
      left: 0,
      right: 600,
      width: 600,
      height: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  Object.defineProperty(document.documentElement, "clientHeight", {
    configurable: true,
    value: 800,
  });

  for (const run of idle.splice(0)) run();
  expect(reports).toEqual([]);
});
