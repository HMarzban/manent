import { withDom } from "@manent/testkit/dom";
import type { ScriptEditor } from "@manent/editor";
import type { Page, Pagination } from "@manent/pagination";
import { afterEach, expect, test } from "bun:test";
import { followThumb } from "../src/editor-host/thumb-label.ts";
import { createClock } from "./services.fixtures.ts";

withDom();

const DOC = "4b2e8c1d-9f3a-4d7e-8c1b-2a5f6e9d0c3b";

const EXPECTED_CLASS =
  "pointer-events-none fixed select-none rounded-surface border border-line bg-overlay px-2.5 py-1 text-meta font-medium whitespace-nowrap text-fg tabular-nums shadow-overlay opacity-0 motion-safe:transition-opacity motion-safe:duration-(--dur-base)";

const originalElementFromPoint = document.elementFromPoint;
const originalViewportWidth = Object.getOwnPropertyDescriptor(
  document.documentElement,
  "clientWidth",
);

let disposers: (() => void)[] = [];

afterEach(() => {
  for (const dispose of disposers.splice(0).toReversed()) dispose();
  document.elementFromPoint = originalElementFromPoint;
  if (originalViewportWidth !== undefined) {
    Object.defineProperty(
      document.documentElement,
      "clientWidth",
      originalViewportWidth,
    );
  }
  document.body.replaceChildren();
});

function setReadonlyNumber(target: object, key: string, value: number): void {
  Object.defineProperty(target, key, {
    value,
    configurable: true,
    writable: true,
  });
}

function setRect(
  element: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
): void {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  element.getBoundingClientRect = () =>
    ({
      left: rect.left,
      top: rect.top,
      right,
      bottom,
      width: rect.width,
      height: rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect;
}

function fakeEditor(options: {
  pageCount: number;
  currentPage: () => number | null;
  frontPage?: () => string | null;
}): ScriptEditor {
  const pages: Page[] = Array.from({ length: options.pageCount }, (_, i) => ({
    index: i,
    label: String(i + 1),
    locked: false,
    forced: false,
    block: i,
    line: 0,
    offset: 0,
    right: null,
    more: false,
    contd: null,
    contdRight: null,
    sceneContinued: false,
    topUnits: 0,
    usedUnits: 0,
    readAhead: i,
  }));
  const pagination = { pages } as unknown as Pagination;
  return {
    frontPageAt: () => options.frontPage?.() ?? null,
    pageAt: () => options.currentPage(),
    pagination: () => pagination,
  } as unknown as ScriptEditor;
}

function createHarness(options: {
  viewportWidth?: number;
  rect?: { left: number; top: number; width: number; height: number };
  offsetWidth?: number;
  clientLeft?: number;
  clientWidth?: number;
  clientHeight?: number;
  scrollHeight?: number;
  scrollTop?: number;
  labelHeight?: number;
  pageCount?: number;
  currentPage?: () => number | null;
}) {
  const viewportWidth = options.viewportWidth ?? 1200;
  const rect = options.rect ?? { left: 0, top: 48, width: 1200, height: 800 };
  setReadonlyNumber(document.documentElement, "clientWidth", viewportWidth);

  const scroller = document.createElement("div");
  scroller.dataset["region"] = "page";
  const host = document.createElement("div");
  scroller.append(host);
  document.body.append(scroller);

  setRect(scroller, rect);
  setReadonlyNumber(scroller, "offsetWidth", options.offsetWidth ?? rect.width);
  setReadonlyNumber(scroller, "clientLeft", options.clientLeft ?? 0);
  setReadonlyNumber(scroller, "clientWidth", options.clientWidth ?? rect.width);
  setReadonlyNumber(
    scroller,
    "clientHeight",
    options.clientHeight ?? rect.height,
  );
  setReadonlyNumber(scroller, "scrollHeight", options.scrollHeight ?? 10000);
  setReadonlyNumber(scroller, "scrollTop", options.scrollTop ?? 0);

  const clock = createClock();
  const editor = fakeEditor({
    pageCount: options.pageCount ?? 20,
    currentPage: options.currentPage ?? (() => 3),
  });
  const dispose = followThumb({
    editor,
    scroller,
    host,
    docId: DOC,
    timers: clock,
  });
  disposers.push(dispose);

  const label = host.firstElementChild;
  if (!(label instanceof HTMLElement)) {
    throw new TypeError("thumb label element was not appended to host");
  }
  setReadonlyNumber(label, "offsetHeight", options.labelHeight ?? 26);

  return { scroller, host, label, clock, dispose };
}

test("the page pill uses calm overlay styling and stays hidden from assistive technology", () => {
  const { label } = createHarness({});
  expect({
    className: label.className,
    hasForeground: label.classList.contains("bg-foreground"),
    hasOverlay: label.classList.contains("bg-overlay"),
    hasFg: label.classList.contains("text-fg"),
    hasBorderLine: label.classList.contains("border-line"),
    hasShadowOverlay: label.classList.contains("shadow-overlay"),
    hasTabularNums: label.classList.contains("tabular-nums"),
    thumbLabelAttr: label.getAttribute("data-thumb-label"),
    slotAttr: label.getAttribute("data-slot"),
    ariaHidden: label.getAttribute("aria-hidden"),
  }).toEqual({
    className: EXPECTED_CLASS,
    hasForeground: false,
    hasOverlay: true,
    hasFg: true,
    hasBorderLine: true,
    hasShadowOverlay: true,
    hasTabularNums: true,
    thumbLabelAttr: "",
    slotAttr: null,
    ariaHidden: "true",
  });
});

test("the page pill clears overlay scrollbars, classic scrollbars and covering panels", () => {
  const { scroller, host, label } = createHarness({
    viewportWidth: 1200,
    rect: { left: 0, top: 48, width: 1200, height: 800 },
    offsetWidth: 1200,
    clientLeft: 0,
    clientWidth: 1200,
    clientHeight: 800,
    scrollHeight: 10000,
    scrollTop: 2000,
    labelHeight: 26,
  });

  const probes: [number, number][] = [];
  document.elementFromPoint = (x, y) => {
    probes.push([x, y]);
    return host;
  };

  scroller.dispatchEvent(new Event("wheel"));
  scroller.dispatchEvent(new Event("scroll"));
  const overlayRight = label.style.right;
  const overlayProbeX = probes.at(-1)?.[0];

  // classic scrollbar: 15px layout track reduces clientWidth below offsetWidth
  setReadonlyNumber(scroller, "clientWidth", 1185);
  scroller.dispatchEvent(new Event("scroll"));
  const classicRight = label.style.right;
  const classicProbeX = probes.at(-1)?.[0];

  // covering side panel laid over the scroller's right edge
  const panel = document.createElement("aside");
  panel.dataset["region"] = "side_panel";
  const panelBody = document.createElement("div");
  panel.append(panelBody);
  document.body.append(panel);
  setRect(panel, { left: 880, top: 48, width: 320, height: 800 });

  document.elementFromPoint = (x, y) => {
    probes.push([x, y]);
    return panelBody;
  };
  scroller.dispatchEvent(new Event("scroll"));
  const coveredRight = label.style.right;

  expect({
    overlayRight,
    overlayProbeX,
    classicRight,
    classicProbeX,
    coveredRight,
  }).toEqual({
    overlayRight: "26px",
    overlayProbeX: 1199,
    classicRight: "25px",
    classicProbeX: 1184,
    coveredRight: "330px",
  });
});

test("the page pill stays inside the scroller edges on a long script and hides when nothing scrolls", () => {
  let page = 0;
  const { scroller, host, label } = createHarness({
    viewportWidth: 1000,
    rect: { left: 0, top: 48, width: 1000, height: 700 },
    offsetWidth: 1000,
    clientWidth: 1000,
    clientHeight: 700,
    scrollHeight: 310000,
    scrollTop: 0,
    labelHeight: 26,
    pageCount: 291,
    currentPage: () => page,
  });

  const probeYs: number[] = [];
  document.elementFromPoint = (_x, y) => {
    probeYs.push(y);
    return host;
  };

  // top of a 291-page script: raw thumb centre sits near rect.top, clamped to rect.top + 8
  scroller.dispatchEvent(new Event("wheel"));
  scroller.dispatchEvent(new Event("scroll"));
  const atTop = {
    top: label.style.top,
    text: label.textContent,
    probeY: probeYs.at(-1),
  };

  // bottom of a 291-page script: clamped to rect.bottom - labelHeight - 8
  page = 290;
  setReadonlyNumber(scroller, "scrollTop", 309300);
  scroller.dispatchEvent(new Event("scroll"));
  const atBottom = {
    top: label.style.top,
    text: label.textContent,
    probeY: probeYs.at(-1),
  };

  // non-scrollable script: scrollHeight <= clientHeight does not show the pill
  const flat = createHarness({
    viewportWidth: 1000,
    rect: { left: 0, top: 48, width: 1000, height: 700 },
    clientHeight: 700,
    scrollHeight: 700,
    scrollTop: 0,
    pageCount: 1,
    currentPage: () => 0,
  });
  flat.scroller.dispatchEvent(new Event("wheel"));
  flat.scroller.dispatchEvent(new Event("scroll"));

  expect({
    atTop,
    atBottom,
    flatOpacity: flat.label.style.opacity,
    flatText: flat.label.textContent,
  }).toEqual({
    atTop: { top: "56px", text: "Page 1 of 291", probeY: 69 },
    atBottom: { top: "714px", text: "Page 291 of 291", probeY: 727 },
    flatOpacity: "",
    flatText: "",
  });
});

test("the page pill appears on user scroll, ignores script-driven scroll, fades after one second and cleans up", () => {
  let page = 3;
  const { scroller, host, label, clock, dispose } = createHarness({
    viewportWidth: 1000,
    rect: { left: 0, top: 48, width: 1000, height: 700 },
    clientHeight: 700,
    scrollHeight: 14000,
    scrollTop: 2100,
    pageCount: 20,
    currentPage: () => page,
  });
  document.elementFromPoint = () => host;

  // programmatic scroll without wheel, touchmove or scrollbar press stays hidden
  scroller.dispatchEvent(new Event("scroll"));
  const afterProgrammatic = {
    opacity: label.style.opacity,
    text: label.textContent,
  };

  // pointerdown inside page content (not on the scroller scrollbar) stays hidden
  host.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  scroller.dispatchEvent(new Event("scroll"));
  const afterContentPress = label.style.opacity;

  // wheel reveals the pill and fades it 1000 ms after the last scroll
  scroller.dispatchEvent(new Event("wheel"));
  scroller.dispatchEvent(new Event("scroll"));
  const afterWheel = { opacity: label.style.opacity, text: label.textContent };
  clock.advance(999);
  const at999Ms = label.style.opacity;
  clock.advance(1);
  const at1000Ms = label.style.opacity;

  // touchmove reveals the pill and fades after 1000 ms
  page = 7;
  scroller.dispatchEvent(new Event("touchmove"));
  scroller.dispatchEvent(new Event("scroll"));
  const afterTouch = { opacity: label.style.opacity, text: label.textContent };
  clock.advance(1000);
  const afterTouchFade = label.style.opacity;

  // pointerdown directly on scroller (scrollbar thumb) reveals and extends on scroll
  page = 11;
  scroller.dispatchEvent(new Event("pointerdown"));
  scroller.dispatchEvent(new Event("scroll"));
  clock.advance(600);
  scroller.dispatchEvent(new Event("scroll"));
  clock.advance(999);
  const extendedAt999Ms = label.style.opacity;
  clock.advance(1);
  const extendedAt1000Ms = label.style.opacity;

  // dispose removes the pill and stops listening
  dispose();
  scroller.dispatchEvent(new Event("wheel"));
  scroller.dispatchEvent(new Event("scroll"));

  expect({
    afterProgrammatic,
    afterContentPress,
    afterWheel,
    at999Ms,
    at1000Ms,
    afterTouch,
    afterTouchFade,
    extendedAt999Ms,
    extendedAt1000Ms,
    attachedAfterDispose: label.isConnected,
    opacityAfterDispose: label.style.opacity,
  }).toEqual({
    afterProgrammatic: { opacity: "", text: "" },
    afterContentPress: "",
    afterWheel: { opacity: "1", text: "Page 4 of 20" },
    at999Ms: "1",
    at1000Ms: "0",
    afterTouch: { opacity: "1", text: "Page 8 of 20" },
    afterTouchFade: "0",
    extendedAt999Ms: "1",
    extendedAt1000Ms: "0",
    attachedAfterDispose: false,
    opacityAfterDispose: "0",
  });
});
