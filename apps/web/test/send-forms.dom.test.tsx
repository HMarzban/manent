import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, spyOn, test } from "bun:test";
import * as formats from "@manent/formats";
import { paginate, profileFor } from "@manent/pagination";
import type { Pagination } from "@manent/pagination";
import { block } from "@manent/pagination/testing";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { AnyRouter } from "@tanstack/react-router";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { registerLiveEditor } from "../src/editor-host/live-editor.ts";
import type { LiveEditor } from "../src/editor-host/live-editor.ts";
import { RootLayout } from "../src/root-layout.tsx";
import { SendScreen } from "../src/screens/send/send-screen.tsx";
import { outsideFontSentence } from "../src/send/output-checks.tsx";
import { loadPdfFonts } from "../src/send/pdf-fonts.ts";
import * as printing from "../src/send/print-pages.ts";
import { EnvironmentProvider, useServices } from "../src/services/context.tsx";
import type { PersonServices } from "../src/services/ports.ts";
import { createShellDom } from "../src/shell/regions.tsx";
import { bindGuard } from "../src/state/guard.ts";
import { createPersonStore } from "../src/state/person.store.ts";
import {
  createClock,
  fakeApi,
  keepingSyncs,
  listDocument,
  testEnvironment,
} from "./services.fixtures.ts";

withDom();

const SCREENPLAY = profileFor("screenplay");
if (SCREENPLAY === null) throw new TypeError("no screenplay profile");
const LEO = { token: null, userId: "leo", name: "Leo Marsh" };
const noop = (): void => {};

/** One page per text, each a line of action ended by a page break. */
const pagesOf = (texts: readonly string[]): Pagination =>
  paginate(
    texts
      .flatMap((text) => [block("action", text), block("page_break", "")])
      .slice(0, -1),
    SCREENPLAY,
  );
const numbered = (count: number): Pagination =>
  pagesOf(
    Array.from(
      { length: count },
      (_, k) => `The lamp is lit on page ${k + 1}.`,
    ),
  );

/** An editor of `docId` showing `p`; its view is read by no test. */
const liveOf = (docId: string, p: Pagination): LiveEditor => ({
  docId,
  doc: {} as LiveEditor["doc"],
  view: {} as LiveEditor["view"],
  scaffold: {} as NonNullable<LiveEditor["scaffold"]>,
  presence: {
    publish: noop,
    subscribe: () => noop,
    subscribePeople: () => noop,
  },
  editable: false,
  pagination: () => p,
  zoom: () => 1,
  frontPages: () => null,
});

/** Frames that pass only when fired by hand. */
function createFrames(): { request(fn: () => void): () => void; fire(): void } {
  let queued: (() => void)[] = [];
  return {
    request(fn) {
      queued.push(fn);
      return () => {
        queued = queued.filter((f) => f !== fn);
      };
    },
    fire() {
      const due = queued;
      queued = [];
      for (const fn of due) fn();
    },
  };
}

const restores: (() => void)[] = [];
let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  for (const restore of restores.splice(0).toReversed()) restore();
  document.getElementById("mn-print")?.remove();
});

/** Replaces `target[key]` until the test ends. */
function stub<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K],
): void {
  const before = target[key];
  target[key] = value;
  restores.push(() => {
    target[key] = before;
  });
}

/** Yields to the work under way (a dynamic import, a file read, the PDF writer) until `done` holds; gives up after about 2,000 turns. */
async function until(done: () => boolean): Promise<void> {
  for (let turn = 0; turn < 2000 && !done(); turn++)
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}

let services: PersonServices | null = null;
function ServicesProbe(): ReactNode {
  services = useServices();
  return <h1 tabIndex={-1}>Library</h1>;
}

/**
 * The app with d1 listed as The Long Night showing `p`, at `path`; `frame` defaults to a frame every 16 ms of the clock.
 * With `opening`, d1's editor is still opening when the screen arrives, and `open()` opens it.
 */
async function renderApp(
  path: string,
  options: {
    p: Pagination;
    format?: "screenplay" | "ink";
    frame?: (fn: () => void) => () => void;
    opening?: boolean;
  },
): Promise<{
  router: AnyRouter;
  container: HTMLElement;
  clock: ReturnType<typeof createClock>;
  open(): void;
}> {
  const clock = createClock();
  const { environment, started } = keepingSyncs(
    testEnvironment({
      dom: createShellDom(document),
      now: clock.now,
      schedule: clock.schedule,
      frame: options.frame ?? ((fn) => clock.schedule(fn, 16)),
    }),
  );
  bindGuard(environment.guard);
  const usePerson = createPersonStore(null);
  usePerson.getState().setPerson(LEO);
  const rootRoute = createRootRoute({
    component: () => (
      <RootLayout api={fakeApi()} fetch={fetch} usePerson={usePerson} />
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/",
        component: ServicesProbe,
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/s/$docId",
        component: () => <h1 tabIndex={-1}>The Long Night</h1>,
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/s/$docId/send/$form",
        component: () => <SendScreen />,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  mounted = createRoot(container);
  await act(async () =>
    mounted?.render(
      <QueryClientProvider client={new QueryClient()}>
        <EnvironmentProvider environment={environment}>
          <RouterProvider router={router} />
        </EnvironmentProvider>
      </QueryClientProvider>,
    ),
  );
  const [sync] = started;
  if (sync === undefined) throw new Error("the shell started no sync");
  await act(async () =>
    listDocument(await sync, {
      workspaceId: "leo",
      docId: "d1",
      title: "The Long Night",
    }),
  );
  act(() => {
    services
      ?.openScriptStore("d1")
      .set("script.format", options.format ?? "screenplay");
  });
  const open = (): void => {
    act(() => {
      restores.push(registerLiveEditor(liveOf("d1", options.p)));
    });
  };
  if (options.opening !== true) open();
  await act(() => router.navigate({ href: path }));
  // the frame loads apart, or the screen goes back to the document
  await until(
    () =>
      container.querySelector("section") !== null ||
      router.state.location.pathname !== path,
  );
  return { router, container, clock, open };
}

/** The frame's one primary button: the last button of the screen before its status bar. */
const actionButton = (container: HTMLElement): HTMLElement => {
  const found = [...container.querySelectorAll("button")]
    .filter((b) => b.closest("[data-region='status_bar']") === null)
    .at(-1);
  if (found === undefined) throw new Error("no action button");
  return found;
};

const rowsOf = (container: HTMLElement): (string | null | undefined)[][] =>
  [...container.querySelectorAll("dl > div")].map((row) => [
    row.querySelector("dt")?.textContent,
    row.querySelector("dd")?.textContent,
  ]);

/** Each font is read from the file its URL names, as the build serves it. */
function serveFonts(): void {
  stub(
    globalThis,
    "fetch",
    (async (input: string | URL | Request) =>
      new Response(await Bun.file(String(input)).bytes())) as typeof fetch,
  );
}

/** Blob.bytes(), which browsers have and happy-dom's Blob lacks; the PDF writer reads its pages back with it. */
function readableBlobs(): void {
  stub(Blob.prototype, "bytes", async function bytes(this: Blob): Promise<
    Uint8Array<ArrayBuffer>
  > {
    return new Uint8Array(await this.arrayBuffer());
  });
}

/** What the download link was given: its file name and the bytes behind its address. */
function catchDownloads(): { name: string; bytes: Promise<Uint8Array> }[] {
  const saved: { name: string; bytes: Promise<Uint8Array> }[] = [];
  const blobs = new Map<string, Blob>();
  stub(URL, "createObjectURL", (blob: Blob) => {
    const href = `blob:test/${blobs.size}`;
    blobs.set(href, blob);
    return href;
  });
  stub(URL, "revokeObjectURL", (href: string) => {
    blobs.delete(href);
  });
  stub(
    HTMLAnchorElement.prototype,
    "click",
    function click(this: HTMLAnchorElement) {
      const blob = blobs.get(this.href);
      saved.push({
        name: this.download,
        bytes:
          blob === undefined
            ? Promise.resolve(new Uint8Array())
            : blob.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
      });
    },
  );
  return saved;
}

test("Export names one file, a clean PDF of the whole script, and the first pages", async () => {
  const { container } = await renderApp("/s/d1/send/export", {
    p: numbered(30),
  });
  const region = container.querySelector("section");
  expect([
    container.querySelector("h1")?.textContent,
    actionButton(container).textContent,
    rowsOf(container),
    [...(region?.querySelectorAll("li") ?? [])].map(
      (tile) => tile.lastElementChild?.textContent,
    ),
    region?.querySelector(":scope > p")?.textContent,
  ]).toEqual([
    "Export 1 file",
    "Export 1 file",
    [
      ["Checks", "Nothing needs a look before you send."],
      ["What", "Whole scriptPrint with alternates"],
      ["As", "Clean PDFFDXFountainProject archive"],
    ],
    ["1", "2", "3", "4", "5", "6", "7", "8"],
    "… 22 more",
  ]);
});

/** Thirty pages, the first holding a character outside the script font. */
const withOutside = (): Pagination =>
  pagesOf(
    Array.from({ length: 30 }, (_, k) =>
      k === 0 ? "The sign reads 日." : `The lamp is lit on page ${k + 1}.`,
    ),
  );
const OUTSIDE_ROW = [
  "Checks",
  "日 is outside the script font and prints as a box",
];

test("while the script's editor is still opening, Export and Print show their rows, and their checks and pages join when it opens", async () => {
  const seen: unknown[] = [];
  for (const form of ["export", "print"]) {
    const { container, open } = await renderApp(`/s/d1/send/${form}`, {
      p: withOutside(),
      opening: true,
    });
    const shown = () => [
      container.querySelector("h1")?.textContent,
      document.activeElement?.tagName,
      rowsOf(container),
      container.querySelector("section")?.querySelectorAll("li").length,
      actionButton(container).textContent,
    ];
    const waiting = [
      container.querySelector("button")?.textContent,
      ...shown(),
    ];
    open();
    seen.push([waiting, shown()]);
    act(() => mounted?.unmount());
    for (const restore of restores.splice(0).toReversed()) restore();
  }
  expect(seen).toEqual([
    [
      [
        "‹ The Long Night",
        "Export 1 file",
        "H1",
        [
          ["What", "Whole scriptPrint with alternates"],
          ["As", "Clean PDFFDXFountainProject archive"],
        ],
        0,
        "Export 1 file",
      ],
      [
        "Export 1 file",
        "H1",
        [
          OUTSIDE_ROW,
          ["What", "Whole scriptPrint with alternates"],
          ["As", "Clean PDFFDXFountainProject archive"],
        ],
        8,
        "Export 1 file",
      ],
    ],
    [
      [
        "‹ The Long Night",
        "Print",
        "H1",
        [["What", "Whole scriptPrint with alternates"]],
        0,
        "Print",
      ],
      [
        "Print 30 pages",
        "H1",
        [OUTSIDE_ROW, ["What", "Whole scriptPrint with alternates"]],
        8,
        "Print 30 pages",
      ],
    ],
  ]);
});

test("while the script's editor is still opening, Export and Print offer a disabled button and nothing leaves when it is pressed", async () => {
  const saved = catchDownloads();
  const writing = spyOn(formats, "writePdf").mockImplementation(() =>
    Promise.resolve(new Uint8Array([37, 80, 68, 70, 45])),
  );
  restores.push(() => writing.mockRestore());
  let printed = 0;
  stub(window, "print", () => {
    printed++;
  });
  const seen: unknown[] = [];
  for (const form of ["export", "print"]) {
    const { container, router, clock } = await renderApp(`/s/d1/send/${form}`, {
      p: withOutside(),
      opening: true,
    });
    const button = actionButton(container);
    act(() => button.click());
    act(() => clock.advance(16));
    seen.push([
      button.getAttribute("aria-disabled"),
      button.textContent,
      router.state.location.pathname,
    ]);
    act(() => mounted?.unmount());
  }
  expect([
    seen,
    writing.mock.calls.length,
    saved.length,
    printed,
    document.querySelectorAll("#mn-print").length,
  ]).toEqual([
    [
      ["true", "Export 1 file", "/s/d1/send/export"],
      ["true", "Print", "/s/d1/send/print"],
    ],
    0,
    0,
    0,
    0,
  ]);
});

test("exporting writes the PDF, saves it under the script's name and goes back", async () => {
  serveFonts();
  readableBlobs();
  const saved = catchDownloads();
  const { container, router, clock } = await renderApp("/s/d1/send/export", {
    p: numbered(30),
  });
  act(() => actionButton(container).click());
  const busy = actionButton(container).textContent;
  act(() => clock.advance(16));
  await until(() => router.state.location.pathname === "/s/d1");
  const head = new TextDecoder().decode(
    (await (saved[0]?.bytes ?? Promise.resolve(new Uint8Array()))).slice(0, 5),
  );
  expect([
    busy,
    saved.map((file) => file.name),
    head,
    services?.messages.current()?.text,
    router.state.location.pathname,
    router.history.length,
  ]).toEqual([
    "Exporting 1 file…",
    ["The Long Night.pdf"],
    "%PDF-",
    "Exported 'The Long Night'.",
    "/s/d1",
    2,
  ]);
});

test("the file is named for the script, without the characters a file system refuses, in at most 120 characters", async () => {
  serveFonts();
  const saved = catchDownloads();
  const writing = spyOn(formats, "writePdf").mockImplementation(() =>
    Promise.resolve(new Uint8Array([37, 80, 68, 70, 45])),
  );
  restores.push(() => writing.mockRestore());
  const { container, router, clock } = await renderApp("/s/d1/send/export", {
    p: numbered(2),
  });
  act(() =>
    services?.library.renameDocument(
      "d1",
      `Act 1: "Night/Day" <draft>?|*\\ ${"Harbour Lights ".repeat(10)}`,
    ),
  );
  act(() => actionButton(container).click());
  act(() => clock.advance(16));
  await until(() => router.state.location.pathname === "/s/d1");
  const name = saved[0]?.name ?? "";
  expect([name.length, name]).toEqual([
    120,
    `Act 1- -Night-Day- -draft----- ${"Harbour Lights ".repeat(10)}`.slice(
      0,
      116,
    ) + ".pdf",
  ]);
});

test("the PDF's fonts are fetched once and kept for the tab, each face from its own file", async () => {
  let fetches = 0;
  const read = async (url: string): Promise<Uint8Array> => {
    fetches++;
    return Bun.file(url).bytes();
  };
  const first = await loadPdfFonts(read);
  const before = fetches;
  const again = await loadPdfFonts(read);
  const sizes = Object.entries(first).map(([key, bytes]) => [
    key,
    bytes.length,
  ]);
  const files = await Promise.all(
    Object.keys(first).map(async (key) => [
      key,
      (
        await Bun.file(
          Bun.resolveSync(
            `@fontsource/courier-prime/files/courier-prime-${key}.woff`,
            import.meta.dir,
          ),
        ).bytes()
      ).length,
    ]),
  );
  expect([again === first, fetches - before, sizes.length, sizes]).toEqual([
    true,
    0,
    8,
    files,
  ]);
});

test("an export that fails says so above the button and keeps the screen", async () => {
  serveFonts();
  const saved = catchDownloads();
  const writing = spyOn(formats, "writePdf").mockImplementation(() =>
    Promise.reject(new RangeError("no glyph table")),
  );
  restores.push(() => writing.mockRestore());
  const { container, router, clock } = await renderApp("/s/d1/send/export", {
    p: numbered(30),
  });
  act(() => actionButton(container).click());
  act(() => clock.advance(16));
  await until(() => document.activeElement?.tagName === "P");
  expect([
    document.activeElement?.textContent,
    actionButton(container).textContent,
    saved.length,
    router.state.location.pathname,
  ]).toEqual([
    "Couldn't export 'The Long Night'. Try again.",
    "Export 1 file",
    0,
    "/s/d1/send/export",
  ]);
});

test("characters outside the font are listed before anything leaves", async () => {
  const both = pagesOf(["The sign reads 日 and س.", "日 again."]);
  const { container } = await renderApp("/s/d1/send/export", { p: both });
  const many = pagesOf([
    "Clusters: 日 س 👨‍👩‍👧 e\u0301 a\u200bb 本 中 文 字 漢 語 한 글 ア.",
  ]);
  expect([
    rowsOf(container)[0],
    outsideFontSentence(pagesOf(["日"])),
    outsideFontSentence(numbered(2)),
    outsideFontSentence(many),
    formats.findUnsupportedCharacters(many).flatMap((b) => b.characters),
  ]).toEqual([
    ["Checks", "日 and س are outside the script font and print as boxes"],
    "日 is outside the script font and prints as a box",
    null,
    "日, س, 👨‍👩‍👧, e\u0301, 本, 中, 文, 字, 漢, 語, 한 and 글 are outside the script font and print as boxes",
    [
      "日",
      "س",
      "👨‍👩‍👧",
      "e\u0301",
      "本",
      "中",
      "文",
      "字",
      "漢",
      "語",
      "한",
      "글",
      "ア",
    ],
  ]);
});

test("Print names its pages and prints what the screen shows", async () => {
  const printed: (number | null)[] = [];
  stub(window, "print", () => {
    printed.push(document.getElementById("mn-print")?.children.length ?? null);
  });
  const { container, router, clock } = await renderApp("/s/d1/send/print", {
    p: numbered(30),
  });
  const title = container.querySelector("h1")?.textContent;
  act(() => actionButton(container).click());
  await until(() => {
    act(() => clock.advance(16));
    return printed.length > 0;
  });
  const before = [
    document.getElementById("mn-print")?.children.length,
    router.state.location.pathname,
  ];
  act(() => {
    window.dispatchEvent(new Event("afterprint"));
  });
  expect([
    title,
    printed,
    before,
    document.querySelectorAll("#mn-print").length,
    [...document.querySelectorAll("style")].filter((style) =>
      style.textContent?.includes("@page"),
    ).length,
  ]).toEqual(["Print 30 pages", [30], [30, "/s/d1"], 0, 0]);
});

test("a long print says how far it has got and can be cancelled", async () => {
  let printed = 0;
  stub(window, "print", () => {
    printed++;
  });
  const frames = createFrames();
  const { container, router, clock } = await renderApp("/s/d1/send/print", {
    p: numbered(120),
    frame: frames.request,
  });
  act(() => actionButton(container).click());
  act(() => frames.fire());
  act(() => clock.advance(2000));
  const progress = container.textContent?.includes("Page 25 of 120");
  act(() => clock.advance(8000));
  const cancel = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Cancel",
  );
  act(() => cancel?.click());
  await until(() => actionButton(container).textContent === "Print 120 pages");
  act(() => frames.fire());
  expect([
    progress,
    document.querySelectorAll("#mn-print").length,
    actionButton(container).textContent,
    router.state.location.pathname,
    printed,
  ]).toEqual([true, 0, "Print 120 pages", "/s/d1/send/print", 0]);
});

test("a print that cannot be prepared says so above the button and keeps the screen", async () => {
  const building = spyOn(printing, "printPages").mockImplementation(() =>
    Promise.reject(new RangeError("no engine of version 9 in this build")),
  );
  restores.push(() => building.mockRestore());
  const { container, router } = await renderApp("/s/d1/send/print", {
    p: numbered(30),
  });
  act(() => actionButton(container).click());
  await until(() => document.activeElement?.tagName === "P");
  expect([
    document.activeElement?.textContent,
    actionButton(container).textContent,
    router.state.location.pathname,
  ]).toEqual([
    "Couldn't prepare 'The Long Night' to print. Try again.",
    "Print 30 pages",
    "/s/d1/send/print",
  ]);
});

test("an Ink script offers neither", async () => {
  const exported = await renderApp("/s/d1/send/export", {
    p: numbered(1),
    format: "ink",
  });
  await until(
    () => exported.router.state.location.pathname !== "/s/d1/send/export",
  );
  const fromExport = exported.router.state.location.pathname;
  act(() => mounted?.unmount());
  for (const restore of restores.splice(0).toReversed()) restore();
  const printedAt = await renderApp("/s/d1/send/print", {
    p: numbered(1),
    format: "ink",
  });
  await until(
    () => printedAt.router.state.location.pathname !== "/s/d1/send/print",
  );
  expect([fromExport, printedAt.router.state.location.pathname]).toEqual([
    "/s/d1",
    "/s/d1",
  ]);
});
