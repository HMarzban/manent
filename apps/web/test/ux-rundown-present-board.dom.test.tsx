import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { NEWS_COLUMNS, SHOW_COLUMNS } from "@manent/schema";
import {
  BOARD_WORDS,
  DOCUMENT_WORDS,
  PROMPTER_WINDOW_WORDS,
  RUNDOWN_WORDS,
} from "@manent/ui";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { DEFAULT_COLUMN_WIDTHS_PX } from "../src/rundown/columns.tsx";
import { RowMenu } from "../src/rundown/rows.tsx";
import { fetchRundownMeta } from "../src/rundown/rundown-access.ts";
import { BoardTitleBar } from "../src/screens/board/board-bars.tsx";
import { StorylineHeader } from "../src/screens/board/storyline-header.tsx";
import { PrompterBar } from "../src/screens/present/prompter/prompter-bar.tsx";
import { MiniMapToc } from "../src/screens/present/room/minimap-toc.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import { testEnvironment, testServices } from "./services.fixtures.ts";

withDom();

let roots: Root[] = [];
const originalFetch = globalThis.fetch;

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  globalThis.fetch = originalFetch;
});

function mount(node: ReactNode): HTMLElement {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(node));
  return host;
}

test("default News and Show column totals stay within 1024 px without clipping", () => {
  const newsTotal = NEWS_COLUMNS.reduce(
    (sum, id) => sum + DEFAULT_COLUMN_WIDTHS_PX[id],
    0,
  );
  const showTotal = SHOW_COLUMNS.reduce(
    (sum, id) => sum + DEFAULT_COLUMN_WIDTHS_PX[id],
    0,
  );
  expect(newsTotal).toBe(1012);
  expect(showTotal).toBe(964);
});

test("fetchRundownMeta skips /api/docs/people when /api/docs/describe refuses", async () => {
  const paths: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    paths.push(url);
    return new Response("{}", { status: 403 });
  }) as typeof fetch;

  const result = await fetchRundownMeta("doc-1", "tok");
  expect(paths).toEqual(["/api/docs/describe"]);
  expect(result).toEqual({ access: null, people: [] });
});

test("rundown RowMenu omits itself when no menu item is enabled on a header row", () => {
  const env = testEnvironment();
  const services = testServices({ userId: "dana", environment: env });
  const headerRow = {
    id: "hdr-1",
    order: "a0",
    kind: "header" as const,
    docId: null,
    blockId: null,
    unnumbered: false,
    durationMs: null,
    prompter: null,
    cells: {},
  };

  const host = mount(
    <EnvironmentProvider environment={env}>
      <ServicesProvider services={services}>
        <RowMenu
          row={headerRow}
          rowIndex={0}
          rowCount={1}
          label={RUNDOWN_WORDS.rowHandle("ACT ONE")}
          activeCell={null}
          onBeforeOpen={() => {}}
          onOpenPrevious={() => {}}
        />
      </ServicesProvider>
    </EnvironmentProvider>,
  );
  expect(host.querySelector("button")).toBeNull();
  services.dispose();
});

test("PrompterBar stays single-row, hides Text size label below sm and renders optional Back button", () => {
  const clicks: string[] = [];
  const view = {
    v: 1 as const,
    textSize: 48 as const,
    dark: true,
    mirror: false,
  };

  const standalone = mount(
    <PrompterBar
      status={{ kind: "live" }}
      view={view}
      onBack={() => clicks.push("back")}
      onTextSizeChange={() => {}}
      onDarkChange={() => {}}
      onMirrorChange={() => {}}
    />,
  );
  const header = standalone.querySelector("header")!;
  expect(header.className).not.toContain("flex-wrap");
  const backButton = standalone.querySelector<HTMLButtonElement>(
    `button[aria-label="${DOCUMENT_WORDS.back}"]`,
  );
  expect(backButton).not.toBeNull();
  act(() => backButton?.click());
  expect(clicks).toEqual(["back"]);
  const textSizeSpan = [...standalone.querySelectorAll("span")].find(
    (el) => el.textContent === PROMPTER_WINDOW_WORDS.textSize,
  );
  expect(textSizeSpan?.className).toContain("hidden");
  expect(textSizeSpan?.className).toContain("sm:inline");

  const popup = mount(
    <PrompterBar
      status={{ kind: "live" }}
      view={view}
      onTextSizeChange={() => {}}
      onDarkChange={() => {}}
      onMirrorChange={() => {}}
    />,
  );
  expect(
    popup.querySelector(`button[aria-label="${DOCUMENT_WORDS.back}"]`),
  ).toBeNull();
});

test("MiniMapToc uses compact desktop width and dismissible mobile overlay controls", () => {
  const host = mount(
    <MiniMapToc
      docId="doc-1"
      rows={[
        {
          blockId: "sc-1",
          kind: "scene",
          number: "1",
          heading: "INT. PIER - DAY",
          synopsis: "",
          eighths: 8,
          omitted: false,
          current: true,
        },
      ]}
      activeBlockId="sc-1"
      progress={25}
      onJump={() => {}}
    />,
  );
  const toggle = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Show script outline"]',
  )!;
  act(() => toggle.click());

  const card = host.querySelector<HTMLElement>(".mn-minimap-card")!;
  expect(card.className).toContain("md:w-60");
  expect(card.className).toContain("max-md:fixed");

  const dismiss = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${DOCUMENT_WORDS.dismiss}"]`,
  )!;
  expect(dismiss).not.toBeNull();
  act(() => dismiss.click());
  expect(host.querySelector(".mn-minimap-card")).toBeNull();
});

test("BoardTitleBar keeps heading readable on narrow widths and StorylineHeader reveals RowMenu on hover", () => {
  const host = mount(
    <>
      <BoardTitleBar
        projectTitle="Harbour Lights"
        seasons={[{ id: "s1", number: 1, title: null }]}
        activeSeason={{ id: "s1", number: 1, title: null }}
        canEdit={true}
        showViewOnly={false}
        onBack={() => {}}
        onSeasonChange={() => {}}
        onAddStoryline={() => {}}
      />
      <StorylineHeader
        storyline={{ id: "sl-1", title: "A Story", order: "a0" }}
        rowStart={2}
        isLast={true}
        canEdit={true}
        onRename={() => {}}
        onRemove={() => {}}
      />
    </>,
  );

  const heading = host.querySelector("h1")!;
  expect(heading.textContent).toBe("Harbour Lights · Board");
  expect(heading.className).toContain("flex-1");
  const addButton = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${BOARD_WORDS.addStoryline}"]`,
  )!;
  expect(addButton).not.toBeNull();

  const headerCell = host.querySelector(".group\\/storyline");
  expect(headerCell).not.toBeNull();
  expect(headerCell?.innerHTML).toContain("group-hover/storyline:opacity-100");
});
