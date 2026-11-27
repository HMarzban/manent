import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import {
  PRESENT_WORDS,
  PROMPTER_CONTROL_WORDS,
  PROMPTER_WINDOW_WORDS,
  TimingProvider,
} from "@manent/ui";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { PrompterBar } from "../src/screens/present/prompter/prompter-bar.tsx";
import { PrompterReading } from "../src/screens/present/prompter/prompter-reading.tsx";
import { PresentHud } from "../src/screens/present/room/present-hud.tsx";
import { createClock } from "./services.fixtures.ts";

withDom();

let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  document.body.replaceChildren();
});

async function mountRouter(element: React.ReactNode): Promise<HTMLElement> {
  const container = document.body.appendChild(document.createElement("div"));
  const rootRoute = createRootRoute({ component: () => element });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  mounted = createRoot(container);
  act(() => mounted?.render(<RouterProvider router={router} />));
  return container;
}

test("PresentHud renders full-opacity header with Previous/Next scene steppers", async () => {
  const jumps: string[] = [];
  const host = await mountRouter(
    <PresentHud
      docId="doc-1"
      title="Low Tide"
      driver={null}
      driverColour={null}
      currentScene={2}
      totalScenes={5}
      onPrevScene={() => jumps.push("prev")}
      onNextScene={() => jumps.push("next")}
    />,
  );
  const header = host.querySelector("header")!;
  expect(header.className).not.toContain("opacity-85");
  expect(header.className).toContain("flex-wrap");
  expect(header.textContent).toContain(PRESENT_WORDS.sceneProgress(2, 5));

  const prevBtn = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${PRESENT_WORDS.previousScene}"]`,
  )!;
  const nextBtn = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${PRESENT_WORDS.nextScene}"]`,
  )!;
  act(() => prevBtn.click());
  act(() => nextBtn.click());
  expect(jumps).toEqual(["prev", "next"]);
});

test("PrompterBar shows live remote playback pill for passive viewers and wraps cleanly", () => {
  const container = document.body.appendChild(document.createElement("div"));
  mounted = createRoot(container);
  act(() =>
    mounted?.render(
      <PrompterBar
        status={{ kind: "live" }}
        view={{ v: 1, textSize: 48, dark: true, mirror: false }}
        operator={{
          userId: "u-1",
          name: "Priya",
          deviceId: "d-1",
          since: 1000,
          expiresAt: 60_000,
        }}
        scroll={{
          seq: 2,
          playing: true,
          linesPerSecond: 2.5,
          rowId: "r-1",
          lineOffset: 0,
          updatedAt: 1000,
          operatorUserId: "u-1",
          operatorDeviceId: "d-1",
        }}
        onTextSizeChange={() => {}}
        onDarkChange={() => {}}
        onMirrorChange={() => {}}
      />,
    ),
  );
  const header = container.querySelector("header")!;
  expect(header.className).toContain("flex-wrap");
  expect(header.textContent).toContain(PROMPTER_CONTROL_WORDS.playingAt(2.5));
});

test("PrompterReading flips eye-line guide to right edge when mirrored and puts opening status outside aria-busy", () => {
  const clock = createClock();
  const container = document.body.appendChild(document.createElement("div"));
  mounted = createRoot(container);
  act(() =>
    mounted?.render(
      <TimingProvider timing={{ now: clock.now, schedule: clock.schedule }}>
        <PrompterReading
          surfaceState={{ kind: "ready" }}
          stories={[
            {
              rowId: "row-1",
              blocks: [
                {
                  key: "row-1:0",
                  rowId: "row-1",
                  kind: "dialogue",
                  text: "Good evening.",
                },
              ],
            },
          ]}
          textSize={48}
          mirror={true}
        />
      </TimingProvider>,
    ),
  );
  const guide = container.querySelector(".mn-prompter-guide")!;
  expect(guide.className).toContain("justify-end");

  act(() => {
    mounted?.render(
      <TimingProvider timing={{ now: clock.now, schedule: clock.schedule }}>
        <PrompterReading
          surfaceState={{ kind: "loading", sinceMs: 0 }}
          stories={[]}
          textSize={48}
          mirror={false}
        />
      </TimingProvider>,
    );
  });
  act(() => {
    clock.advance(500);
  });
  const status = container.querySelector('p[role="status"]')!;
  expect(status.textContent).toBe(PROMPTER_WINDOW_WORDS.opening);
  expect(status.closest('[aria-busy="true"]')).toBeNull();
});
