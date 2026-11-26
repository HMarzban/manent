import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, mock, test } from "bun:test";
import { CommandsProvider, TimingProvider } from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { GhostFollowBar } from "../src/scenes/ghost-follow-bar.tsx";
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
  eighths: 4,
  omitted: false,
  current,
});

function createShell() {
  const clock = createClock();
  const environment = testEnvironment({
    storage: new MemoryStorage(),
    now: clock.now,
    schedule: clock.schedule,
    frame: (fn) => clock.schedule(fn, 16),
  });
  const ran: unknown[] = [];
  const base = testServices({ userId: "you", environment });
  const services = {
    ...base,
    editor: {
      ...base.editor,
      run: (request: unknown) => {
        ran.push(request);
        return null;
      },
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
  return { clock, environment, services, outline, host, root, ran };
}

test("createOutlineStore notifies only viewed subscribers when publishViewed changes", () => {
  const { clock, outline } = createShell();
  let rowCalls = 0;
  let currentCalls = 0;
  let viewedCalls = 0;
  outline.selectors.subscribe(() => rowCalls++);
  outline.selectors.subscribeCurrent(() => currentCalls++);
  outline.selectors.subscribeViewed?.(() => viewedCalls++);

  outline.writer.publish([
    scene("s1", "1", "INT. A - DAY", true),
    scene("s2", "2", "EXT. B - NIGHT"),
  ]);
  clock.advance(250);
  const afterRows = [rowCalls, currentCalls, viewedCalls];

  outline.writer.publishViewed?.("s2");
  outline.writer.publishViewed?.("s2");
  expect([
    afterRows,
    [rowCalls, currentCalls, viewedCalls],
    outline.selectors.viewedBlockId?.() ?? null,
  ]).toEqual([[1, 1, 0], [1, 1, 1], "s2"]);
});

test("Scenes list marks the scrolled scene with data-viewed and shows GhostFollowBar with Back to caret", () => {
  mock.module(MARKS, () => ({ SCENE_MARK_SOURCES: [] }));
  const { clock, environment, services, outline, host, root, ran } =
    createShell();
  const rows = [
    scene("s1", "1", "INT. CAFE - DAY", true),
    scene("s2", "27", "INT. LIFT SHAFT - NIGHT"),
  ];
  outline.writer.publish(rows);
  clock.advance(250);
  const { Tab } = scenesTab;
  act(() => {
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
    );
  });

  // while viewing the same scene as the caret, no ghost indicator or strip appears
  act(() => outline.writer.publishViewed?.("s1"));
  const sameScene = [
    host.querySelectorAll('[data-viewed="true"]').length,
    host.querySelector("[data-ghost-follow]"),
  ];

  // scrolling to scene 27 marks only scene 27 as data-viewed and shows the strip
  act(() => outline.writer.publishViewed?.("s2"));
  const viewedRows = [...host.querySelectorAll('[data-viewed="true"]')].map(
    (node) => node.textContent,
  );
  const strip = host.querySelector<HTMLElement>("[data-ghost-follow]");
  const backButton = strip?.querySelector<HTMLButtonElement>("button");
  act(() => backButton?.click());

  expect([
    sameScene,
    viewedRows.length,
    host.querySelectorAll('[data-row-menu][data-menu-reveal="hover"]').length,
    strip?.textContent?.includes("Viewing Sc. 27") ?? false,
    backButton?.textContent ?? null,
    ran,
  ]).toEqual([
    [0, null],
    1,
    2,
    true,
    "Back to Sc. 1",
    [{ kind: "go_to", blockId: "s1", offset: 0 }],
  ]);
});

test("GhostFollowBar stays hidden when viewed matches current or is null", () => {
  const { environment, services, outline, host, root } = createShell();
  const rows = [
    scene("s1", "1", "INT. CAFE - DAY", true),
    scene("s2", "2", "EXT. ROAD - NIGHT"),
  ];
  outline.writer.publish(rows);
  act(() => {
    root.render(
      <EnvironmentProvider environment={environment}>
        <ServicesProvider services={services}>
          <OutlineContext value={outline.selectors}>
            <GhostFollowBar rows={rows} />
          </OutlineContext>
        </ServicesProvider>
      </EnvironmentProvider>,
    );
  });
  expect(host.querySelector("[data-ghost-follow]")).toBeNull();
});
