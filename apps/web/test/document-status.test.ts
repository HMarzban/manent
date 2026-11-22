import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { createValue } from "@manent/ui";
import type { StatusFacts, Subscribable } from "@manent/ui";
import { createStatusWriter } from "../src/screens/document/status-writer.ts";
import { createClock } from "./services.fixtures.ts";

withDom();

const SYNCED: StatusFacts = {
  access: "edit",
  device: "ok",
  network: "online",
  server: "synced",
  waiting: 0,
  notSent: 0,
  offlineSinceAt: null,
  neverSynced: false,
  shell: "web",
  toReview: 0,
  now: 0,
};

const facts = (patch: Partial<StatusFacts>): StatusFacts => ({
  ...SYNCED,
  ...patch,
});

/** A writer over two fresh text nodes in a fresh root; `text` reads the two slots as the status shows them, and `nodes` are the two. */
function writer(
  clock: ReturnType<typeof createClock>,
  source: Subscribable<StatusFacts>,
): { text(): string; root: HTMLElement; nodes: readonly Text[] } {
  const device = document.createTextNode("");
  const server = document.createTextNode("");
  const root = document.createElement("span");
  createStatusWriter({
    device,
    server,
    root,
    source,
    now: clock.now,
    schedule: clock.schedule,
  });
  return {
    text: () => `${device.data} · ${server.data}`,
    root,
    nodes: [device, server],
  };
}

test("Synced is shown only after two seconds with nothing waiting, and Syncing at once", () => {
  const clock = createClock();
  const src = createValue(facts({ server: "syncing", waiting: 1 }));
  const { text } = writer(clock, src);
  expect(text()).toBe("Saved · Syncing…");
  src.set(facts({ server: "synced", waiting: 0 }));
  expect(text()).toBe("Saved · Syncing…");
  clock.advance(1_999);
  expect(text()).toBe("Saved · Syncing…");
  clock.advance(1);
  expect(text()).toBe("Saved · Synced");
  src.set(facts({ server: "syncing", waiting: 1 }));
  expect(text()).toBe("Saved · Syncing…");
});

test("the status is a live region only in the alert state", () => {
  const clock = createClock();
  const src = createValue(facts({ device: "failing" }));
  const { root } = writer(clock, src);
  const read = (): [string | null, string | undefined, boolean] => [
    root.getAttribute("role"),
    root.dataset.tone,
    root.hasAttribute("data-spans"),
  ];
  const seen = [read()];
  src.set(facts({ device: "failing", network: "offline" }));
  seen.push(read());
  src.set(facts({ access: "view" }));
  seen.push(read());
  src.set(facts({ network: "offline", waiting: 3 }));
  seen.push(read());
  src.set(facts({}));
  clock.advance(2_000);
  seen.push(read());
  expect(seen).toEqual([
    ["alert", "alert", false],
    ["alert", "alert", true],
    [null, "normal", true],
    [null, "normal", false],
    [null, "quiet", false],
  ]);
});

test("a change of facts that keeps the words writes nothing into the page", () => {
  const clock = createClock();
  const src = createValue(facts({ server: "syncing", waiting: 1 }));
  const { text, root, nodes } = writer(clock, src);
  const observer = new MutationObserver(() => {});
  for (const node of nodes) observer.observe(node, { characterData: true });
  observer.observe(root, { attributes: true });
  src.set(facts({ server: "syncing", waiting: 2 }));
  expect(observer.takeRecords().map((record) => record.type)).toEqual([]);
  src.set(facts({ network: "offline", waiting: 2 }));
  expect(text()).toBe("Saved · Offline, 2 waiting");
});
