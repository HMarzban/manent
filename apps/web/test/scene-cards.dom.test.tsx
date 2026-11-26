import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, mock, test } from "bun:test";
import { CommandsProvider, TimingProvider, createValue } from "@manent/ui";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { SceneCards } from "../src/scenes/cards.tsx";
import { useSceneExtras } from "../src/scenes/marks.tsx";
import type { SceneExtras, SceneParts } from "../src/scenes/marks.tsx";
import { useSceneMoves } from "../src/scenes/moves.ts";
import type { SceneMark } from "../src/screens/document/scene-marks.ts";
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

const MARKS = "../src/screens/document/scene-marks.ts";
const DOC_ID = "5d0c9a7e-2b4f-4c1a-9e3d-000000796f75";

const roots: Root[] = [];
afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  mock.module(MARKS, () => ({ SCENE_MARK_SOURCES: [] }));
});

const scene = (
  blockId: string,
  number: string,
  heading: string,
  current = false,
): OutlineRow => ({
  blockId,
  kind: "scene",
  number,
  heading,
  synopsis: "",
  eighths: null,
  omitted: false,
  current,
});

function createTestShell() {
  const clock = createClock();
  const environment = testEnvironment({
    storage: new MemoryStorage(),
    now: clock.now,
    schedule: clock.schedule,
    frame: (fn) => clock.schedule(fn, 16),
  });
  const services = testServices({ userId: "you", environment });
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

function MovesProbe(props: {
  rows: readonly OutlineRow[];
  seen: ReturnType<typeof useSceneMoves>[];
}): ReactNode {
  props.seen.push(useSceneMoves({ docId: DOC_ID, rows: props.rows }));
  return null;
}

function ExtrasProbe(props: { tick: number; seen: SceneExtras[] }): ReactNode {
  void props.tick;
  props.seen.push(useSceneExtras(DOC_ID));
  return null;
}

test("switching the active scene updates aria-current on cards and re-renders only the two affected cards", () => {
  const { clock, environment, services, outline, host, root } =
    createTestShell();
  const rows = [
    scene("s1", "1", "INT. KITCHEN", true),
    scene("s2", "2", "EXT. PIER"),
    scene("s3", "3", "INT. HALL"),
    scene("s4", "4", "EXT. ROAD"),
    scene("s5", "5", "INT. BOAT"),
  ];
  outline.writer.publish(rows);
  clock.advance(250);

  const rendered: string[] = [];
  const parts: SceneParts = {
    docId: DOC_ID,
    extras: {
      marks(blockId) {
        rendered.push(blockId);
        return [];
      },
      length: () => null,
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
              <SceneCards rows={rows} canEdit parts={parts} />
            </OutlineContext>
          </CommandsProvider>
        </ServicesProvider>
      </EnvironmentProvider>,
    ),
  );

  const before = [...host.querySelectorAll('.mn-card[role="group"]')].map(
    (card) => card.getAttribute("aria-current"),
  );
  rendered.length = 0;

  let rowNotifications = 0;
  const stop = outline.selectors.subscribe(() => {
    rowNotifications++;
  });
  act(() => outline.writer.publishCurrent("s4"));
  stop();

  const after = [...host.querySelectorAll('.mn-card[role="group"]')].map(
    (card) => card.getAttribute("aria-current"),
  );
  expect([before, after, rendered.toSorted(), rowNotifications]).toEqual([
    ["true", null, null, null, null],
    [null, null, null, "true", null],
    ["s1", "s4"],
    0,
  ]);
});

test("switching the active scene updates aria-current on list rows without notifying structural listeners", () => {
  const { clock, environment, services, outline, host, root } =
    createTestShell();
  const rows = [
    scene("s1", "1", "INT. KITCHEN", true),
    scene("s2", "2", "EXT. PIER"),
    scene("s3", "3", "INT. HALL"),
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

  const before = [...host.querySelectorAll(".mn-row")].map((row) =>
    row.getAttribute("aria-current"),
  );

  let rowNotifications = 0;
  const stop = outline.selectors.subscribe(() => {
    rowNotifications++;
  });
  act(() => outline.writer.publishCurrent("s3"));
  stop();

  const after = [...host.querySelectorAll(".mn-row")].map((row) =>
    row.getAttribute("aria-current"),
  );
  expect([before, after, rowNotifications]).toEqual([
    ["true", null, null],
    [null, null, "true"],
    0,
  ]);
});

test("scene moves keep sortable items and move handler stable when only current changes", () => {
  const { environment, services, root } = createTestShell();
  const seen: ReturnType<typeof useSceneMoves>[] = [];
  const first = [
    scene("s1", "1", "INT. KITCHEN", true),
    scene("s2", "2", "EXT. PIER", false),
  ];
  const second = [
    scene("s1", "1", "INT. KITCHEN", false),
    scene("s2", "2", "EXT. PIER", true),
  ];

  const renderProbe = (rows: readonly OutlineRow[]) => (
    <EnvironmentProvider environment={environment}>
      <ServicesProvider services={services}>
        <CommandsProvider
          service={services.commands}
          resolved={services.resolved}
          platform="mac"
        >
          <MovesProbe rows={rows} seen={seen} />
        </CommandsProvider>
      </ServicesProvider>
    </EnvironmentProvider>
  );

  act(() => root.render(renderProbe(first)));
  act(() => root.render(renderProbe(second)));

  expect([
    seen[0]?.sortable.items === seen[1]?.sortable.items,
    seen[0]?.sortable.onMove === seen[1]?.sortable.onMove,
  ]).toEqual([true, true]);
});

test("scene extras stay stable across unrelated renders and update when a mark source changes", () => {
  const source = createValue<ReadonlyMap<string, readonly SceneMark[]>>(
    new Map(),
  );
  mock.module(MARKS, () => ({ SCENE_MARK_SOURCES: [() => source] }));
  const { root } = createTestShell();
  const seen: SceneExtras[] = [];

  act(() => root.render(<ExtrasProbe tick={0} seen={seen} />));
  act(() => root.render(<ExtrasProbe tick={1} seen={seen} />));
  act(() => source.set(new Map([["s1", [{ kind: "revised" }]]])));

  expect([
    seen[0] === seen[1],
    seen[1] === seen[2],
    seen[2]?.marks("s1"),
  ]).toEqual([true, false, [{ kind: "revised" }]]);
});

test("a scene card edits its synopsis in place on Enter and cancels on Escape", () => {
  const { clock, environment, services, outline, host, root } =
    createTestShell();
  const actions: unknown[] = [];
  const origRun = services.editor.run.bind(services.editor);
  services.editor.run = (action) => {
    actions.push(action);
    return origRun(action);
  };
  const rows: OutlineRow[] = [
    {
      ...scene("s1", "1", "INT. KITCHEN", true),
      synopsis: "Old beat.",
    },
  ];
  outline.writer.publish(rows);
  clock.advance(250);

  const parts: SceneParts = {
    docId: DOC_ID,
    extras: { marks: () => [], length: () => "1 1/8" },
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
              <SceneCards rows={rows} canEdit parts={parts} />
            </OutlineContext>
          </CommandsProvider>
        </ServicesProvider>
      </EnvironmentProvider>,
    ),
  );

  const editButton = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Edit synopsis"]',
  );
  expect(editButton).not.toBeNull();
  act(() => {
    editButton!.click();
  });

  const input = host.querySelector<HTMLTextAreaElement>(
    "textarea[data-synopsis-input]",
  );
  expect(input?.value).toBe("Old beat.");

  // Escape cancels without committing
  act(() => {
    input!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect([
    host.querySelector("textarea[data-synopsis-input]"),
    actions,
  ]).toEqual([null, []]);

  // F2 re-opens inline edit and Enter commits the updated synopsis
  const card = host.querySelector<HTMLElement>('.mn-card[role="group"]');
  act(() => {
    card!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "F2", bubbles: true }),
    );
  });
  const reopened = host.querySelector<HTMLTextAreaElement>(
    "textarea[data-synopsis-input]",
  );
  expect(reopened).not.toBeNull();
  act(() => {
    reopened!.focus();
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(reopened, "New opening beat.");
    reopened!.dispatchEvent(new Event("input", { bubbles: true }));
    reopened!.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  });
  act(() => {
    reopened!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(actions).toEqual([
    { kind: "synopsis", blockId: "s1", text: "New opening beat." },
  ]);
});

test("the Scenes toolbar shows live counts, clears the filter and renders an empty-filter state", () => {
  const { clock, environment, services, outline, host, root } =
    createTestShell();
  const rows = [
    scene("s1", "1", "INT. KITCHEN", true),
    scene("s2", "2", "EXT. PIER"),
    scene("s3", "3", "INT. HALL"),
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

  const statusText = () =>
    host.querySelector('[aria-live="polite"]')?.textContent;
  expect(statusText()).toBe("3 scenes");

  const filterInput = host.querySelector<HTMLInputElement>(
    'input[type="search"]',
  );
  expect(filterInput).not.toBeNull();

  const setFilter = (value: string) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      filterInput!.focus();
      setter?.call(filterInput, value);
      filterInput!.dispatchEvent(new Event("input", { bubbles: true }));
      filterInput!.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    });
  };

  setFilter("pier");
  expect([
    statusText(),
    host.querySelector('button[aria-label="Clear filter"]') !== null,
  ]).toEqual(["1 of 3", true]);

  setFilter("lighthouse");
  expect([
    statusText(),
    host.textContent?.includes("No scenes match."),
  ]).toEqual(["0 of 3", true]);

  const clearButton = [
    ...host.querySelectorAll<HTMLButtonElement>("button"),
  ].find((btn) => btn.textContent === "Clear filter");
  expect(clearButton).not.toBeNull();
  act(() => {
    clearButton!.click();
  });
  expect([filterInput!.value, statusText()]).toEqual(["", "3 scenes"]);
});
