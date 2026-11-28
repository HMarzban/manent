import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { appliesToFormat } from "@manent/settings";
import { CommandsProvider, TooltipProvider } from "@manent/ui";
import type { StatusFacts } from "@manent/ui";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { withRecordedAccess } from "../src/editor-host/test-hooks.ts";
import { BookFormatBar } from "../src/screens/document/book-toolbar/book-format-bar.tsx";
import { WordCountReadout } from "../src/screens/document/word-count-readout.tsx";
import { typesOffered } from "../src/send/file-types.ts";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import { FactsContext } from "../src/state/bridge-contexts.ts";
import { createFactsStore } from "../src/state/facts.store.ts";
import { formattingBarActions } from "../src/state/formatting-bar.store.ts";
import { bindGuard } from "../src/state/guard.ts";
import {
  createClock,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

withDom();

const DOC_ID = "00000000-0000-4000-8000-0000000000b1";

const roots: Root[] = [];
afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
    formattingBarActions.set(true);
  });
  document.body.replaceChildren();
});

function mountWithFormat(
  format: "manuscript" | "screenplay",
  ui: ReactNode,
  options?: {
    readonly access?: StatusFacts["access"];
    readonly blockType?: string;
    readonly blockAlign?: "left" | "center" | "right";
    readonly blockFirstLine?: "flush" | "drop_cap" | "raised_cap" | null;
    readonly markColor?: string | null;
    readonly markHighlight?: string | null;
  },
) {
  const pageRegion = document.createElement("div");
  pageRegion.setAttribute("data-region", "page");
  document.body.append(pageRegion);

  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);

  const clock = createClock();
  const env = testEnvironment({
    now: clock.now,
    schedule: clock.schedule,
    frame: (fn) => clock.schedule(fn, 16),
  });
  bindGuard(env.guard);

  const services = withRecordedAccess(
    testServices({ userId: "leo", environment: env }),
    new Map([[DOC_ID, options?.access ?? "edit"]]),
  );
  const ranActions: unknown[] = [];
  services.editor.attach({
    run(action) {
      ranActions.push(action);
      return { ok: true };
    },
    showTitlePage: () => {},
    zoomPercent: () => 100,
  });
  services.openScriptStore(DOC_ID).set("script.format", format);

  const facts = createFactsStore({
    guard: env.guard,
    frame: (fn) => {
      fn();
      return () => {};
    },
  });
  facts.writer.publish({
    element: format === "manuscript" ? "Body" : "Action",
    blockType:
      options?.blockType ?? (format === "manuscript" ? "body" : "action"),
    blockFirstLine: options?.blockFirstLine ?? null,
    marksMask: 1 | 2,
    markColor: options?.markColor ?? null,
    markHighlight: options?.markHighlight ?? null,
    wordCount: 1420,
    canUndo: true,
    canRedo: false,
    columnCells: 65,
    blockIndent: 0,
    blockWidth: 65,
    blockAlign: options?.blockAlign ?? "left",
    blockSpaceBefore: 0,
    blockSpaceBeforeSet: false,
  });

  act(() => {
    root.render(
      <EnvironmentProvider environment={env}>
        <ServicesProvider services={services}>
          <CommandsProvider
            service={services.commands}
            resolved={services.resolved}
            platform="mac"
          >
            <TooltipProvider>
              <FactsContext value={facts.selectors}>{ui}</FactsContext>
            </TooltipProvider>
          </CommandsProvider>
        </ServicesProvider>
      </EnvironmentProvider>,
    );
  });
  return { host, pageRegion, services, facts, ranActions, root };
}

test("BookFormatBar floats over page only on editable manuscripts, sets page clearance and roving tabindex", () => {
  const sp = mountWithFormat("screenplay", <BookFormatBar docId={DOC_ID} />);
  expect(sp.host.querySelector('[role="toolbar"]')).toBeNull();
  expect(sp.pageRegion.getAttribute("data-floating-bar")).toBeNull();
  act(() => sp.root.unmount());
  document.body.replaceChildren();

  const bk = mountWithFormat("manuscript", <BookFormatBar docId={DOC_ID} />);
  const toolbar = bk.host.querySelector('[role="toolbar"]');
  expect(toolbar?.getAttribute("aria-label")).toBe("Book format");
  expect(toolbar?.className).toContain("mn-book-pill");
  expect(bk.pageRegion.getAttribute("data-floating-bar")).toBe("true");

  // Single Tab stop across toolbar buttons (true WAI-ARIA roving tabindex)
  const items = [
    ...bk.host.querySelectorAll<HTMLButtonElement>(
      "[data-toolbar-item]:not(:disabled)",
    ),
  ];
  expect(items.filter((el) => el.tabIndex === 0).length).toBe(1);

  const bold = bk.host.querySelector<HTMLButtonElement>(
    'button[aria-label="Bold"]',
  )!;
  const italic = bk.host.querySelector<HTMLButtonElement>(
    'button[aria-label="Italic"]',
  )!;
  const underline = bk.host.querySelector<HTMLButtonElement>(
    'button[aria-label="Underline"]',
  )!;
  const dropCap = bk.host.querySelector<HTMLButtonElement>(
    'button[aria-label="Drop cap"]',
  )!;
  expect(bold.getAttribute("aria-pressed")).toBe("true");
  expect(italic.getAttribute("aria-pressed")).toBe("true");
  expect(underline.getAttribute("aria-pressed")).toBe("false");
  expect(dropCap.getAttribute("aria-pressed")).toBe("false");
  expect(dropCap.disabled).toBe(false);

  act(() => {
    dropCap.click();
  });
  expect(bk.ranActions).toEqual([{ kind: "first_line", value: "drop_cap" }]);

  act(() => formattingBarActions.set(false));
  expect(bk.host.querySelector('[role="toolbar"]')).toBeNull();
  expect(bk.pageRegion.getAttribute("data-floating-bar")).toBeNull();
});

test("Drop cap disables on chapter headings, Space and indent stays quiet on default centred chapters, and BookFormatBar hides for viewers", () => {
  const onChapter = mountWithFormat(
    "manuscript",
    <BookFormatBar docId={DOC_ID} />,
    { blockType: "chapter", blockAlign: "center" },
  );
  const dropCap = onChapter.host.querySelector<HTMLButtonElement>(
    'button[aria-label="Drop cap"]',
  )!;
  const spaceIndent = onChapter.host.querySelector<HTMLButtonElement>(
    'button[aria-label="Space and indent"]',
  )!;
  const alignBtn = onChapter.host.querySelector<HTMLButtonElement>(
    'button[aria-label="Alignment"]',
  )!;
  expect(dropCap.disabled).toBe(true);
  expect(spaceIndent.getAttribute("aria-pressed")).toBe("false");
  expect(alignBtn.getAttribute("aria-pressed")).toBe("false");
  act(() => onChapter.root.unmount());
  document.body.replaceChildren();

  const coloured = mountWithFormat(
    "manuscript",
    <BookFormatBar docId={DOC_ID} />,
    { markColor: "red", markHighlight: "yellow" },
  );
  const colourBtn = coloured.host.querySelector<HTMLButtonElement>(
    'button[aria-label="Colour and highlight"]',
  )!;
  expect(colourBtn.getAttribute("aria-pressed")).toBe("true");
  expect(
    colourBtn.querySelector('.mn-colour-bar[data-color="red"]'),
  ).not.toBeNull();
  expect(
    colourBtn.querySelector('.mn-colour-dot[data-swatch="hl-yellow"]'),
  ).not.toBeNull();
  act(() => {
    colourBtn.click();
  });
  const redSwatch = document.body.querySelector<HTMLButtonElement>(
    'button[aria-label="Text colour: Red"]',
  )!;
  expect(
    redSwatch.querySelector('.mn-swatch[data-swatch="text-red"]'),
  ).not.toBeNull();
  expect(
    document.body.querySelector('.mn-swatch[data-swatch="hl-yellow"]'),
  ).not.toBeNull();
  expect(
    document.body.querySelector('.mn-swatch[data-swatch="text-none"] svg'),
  ).not.toBeNull();
  // Pointer mousedown on toolbar controls and swatches must prevent default so ProseMirror never blurs or drops selection.
  const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
  redSwatch.dispatchEvent(down);
  expect(down.defaultPrevented).toBe(true);
  act(() => {
    redSwatch.click();
  });
  expect(coloured.ranActions).toContainEqual({ kind: "colour", value: "red" });
  act(() => coloured.root.unmount());
  document.body.replaceChildren();

  const viewOnly = mountWithFormat(
    "manuscript",
    <BookFormatBar docId={DOC_ID} />,
    { access: "view" },
  );
  expect(viewOnly.host.querySelector('[role="toolbar"]')).toBeNull();
});

test("WordCountReadout renders formatted word count only on manuscript documents", () => {
  const sp = mountWithFormat("screenplay", <WordCountReadout docId={DOC_ID} />);
  expect(sp.host.textContent).toBe("");
  act(() => sp.root.unmount());
  document.body.replaceChildren();

  const bk = mountWithFormat("manuscript", <WordCountReadout docId={DOC_ID} />);
  expect(bk.host.textContent).toContain("1,420 words");
});

test("Book settings and exports exclude screenplay-only noise and include Word (.docx)", () => {
  expect(appliesToFormat("script.paper", "manuscript")).toBe(true);
  expect(appliesToFormat("script.lineSpacing", "manuscript")).toBe(true);
  expect(appliesToFormat("script.lineSpacing", "screenplay")).toBe(false);
  expect(appliesToFormat("script.linesPerPage", "manuscript")).toBe(true);
  expect(appliesToFormat("script.header", "manuscript")).toBe(true);
  expect(appliesToFormat("script.moresAtBreaks", "manuscript")).toBe(false);
  expect(appliesToFormat("script.sameSpeakerContd", "manuscript")).toBe(false);
  expect(appliesToFormat("script.sceneNumbers", "manuscript")).toBe(false);
  expect(appliesToFormat("script.colourOrder", "manuscript")).toBe(false);

  const bookExports = typesOffered("export", {
    docKind: "script",
    format: "manuscript",
    locked: false,
  }).map((t) => t.id);
  expect(bookExports).toEqual(["pdf", "docx", "archive"]);

  const screenplayExports = typesOffered("export", {
    docKind: "script",
    format: "screenplay",
    locked: false,
  }).map((t) => t.id);
  expect(screenplayExports).toContain("fdx");
  expect(screenplayExports).toContain("fountain");
  expect(screenplayExports).toContain("docx");
});
