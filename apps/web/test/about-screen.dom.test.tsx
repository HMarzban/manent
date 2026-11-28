import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { ENGINE_VERSION } from "@manent/pagination";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { DesktopTitleBar } from "../src/desktop/desktop-title-bar.tsx";
import { answerShell } from "../src/desktop/shell-channel.ts";
import { AboutScreen } from "../src/screens/about/about-screen.tsx";
import { EnvironmentProvider } from "../src/services/context.tsx";
import { fakeHost } from "./desktop.fixtures.ts";
import { createClock, testEnvironment } from "./services.fixtures.ts";

withDom();

let mounted: Root | null = null;
let stopAnswering = (): void => {};

afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  stopAnswering();
  stopAnswering = (): void => {};
  document.body.replaceChildren();
  Reflect.deleteProperty(navigator, "clipboard");
});

function buttonNamed(root: ParentNode, text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text,
  );
  if (found === undefined) throw new RangeError(`no button ${text}`);
  return found;
}

test("AboutScreen shows Manent identity, version info, Copy info, update actions and closes on Escape", async () => {
  const clock = createClock(1_000);
  const host = fakeHost({
    platform: "mac",
    version: "0.2.0",
    channel: "canary",
  });
  const copied: string[] = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        copied.push(text);
      },
    },
  });
  const environment = testEnvironment({
    where: {
      platform: "mac",
      shell: "desktop",
      browser: "Chrome",
      system: "macOS",
    },
    desktop: host,
    now: clock.now,
    schedule: clock.schedule,
  });
  stopAnswering = answerShell({
    host,
    environment,
    pathname: () => "/about",
  });

  const container = document.createElement("div");
  document.body.append(container);
  mounted = createRoot(container);
  await act(async () => {
    mounted!.render(
      <EnvironmentProvider environment={environment}>
        <DesktopTitleBar bare pathname="/about" />
        <AboutScreen />
      </EnvironmentProvider>,
    );
  });

  expect(document.title).toBe("About Manent");
  expect(container.textContent).toContain("Manent");
  expect(container.textContent).toContain("Write anywhere. Lose nothing.");
  expect(container.textContent).toContain("0.2.0");
  expect(container.textContent).toContain("Canary");
  expect(container.textContent).toContain(String(ENGINE_VERSION));
  expect(container.textContent).toContain(".fdx, .fountain, .ink, .docx");
  expect(container.textContent).toContain("Manent sends no usage data.");

  await act(async () => {
    buttonNamed(container, "Copy details").click();
  });
  expect(copied).toEqual([
    `Manent 0.2.0 (Canary) · Layout engine ${ENGINE_VERSION} · macOS`,
  ]);
  expect(container.textContent).toContain("Copied");

  act(() => buttonNamed(container, "Check for updates").click());
  expect(host.sent).toContainEqual({ v: 1, t: "check_for_updates" });

  act(() => host.emit({ v: 1, t: "update_state", state: "ready" }));
  act(() => buttonNamed(container, "Restart to update").click());
  expect(host.sent).toContainEqual({ v: 1, t: "restart_to_update" });

  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(host.sent).toContainEqual({
    v: 1,
    t: "window_action",
    action: "close",
    windowKey: "about",
  });
});
