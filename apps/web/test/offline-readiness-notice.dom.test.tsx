import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { createValue } from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type {
  OfflineReadinessPort,
  OfflineReadinessState,
} from "../src/boot/offline-warm.ts";
import { OfflineReadinessNotice } from "../src/pwa/offline-readiness-notice.tsx";
import { StudioFooter } from "../src/screens/choose/studio-footer.tsx";
import { EnvironmentProvider } from "../src/services/context.tsx";
import { fakeHost } from "./desktop.fixtures.ts";
import { createClock, testEnvironment } from "./services.fixtures.ts";

withDom();

let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  document.body.replaceChildren();
});

function createFakeReadiness(
  initial: OfflineReadinessState,
  initialActive = false,
): {
  port: OfflineReadinessPort;
  set(next: OfflineReadinessState, active?: boolean): void;
} {
  let activeInSession = initialActive;
  const value = createValue<OfflineReadinessState>(initial);
  return {
    port: {
      get: value.get,
      subscribe: value.subscribe,
      warmNow: () => {},
      wasActiveInSession: () => activeInSession,
    },
    set(next, active) {
      if (active !== undefined) activeInSession = active;
      else if (next.status === "installing" || next.status === "warming")
        activeInSession = true;
      value.set(next);
    },
  };
}

function mountNotice(options: {
  readiness?: OfflineReadinessPort;
  clock?: ReturnType<typeof createClock>;
  inShell?: boolean;
  suppressed?: boolean;
  desktop?: boolean;
}): HTMLDivElement {
  const clock = options.clock ?? createClock(10_000);
  const environment = testEnvironment({
    now: clock.now,
    schedule: clock.schedule,
    where: {
      platform: "mac",
      shell: options.desktop ? "desktop" : "web",
      browser: "Chrome",
      system: "macOS",
    },
    desktop: options.desktop ? fakeHost() : null,
    offlineReadiness: options.readiness,
  });
  const container = document.createElement("div");
  document.body.append(container);
  mounted = createRoot(container);
  act(() => {
    mounted?.render(
      <EnvironmentProvider environment={environment}>
        <OfflineReadinessNotice
          inShell={options.inShell ?? false}
          suppressed={options.suppressed ?? false}
        />
      </EnvironmentProvider>,
    );
  });
  return container;
}

test("stays completely silent on returning visits that jump directly to ready, and on desktop", () => {
  const clock = createClock(10_000);
  const returning = createFakeReadiness({
    status: "idle",
    cached: 0,
    total: 0,
  });
  const container = mountNotice({ readiness: returning.port, clock });
  act(() => {
    returning.set({ status: "ready", cached: 5, total: 5 }, false);
    clock.advance(1_000);
  });
  expect(container.querySelector("aside")).toBeNull();
  expect(container.querySelector('[role="status"]')?.textContent).toBe("");

  act(() => mounted?.unmount());
  mounted = null;

  const desktopReadiness = createFakeReadiness(
    { status: "warming", cached: 1, total: 5 },
    true,
  );
  const desktopContainer = mountNotice({
    readiness: desktopReadiness.port,
    clock,
    desktop: true,
  });
  act(() => clock.advance(1_000));
  expect(desktopContainer.querySelector("aside")).toBeNull();
});

test("shows progress after quiet guard, morphs to Ready offline after dwell, pauses on hover, and auto-dismisses", () => {
  const clock = createClock(10_000);
  const fake = createFakeReadiness({ status: "idle", cached: 0, total: 0 });
  const container = mountNotice({ readiness: fake.port, clock, inShell: true });
  const live = (): string =>
    container.querySelector('[role="status"]')?.textContent ?? "";

  // Enters installing -> quiet for 249ms, visible at 250ms
  act(() => fake.set({ status: "installing", cached: 0, total: 0 }));
  act(() => clock.advance(249));
  expect(container.querySelector("aside")).toBeNull();

  act(() => clock.advance(1));
  const aside = (): HTMLElement | null => container.querySelector("aside");
  expect(aside()?.getAttribute("data-state")).toBe("preparing");
  expect(aside()?.textContent).toContain("Preparing for offline use…");
  expect(live()).toBe(
    "Preparing Manent for offline use. You can keep working.",
  );

  // Live Tier-2 warming progress updates visually without spamming SR live region
  act(() => fake.set({ status: "warming", cached: 2, total: 5 }));
  expect(aside()?.textContent).toContain("2 of 5 ready");
  expect(live()).toBe(
    "Preparing Manent for offline use. You can keep working.",
  );

  // Ready arrives before 600ms minimum dwell -> stays preparing until dwell elapses
  act(() => clock.advance(200));
  act(() => fake.set({ status: "ready", cached: 5, total: 5 }));
  expect(aside()?.getAttribute("data-state")).toBe("preparing");

  act(() => clock.advance(400));
  expect(aside()?.getAttribute("data-state")).toBe("ready");
  expect(aside()?.textContent).toContain("Ready offline");
  expect(aside()?.textContent).toContain(
    "Manent now works without a connection.",
  );
  expect(live()).toBe("Ready offline — Manent now works without a connection.");

  // Hover pauses auto-dismiss even past 5000ms
  act(() => {
    aside()?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
  act(() => {
    clock.advance(6_000);
  });
  expect(aside()?.getAttribute("data-leaving")).toBeNull();

  // Leaving resumes with grace floor, then fades out and unmounts
  act(() => {
    aside()?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
  });
  act(() => {
    clock.advance(5_000);
  });
  expect(aside()?.getAttribute("data-leaving")).toBe("true");
  act(() => clock.advance(160));
  expect(aside() === null).toBe(true);
});

test("dismiss button and local Escape close the notice cleanly", () => {
  const clock = createClock(10_000);
  const fake = createFakeReadiness(
    { status: "warming", cached: 1, total: 4 },
    true,
  );
  const container = mountNotice({ readiness: fake.port, clock });
  act(() => clock.advance(250));
  expect(container.querySelector("aside")).not.toBeNull();

  const closeBtn = container.querySelector<HTMLButtonElement>("aside button")!;
  act(() => {
    closeBtn.click();
    clock.advance(160);
  });
  expect(container.querySelector("aside")).toBeNull();

  // Does not reappear in the same session after manual dismiss
  act(() => {
    fake.set({ status: "ready", cached: 4, total: 4 });
    clock.advance(1_000);
  });
  expect(container.querySelector("aside")).toBeNull();
});

test("StudioFooter PWA card reflects live offline warming and ready states", () => {
  const fake = createFakeReadiness(
    { status: "warming", cached: 3, total: 6 },
    true,
  );
  const environment = testEnvironment({ offlineReadiness: fake.port });
  const container = document.createElement("div");
  document.body.append(container);
  mounted = createRoot(container);
  act(() => {
    mounted?.render(
      <EnvironmentProvider environment={environment}>
        <StudioFooter />
      </EnvironmentProvider>,
    );
  });

  expect(container.textContent).toContain("Preparing for offline use…");
  expect(container.textContent).toContain("3 of 6 ready");
  expect(container.querySelector(".mn-progress-track")).not.toBeNull();

  act(() => fake.set({ status: "ready", cached: 6, total: 6 }));
  expect(container.textContent).toContain("Ready offline");
  expect(container.textContent).toContain("Ready — opens without a connection");
  expect(container.querySelector(".mn-progress-track")).toBeNull();

  act(() => fake.set({ status: "online_only", cached: 0, total: 0 }, false));
  expect(container.textContent).toContain("Online only in this browser");
});
