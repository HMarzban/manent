import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import {
  ORIGIN_MATERIAL,
  scriptBody,
  scriptDocFromJSON,
  writeSceneProgress,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { BlockJSON, DocJSON } from "@manent/schema";
import {
  CommandsProvider,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Row,
  SCENE_MOVE_WORDS,
  SortableList,
  TimingProvider,
  VirtualRows,
  createValue,
} from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { assignmentSceneMarks } from "../src/assignment/scene-marks.ts";
import { registerLiveEditor } from "../src/editor-host/live-editor.ts";
import type { LiveEditor } from "../src/editor-host/live-editor.ts";
import { wouldEmptyScript } from "../src/editor-host/material.ts";
import { cutFirstLine } from "../src/material/cuts/script-cuts.ts";
import {
  disposeProductionServices,
  keepProductionServices,
} from "../src/production/live-services.ts";
import type { ProductionServices } from "../src/production/services.ts";
import { SceneCards } from "../src/scenes/cards.tsx";
import {
  SceneTitle,
  sceneRowMeta,
  useSceneExtras,
} from "../src/scenes/marks.tsx";
import type { SceneParts } from "../src/scenes/marks.tsx";
import { moveSceneTo, rowLabel, scriptBlocks } from "../src/scenes/moves.ts";
import { MoveItem, SceneRowMenu } from "../src/scenes/row-menu.tsx";
import { scenesTab } from "../src/screens/document/scenes-tab.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import { OutlineContext } from "../src/state/bridge-contexts.ts";
import { createOutlineStore } from "../src/state/outline.store.ts";
import type { OutlineRow } from "../src/state/outline.store.ts";
import {
  MemoryStorage,
  createClock,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

withDom();

const DOC_ID = "5d0c9a7e-2b4f-4c1a-9e3d-000000796f88";
const USER_ID = "sam";

const roots: Root[] = [];
const cleanups: (() => void)[] = [];

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  for (const stop of cleanups.splice(0)) stop();
  disposeProductionServices(USER_ID);
  document.body.replaceChildren();
});

const block = (
  id: string,
  type: BlockJSON["attrs"] extends infer A
    ? A extends { type?: infer T }
      ? T
      : string
    : string,
  text: string,
): BlockJSON => ({
  type: "block",
  attrs: { id, type: String(type) },
  content: text === "" ? [] : [{ type: "text", text }],
});

function docFromBlocks(blocks: readonly BlockJSON[]): CrdtDoc {
  const json: DocJSON = {
    type: "doc",
    content: [{ type: "section", content: [...blocks] }],
  };
  return scriptDocFromJSON(json);
}

function registerDoc(docId: string, doc: CrdtDoc): void {
  const fake = {
    docId,
    doc,
    view: {} as LiveEditor["view"],
    scaffold: null,
    presence: {} as LiveEditor["presence"],
    editable: true,
    pagination: () => null,
    zoom: () => 1,
    frontPages: () => null,
  } satisfies LiveEditor;
  cleanups.push(registerLiveEditor(fake));
}

const sceneRow = (
  blockId: string,
  number: string | null,
  heading: string,
  patch: Partial<OutlineRow> = {},
): OutlineRow => ({
  blockId,
  kind: "scene",
  number,
  heading,
  synopsis: "",
  eighths: null,
  omitted: false,
  current: false,
  ...patch,
});

function createHarness(options?: {
  format?: "screenplay" | "manuscript" | "variety" | "stage_play" | "ink";
  kind?: "book" | "podcast" | "film" | "show";
}) {
  const clock = createClock();
  const environment = testEnvironment({
    storage: new MemoryStorage(),
    now: clock.now,
    schedule: clock.schedule,
    frame: (fn) => clock.schedule(fn, 16),
  });
  const base = testServices({
    userId: USER_ID,
    environment,
  });
  if (options?.format !== undefined) {
    base.openScriptStore(DOC_ID).set("script.format", options.format);
  }
  const services =
    options?.kind === undefined
      ? base
      : {
          ...base,
          library: {
            ...base.library,
            documentKind: () => createValue(options.kind ?? null),
          },
        };
  const outline = createOutlineStore({
    guard: environment.guard,
    schedule: clock.schedule,
    composing: () => false,
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  return { clock, environment, services, outline, host, root };
}

test("progress without a writer produces a scene mark, and not started without a writer produces none", async () => {
  const b1 = "11111111-1111-4111-8111-111111111111";
  const b2 = "22222222-2222-4222-8222-222222222222";
  const b3 = "33333333-3333-4333-8333-333333333333";
  const doc = docFromBlocks([
    block(b1, "scene_heading", "INT. KITCHEN - DAY"),
    block(b2, "scene_heading", "EXT. PIER - NIGHT"),
    block(b3, "scene_heading", "INT. HALL - DAY"),
  ]);
  registerDoc(DOC_ID, doc);
  keepProductionServices(
    DOC_ID,
    USER_ID,
    () =>
      ({
        userId: USER_ID,
        people: async () => [{ userId: "sam", name: "Sam Okafor" }],
        dispose: () => {},
      }) as unknown as ProductionServices,
  );
  writeSceneProgress(doc, b1, "drafting", ORIGIN_MATERIAL);
  writeSceneProgress(doc, b2, "not_started", ORIGIN_MATERIAL);
  scriptBody(doc).write((writer) => {
    writer.setBlockAttrs(b3, { writerUserId: "sam" });
  }, ORIGIN_MATERIAL);
  writeSceneProgress(doc, b3, "handed_in", ORIGIN_MATERIAL);

  const source = assignmentSceneMarks(DOC_ID);
  const stop = source.subscribe(() => {});
  cleanups.push(stop);
  await Promise.resolve();
  await Promise.resolve();

  expect([
    source.get().get(b1),
    source.get().get(b2),
    source.get().get(b3),
  ]).toEqual([
    [{ kind: "text", label: "Drafting" }],
    undefined,
    [{ kind: "text", label: "Sam Okafor · Handed in" }],
  ]);
});

test("writer and progress marks render outside the truncated heading in List and Cards views", () => {
  const { clock, environment, services, outline, host, root } = createHarness();
  const rows = [
    sceneRow(
      "s1",
      "1",
      "INT. A VERY LONG SCENE HEADING THAT WOULD TRUNCATE INLINE MARKS - NIGHT",
      { synopsis: "The kettle boils." },
    ),
  ];
  outline.writer.publish(rows);
  clock.advance(250);

  const parts: SceneParts = {
    docId: DOC_ID,
    extras: {
      marks: () => [
        { kind: "text", label: "Sam Okafor · Drafting" },
        { kind: "count", label: "open", count: 2 },
      ],
      length: () => "5 5/8",
    },
    items: [],
  };

  act(() =>
    root.render(
      <EnvironmentProvider environment={environment}>
        <ServicesProvider services={services}>
          <CommandsProvider
            service={services.commands}
            resolved={services.resolved}
            platform="mac"
          >
            <OutlineContext value={outline.selectors}>
              <SceneCards rows={rows} canEdit={false} parts={parts} />
            </OutlineContext>
          </CommandsProvider>
        </ServicesProvider>
      </EnvironmentProvider>,
    ),
  );

  const cardHeading = host.querySelector(".line-clamp-2");
  const card = host.querySelector(".mn-card");

  const listHost = document.createElement("div");
  document.body.append(listHost);
  const listRoot = createRoot(listHost);
  roots.push(listRoot);
  const rowMarks = parts.extras.marks("s1");
  act(() =>
    listRoot.render(
      <Row meta={sceneRowMeta(rowMarks, rows[0]!.synopsis)}>
        <SceneTitle heading={rows[0]!.heading} marks={rowMarks} />
      </Row>,
    ),
  );
  const listLines = listHost.querySelectorAll(".mn-row > span > span");
  const listTitleLine = listLines[0];
  const listMetaLine = listLines[1];

  expect([
    cardHeading?.textContent?.includes("Sam Okafor · Drafting"),
    cardHeading?.textContent?.includes("2 open"),
    card?.textContent?.includes("Sam Okafor · Drafting"),
    card?.textContent?.includes("2 open"),
    listTitleLine?.textContent?.includes("Sam Okafor · Drafting"),
    listTitleLine?.textContent?.includes("2 open"),
    listMetaLine?.textContent?.includes("Sam Okafor · Drafting"),
    listMetaLine?.textContent?.includes("2 open"),
    listMetaLine?.textContent?.includes("The kettle boils."),
  ]).toEqual([false, false, true, true, false, false, true, true, true]);
});

const findMenuItem = (label: string): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (el) => el.textContent?.trim() === label,
  );

test("the Move submenu moves scenes and disables boundary actions", async () => {
  const b1 = "11111111-1111-4111-8111-111111111111";
  const b2 = "22222222-2222-4222-8222-222222222222";
  const b3 = "33333333-3333-4333-8333-333333333333";
  const doc = docFromBlocks([
    block(b1, "scene_heading", "INT. ONE"),
    block(b2, "scene_heading", "INT. TWO"),
    block(b3, "scene_heading", "INT. THREE"),
  ]);
  registerDoc(DOC_ID, doc);

  const { clock, environment, services, outline, host, root } = createHarness();
  const rows = [
    sceneRow(b1, "1", "INT. ONE"),
    sceneRow(b2, "2", "INT. TWO"),
    sceneRow(b3, "3", "INT. THREE"),
  ];
  outline.writer.publish(rows);
  clock.advance(250);

  const renderMenus = () =>
    act(() =>
      root.render(
        <EnvironmentProvider environment={environment}>
          <ServicesProvider services={services}>
            <CommandsProvider
              service={services.commands}
              resolved={services.resolved}
              platform="mac"
            >
              <OutlineContext value={outline.selectors}>
                {rows.map((row) => (
                  <SceneRowMenu
                    key={row.blockId}
                    docId={DOC_ID}
                    headingId={row.blockId}
                    title={row.heading}
                    items={[{ id: "move", Item: MoveItem }]}
                  >
                    {(handle) => <div data-row={row.blockId}>{handle}</div>}
                  </SceneRowMenu>
                ))}
              </OutlineContext>
            </CommandsProvider>
          </ServicesProvider>
        </EnvironmentProvider>,
      ),
    );

  renderMenus();

  // Open row 1 menu -> Move submenu -> Move up & Move to start are disabled, Move to end works
  const firstTrigger = host.querySelector<HTMLButtonElement>(
    `[data-row="${b1}"] button`,
  )!;
  await act(async () => firstTrigger.click());
  const moveSubTrigger = [
    ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ].find((el) => el.textContent?.includes(SCENE_MOVE_WORDS.move));
  expect(moveSubTrigger).toBeDefined();
  await act(async () => moveSubTrigger!.click());

  const moveUp = findMenuItem("Move up");
  const moveDown = findMenuItem("Move down");
  const moveToStart = findMenuItem("Move to start");
  const moveToEnd = findMenuItem("Move to end");
  expect([
    moveUp?.getAttribute("aria-disabled"),
    moveToStart?.getAttribute("aria-disabled"),
    moveDown?.getAttribute("aria-disabled"),
    moveToEnd?.getAttribute("aria-disabled"),
  ]).toEqual(["true", "true", null, null]);

  await act(async () => moveToEnd!.click());
  expect(scriptBlocks(doc).map((b) => b.attrs?.id)).toEqual([b2, b3, b1]);
});

test("moving a scene in a filtered list lands relative to the target scene rather than at the script start", () => {
  const b1 = "11111111-1111-4111-8111-111111111111";
  const a1 = "11111111-1111-4111-8111-111111111112";
  const b2 = "22222222-2222-4222-8222-222222222222";
  const a2 = "22222222-2222-4222-8222-222222222223";
  const b3 = "33333333-3333-4333-8333-333333333333";
  const a3 = "33333333-3333-4333-8333-333333333334";
  const doc = docFromBlocks([
    block(b1, "scene_heading", "INT. KITCHEN"),
    block(a1, "action", "Tea steeps."),
    block(b2, "scene_heading", "EXT. PIER - DAY"),
    block(a2, "action", "Gulls cry."),
    block(b3, "scene_heading", "EXT. PIER - NIGHT"),
    block(a3, "action", "Rain falls."),
  ]);
  registerDoc(DOC_ID, doc);
  const { services } = createHarness();

  // Filtered outline containing only the two PIER scenes (indices 0 and 1)
  const filtered = [
    sceneRow(b2, "2", "EXT. PIER - DAY"),
    sceneRow(b3, "3", "EXT. PIER - NIGHT"),
  ];
  moveSceneTo({
    docId: DOC_ID,
    rows: filtered,
    from: 1,
    to: 0,
    messages: services.messages,
  });

  // Scene 3 must land before Scene 2 (after a1), NOT before Scene 1!
  expect(scriptBlocks(doc).map((b) => b.attrs?.id)).toEqual([
    b1,
    a1,
    b3,
    a3,
    b2,
    a2,
  ]);
});

test("a scene's accessible name includes 1 page for a one-page scene", () => {
  expect([
    rowLabel(sceneRow("s1", "1", "INT. KITCHEN", { eighths: 8 })),
    rowLabel(sceneRow("s2", "2", "EXT. PIER", { eighths: 45 })),
    rowLabel(sceneRow("s3", "3", "INT. HALL", { eighths: null })),
  ]).toEqual([
    "Sc. 1 · INT. KITCHEN, 1 page",
    "Sc. 2 · EXT. PIER, 5 5/8 pages",
    "Sc. 3 · INT. HALL",
  ]);
});

test("moving to cuts detects when taking blocks would empty the entire script", () => {
  const b1 = "11111111-1111-4111-8111-111111111111";
  const a1 = "11111111-1111-4111-8111-111111111112";
  const doc = docFromBlocks([
    block(b1, "scene_heading", "INT. ONLY SCENE"),
    block(a1, "action", "Sole line."),
  ]);

  expect([
    wouldEmptyScript(doc, [b1, a1]),
    wouldEmptyScript(doc, [a1]),
  ]).toEqual([true, false]);
});

test("a cut's preview line skips a scene or chapter heading when body lines follow it", () => {
  const b1 = "11111111-1111-4111-8111-111111111111";
  const a1 = "11111111-1111-4111-8111-111111111112";
  const withBody = {
    v: 1 as const,
    blocks: [
      block(b1, "chapter", "Chapter One"),
      block(a1, "body", "The harbour lights flickered."),
    ],
    origin: { afterBlockId: null, sceneHeadingId: null },
    authorUserId: USER_ID,
    createdAt: 1000,
  };
  const headingOnly = {
    ...withBody,
    blocks: [block(b1, "chapter", "Chapter One")],
  };
  expect([cutFirstLine(withBody), cutFirstLine(headingOnly)]).toEqual([
    "The harbour lights flickered.",
    "Chapter One",
  ]);
});

function pageLengthTooltipsFor(
  format: "manuscript" | "screenplay",
): (string | null)[][] {
  const { clock, environment, services, outline, host, root } = createHarness({
    format,
  });
  const rows = [
    sceneRow("s1", "1", "Chapter One", { eighths: 45 }),
    sceneRow("s2", "2", "Chapter Two", { eighths: 8 }),
  ];
  outline.writer.publish(rows);
  clock.advance(250);
  const Tab = scenesTab.Tab;
  act(() =>
    root.render(
      <EnvironmentProvider environment={environment}>
        <ServicesProvider services={services}>
          <TimingProvider timing={{ now: clock.now, schedule: clock.schedule }}>
            <CommandsProvider
              service={services.commands}
              resolved={services.resolved}
              platform="mac"
            >
              <OutlineContext value={outline.selectors}>
                <Tab docId={DOC_ID} />
              </OutlineContext>
            </CommandsProvider>
          </TimingProvider>
        </ServicesProvider>
      </EnvironmentProvider>,
    ),
  );
  const spans = [...host.querySelectorAll<HTMLElement>("[title]")].filter(
    (el) => el.getAttribute("title")?.includes("page"),
  );
  return spans.map((el) => [el.textContent, el.getAttribute("title")]);
}

test("manuscript chapters show pp. and p. with pages tooltip while screenplays keep eighths with pages tooltip", () => {
  expect([
    pageLengthTooltipsFor("manuscript"),
    pageLengthTooltipsFor("screenplay"),
  ]).toEqual([
    [
      ["6 pp.", "5 5/8 pages"],
      ["1 p.", "1 page"],
    ],
    [
      ["5 5/8", "5 5/8 pages"],
      ["1", "1 page"],
    ],
  ]);
});

test("a virtual row list ignores arrow keys from portalled menus and a sortable list passes its label through", async () => {
  const { host, root } = createHarness();
  const moves: number[] = [];

  act(() =>
    root.render(
      <VirtualRows
        count={3}
        rowHeight="one"
        label="Scenes"
        onKeyMove={(index) => moves.push(index)}
        renderRow={(i) => (
          <ContextMenu defaultOpen={i === 1}>
            <ContextMenuTrigger>
              <Row onActivate={() => {}}>{`Scene ${i + 1}`}</Row>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem>{`Action ${i + 1}`}</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )}
      />,
    ),
  );

  const menuItem = document.querySelector<HTMLElement>('[role="menuitem"]');
  expect(menuItem).not.toBeNull();
  act(() => {
    menuItem!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
  });
  expect(moves).toEqual([]);

  act(() =>
    root.render(
      <SortableList
        label="Chapters"
        items={[{ id: "c1", label: "Chapter 1" }]}
        orientation="vertical"
        onMove={() => {}}
        renderItem={(id) => <Row>{id}</Row>}
      />,
    ),
  );
  expect(host.querySelector('[role="list"]')?.getAttribute("aria-label")).toBe(
    "Chapters",
  );
});

test("a card's row menu sits outside the drag handle and the blank card inserts the script format's heading", () => {
  const b1 = "11111111-1111-4111-8111-111111111111";
  const doc = docFromBlocks([block(b1, "chapter", "Chapter One")]);
  registerDoc(DOC_ID, doc);

  const { clock, environment, services, outline, host, root } = createHarness({
    format: "manuscript",
    kind: "book",
  });
  const rows = [sceneRow(b1, "1", "Chapter One", { eighths: 45 })];
  outline.writer.publish(rows);
  clock.advance(250);

  function CardsHarness() {
    const extras = useSceneExtras(DOC_ID, "manuscript");
    return (
      <SceneCards
        rows={rows}
        canEdit
        parts={{
          docId: DOC_ID,
          extras,
          items: [{ id: "move", Item: MoveItem }],
        }}
      />
    );
  }

  act(() =>
    root.render(
      <EnvironmentProvider environment={environment}>
        <ServicesProvider services={services}>
          <CommandsProvider
            service={services.commands}
            resolved={services.resolved}
            platform="mac"
          >
            <OutlineContext value={outline.selectors}>
              <CardsHarness />
            </OutlineContext>
          </CommandsProvider>
        </ServicesProvider>
      </EnvironmentProvider>,
    ),
  );

  const cardHandle = host.querySelector('.mn-card[tabindex="0"]');
  const menuButton = host.querySelector("[data-row-menu] button");
  const lengthSpan = host.querySelector('[title="5 5/8 pages"]');
  const blank = host.querySelector<HTMLTextAreaElement>("textarea[data-new]");

  expect([
    cardHandle !== null,
    menuButton !== null,
    cardHandle?.contains(menuButton ?? null),
    lengthSpan?.textContent,
    blank?.placeholder,
  ]).toEqual([
    true,
    true,
    false,
    "6 pp.",
    "Describe a chapter. It becomes a chapter when you write it.",
  ]);

  // Submitting BlankCard in manuscript format inserts a "chapter" block
  act(() => {
    blank!.focus();
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(blank, "A storm arrives.");
    blank!.dispatchEvent(new Event("input", { bubbles: true }));
    blank!.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  });
  act(() => {
    blank!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  const inserted = scriptBlocks(doc).at(-1);
  expect([inserted?.attrs?.type, inserted?.attrs?.synopsis]).toEqual([
    "chapter",
    "A storm arrives.",
  ]);
});
