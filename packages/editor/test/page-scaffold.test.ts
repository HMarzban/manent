import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { profileFor } from "@manent/pagination";
import {
  createPageScaffold,
  detectEngine,
  faceDescriptors,
  loadScriptFonts,
  scriptFontsReady,
  visibleSheets,
  withBatchedScaffold,
  zoomBox,
} from "../src/index.ts";
import type { LoadableFace } from "../src/index.ts";

withDom();

const FACES = faceDescriptors([0x20, 0x7e], [0x100, 0x130]);
const fake = (outcome: "load" | "never" | "reject") => (): LoadableFace => ({
  load: () =>
    outcome === "load"
      ? Promise.resolve()
      : outcome === "reject"
        ? Promise.reject(new Error("x"))
        : new Promise(() => {}),
});
const load = (outcome: "load" | "never" | "reject") =>
  loadScriptFonts({
    fonts: { add() {} },
    makeFace: fake(outcome),
    faces: FACES,
    wait: () => Promise.resolve(),
    waitMs: 5,
  });

test("fonts that load are ready", async () => {
  expect(
    await loadScriptFonts({
      fonts: { add() {} },
      makeFace: fake("load"),
      faces: FACES,
      wait: () => new Promise(() => {}),
    }),
  ).toBe("ready");
});

test("fonts that never load give way after the wait", async () => {
  expect([await load("never"), await load("reject")]).toEqual([
    "fallback",
    "fallback",
  ]);
});

test("zoom sizes the scroll area and scales the page once", () => {
  expect(zoomBox(816, 10560, 150)).toEqual({
    scale: 1.5,
    widthPx: 1224,
    heightPx: 15840,
  });
  expect([
    zoomBox(816, 1000, 10).scale,
    zoomBox(816, 1000, 1000).scale,
  ]).toEqual([0.5, 3]);
});

test("a sheet is drawn for each page in view and one on each side", () => {
  expect(visibleSheets(10, 1056, 24, 0, 800, 1)).toEqual([
    { index: 0, top: 0 },
    { index: 1, top: 1080 },
  ]);
  expect(visibleSheets(10, 1056, 24, 2160, 800, 1).map((s) => s.index)).toEqual(
    [1, 2, 3],
  );
  expect(visibleSheets(10, 1056, 24, 4320, 800, 2).map((s) => s.top)).toEqual([
    1080, 2160, 3240,
  ]); // scroll offsets are scaled, tops are not
});

test("the browser engine is read from the user agent", () => {
  expect(
    [
      "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; rv:140.0) Gecko/20100101 Firefox/140.0",
      "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
      "something else",
    ].map(detectEngine),
  ).toEqual(["chromium", "firefox", "webkit", "chromium"]);
});

test("scaffold passes typed furniture options and honors replaces on screen", () => {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientHeight", { value: 900 });
  const profile = profileFor("screenplay")!;
  const scaffold = createPageScaffold({
    place: host,
    profile,
    engine: "chromium",
    furnitureEntries: [
      {
        replaces: ["page_number", "scene_continued_foot"],
        draw(sheet, input) {
          if (input.watermark !== null) {
            const el = sheet.ownerDocument.createElement("div");
            el.className = "mn-watermark";
            el.textContent = input.watermark;
            el.dataset["title"] = input.title ?? "";
            sheet.append(el);
          }
        },
      },
    ],
  });
  expect([
    scaffold.pages.getAttribute("data-hide-page_number"),
    scaffold.pages.getAttribute("data-hide-scene_continued_foot"),
    scaffold.pages.getAttribute("data-hide-more"),
  ]).toEqual(["1", "1", null]);
  scaffold.setFurniture({ title: "Harbour Lights", watermark: "Leo Marsh" });
  const wm = scaffold.pages.querySelector<HTMLElement>(".mn-watermark");
  expect([wm?.textContent, wm?.dataset["title"]]).toEqual([
    "Leo Marsh",
    "Harbour Lights",
  ]);
  scaffold.destroy();
});

test("scaffold draws only visible sheets for its scrollable ancestor instead of a full-height host", () => {
  const scroller = document.createElement("div");
  scroller.style.overflowY = "auto";
  Object.defineProperty(scroller, "clientHeight", {
    value: 900,
    configurable: true,
  });
  let scrollTop = 0;
  Object.defineProperty(scroller, "scrollTop", {
    get: () => scrollTop,
    set: (v: number) => {
      scrollTop = v;
    },
    configurable: true,
  });
  const host = document.createElement("div");
  Object.defineProperty(host, "clientHeight", {
    value: 2_160_000,
    configurable: true,
  });
  scroller.append(host);
  document.body.append(scroller);
  const scaffold = createPageScaffold({
    place: host,
    profile: profileFor("screenplay")!,
    engine: "chromium",
  });
  try {
    scaffold.setPageCount(2_000);
    const drawn = () =>
      [...scaffold.pages.querySelectorAll<HTMLElement>(".mn-sheet")]
        .map((el) => Number(el.dataset["page"]))
        .toSorted((a, b) => a - b);
    expect(drawn()).toEqual([0, 1]);
    scrollTop = 10_800;
    scroller.dispatchEvent(new Event("scroll"));
    expect(drawn()).toEqual([9, 10, 11]);
  } finally {
    scaffold.destroy();
    scroller.remove();
  }
});

test("script fonts are added once per font set and cached once loaded", async () => {
  let added = 0;
  let made = 0;
  const fonts = {
    add() {
      added += 1;
    },
  };
  const makeFace = (): LoadableFace => {
    made += 1;
    return { load: () => Promise.resolve() };
  };
  const first = await loadScriptFonts({
    fonts,
    makeFace,
    faces: FACES,
    wait: () => new Promise(() => {}),
  });
  const second = await loadScriptFonts({
    fonts,
    makeFace,
    faces: FACES,
    wait: () => new Promise(() => {}),
  });
  expect([first, second, scriptFontsReady(fonts), added, made]).toEqual([
    "ready",
    "ready",
    true,
    FACES.length,
    FACES.length,
  ]);
});

test("a batched scaffold draws visible sheets once across initial setup", () => {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientHeight", { value: 900 });
  const profile = profileFor("screenplay")!;
  let draws = 0;
  const scaffold = withBatchedScaffold(host, () => {
    const made = createPageScaffold({
      place: host,
      profile,
      engine: "chromium",
      furnitureEntries: [
        {
          replaces: [],
          draw() {
            draws += 1;
          },
        },
      ],
    });
    made.setPageCount(2);
    made.setPageLabels(["1", "2"]);
    made.applyZoom(110);
    made.setFurniture({ title: "Low Tide" });
    expect(draws).toBe(0);
    return made;
  });
  // 2 visible sheets drawn once each when the batch exits
  expect(draws).toBe(2);
  scaffold.destroy();
});

test("retrying script fonts after a rejection builds a fresh face", async () => {
  let added = 0;
  let made = 0;
  let shouldReject = true;
  const fonts = {
    add() {
      added += 1;
    },
  };
  const makeFace = (): LoadableFace => {
    made += 1;
    const rejectThis = shouldReject;
    return {
      load: () =>
        rejectThis ? Promise.reject(new Error("x")) : Promise.resolve(),
    };
  };
  const first = await loadScriptFonts({
    fonts,
    makeFace,
    faces: FACES,
    wait: () => new Promise(() => {}),
  });
  shouldReject = false;
  const second = await loadScriptFonts({
    fonts,
    makeFace,
    faces: FACES,
    wait: () => new Promise(() => {}),
  });
  // 4 latin faces rejected and were recreated on retry; 4 latin-ext faces stayed cached
  expect([first, second, scriptFontsReady(fonts), added, made]).toEqual([
    "fallback",
    "ready",
    true,
    FACES.length + 4,
    FACES.length + 4,
  ]);
});

test("a batched scaffold destroyed before the batch ends draws no sheets on exit", () => {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientHeight", { value: 900 });
  const profile = profileFor("screenplay")!;
  let draws = 0;
  withBatchedScaffold(host, () => {
    const made = createPageScaffold({
      place: host,
      profile,
      engine: "chromium",
      furnitureEntries: [
        {
          replaces: [],
          draw() {
            draws += 1;
          },
        },
      ],
    });
    made.setPageCount(2);
    made.destroy();
  });
  expect(draws).toBe(0);
});
