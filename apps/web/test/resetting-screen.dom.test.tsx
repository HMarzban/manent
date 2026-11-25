import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { ControlState } from "../src/api.ts";
import {
  ResettingScreen,
  reloadAtHome,
  resetProgressPercent,
  useResetting,
} from "../src/demo/resetting-screen.tsx";
import { EnvironmentProvider } from "../src/services/context.tsx";
import { createShellDom } from "../src/shell/regions.tsx";
import { createClock, testEnvironment } from "./services.fixtures.ts";

withDom();

let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  document.body.replaceChildren();
});

function ResetProbe(props: {
  state: ControlState | null;
  seedId: string | null;
  onReload: () => void;
}): ReactNode {
  const { resetting, reseeded } = useResetting(
    props.state,
    props.seedId,
    props.onReload,
  );
  return (
    <div data-resetting={String(resetting)} data-reseeded={String(reseeded)}>
      {resetting ? <ResettingScreen reseeded={reseeded} /> : null}
    </div>
  );
}

test("reload at home replaces non-home paths with / and reloads cleanly when already on /", () => {
  const calls: string[] = [];
  const fake = (pathname: string, search = "", hash = "") => ({
    pathname,
    search,
    hash,
    reload: () => calls.push("reload"),
    replace: (url: string) => calls.push(`replace:${url}`),
  });

  reloadAtHome(fake("/s/old-doc-id"));
  reloadAtHome(fake("/", "?person=sam"));
  reloadAtHome(fake("/", "", "#scene-1"));
  reloadAtHome(fake("/"));

  expect(calls).toEqual(["replace:/", "replace:/", "replace:/", "reload"]);
});

test("reset progress rises smoothly towards 92% while resetting and reaches 100% once reseeded", () => {
  expect([
    resetProgressPercent(0, false),
    resetProgressPercent(6_000, false),
    resetProgressPercent(24_000, false),
    resetProgressPercent(120_000, false),
    resetProgressPercent(2_000, true),
  ]).toEqual([8, 41, 81, 92, 100]);
});

test("the resetting screen focuses its heading, advances its progress bar and navigates home once a new seed arrives", async () => {
  const clock = createClock();
  const environment = testEnvironment({
    now: clock.now,
    schedule: clock.schedule,
    dom: createShellDom(document),
  });
  const reloads: number[] = [];
  const container = document.createElement("div");
  document.body.append(container);
  mounted = createRoot(container);

  const draw = (state: ControlState | null, seedId: string | null) =>
    act(async () =>
      mounted?.render(
        <EnvironmentProvider environment={environment}>
          <ResetProbe
            state={state}
            seedId={seedId}
            onReload={() => reloads.push(reloads.length)}
          />
        </EnvironmentProvider>,
      ),
    );

  await draw("resetting", "seed-1");
  const heading = container.querySelector("h1");
  expect(heading?.textContent).toBe("Resetting the demo…");
  expect(document.activeElement).toBe(heading);

  const bar = container.querySelector<HTMLElement>("[role='progressbar']");
  expect(bar?.getAttribute("aria-label")).toBe("Resetting the demo…");
  expect(bar?.getAttribute("aria-valuenow")).toBe("8");

  act(() => clock.advance(6_000));
  expect(bar?.getAttribute("aria-valuenow")).toBe("41");
  expect(reloads).toEqual([]);

  // Same seed while running does not reload early
  await draw("running", "seed-1");
  expect(reloads).toEqual([]);

  // New seed snaps progress to 100% and triggers reloadAtHome
  await draw("running", "seed-2");
  expect(bar?.getAttribute("aria-valuenow")).toBe("100");
  expect(reloads).toEqual([0]);
});

test("a failed or unreachable reset ends the resetting screen without reloading", async () => {
  const clock = createClock();
  const environment = testEnvironment({
    now: clock.now,
    schedule: clock.schedule,
    dom: createShellDom(document),
  });
  const reloads: number[] = [];
  const container = document.createElement("div");
  document.body.append(container);
  mounted = createRoot(container);

  const draw = (state: ControlState | null, seedId: string | null) =>
    act(async () =>
      mounted?.render(
        <EnvironmentProvider environment={environment}>
          <ResetProbe
            state={state}
            seedId={seedId}
            onReload={() => reloads.push(reloads.length)}
          />
        </EnvironmentProvider>,
      ),
    );

  await draw("resetting", "seed-1");
  expect(container.querySelector("[data-resetting='true']")).not.toBe(null);

  await draw("failed", "seed-1");
  expect(container.querySelector("[data-resetting='false']")).not.toBe(null);
  expect(reloads).toEqual([]);
});
