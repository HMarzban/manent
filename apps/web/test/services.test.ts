import { expect, test } from "bun:test";
import type { SideTab } from "@manent/commands";
import { createDoc } from "@manent/crdt";
import { StoreError } from "@manent/sync-client";
import { createFaultyStoreSpace } from "@manent/sync-client/testing";
import { statusText } from "@manent/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRemoteDeferral } from "../src/services/remote-deferral.ts";
import { SidePosition } from "../src/shell/side-position.tsx";
import type { PanelTab } from "../src/shell/panel-tab.ts";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import { panelsActions } from "../src/state/panels.store.ts";
import { productionContextActions } from "../src/state/production-context.store.ts";
import {
  FullStorage,
  MemoryStorage,
  RefusingStorage,
  createClock,
  createNavigation,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";
import {
  fakeClient,
  fakeHandle,
  fakeSync,
  turn,
  until,
} from "./sync.fixtures.ts";

bindGuard(createGuard({ flavour: "test" }));

test("the device bag and the device id use their fixed keys", () => {
  const storage = new MemoryStorage();
  const environment = testEnvironment({ storage, randomId: () => "d1" });
  const services = testServices({ userId: "leo", environment });
  expect(services.settings.set("device.interfaceSize", "150")).toEqual({
    ok: true,
  });
  expect(storage.getItem("manent.device.leo")).toBe(
    '{"device.interfaceSize":"150"}',
  );
  expect(storage.getItem("manent.device.id")).toBe("d1");
  testServices({
    userId: "leo",
    environment: testEnvironment({ storage, randomId: () => "d2" }),
  });
  expect(storage.getItem("manent.device.id")).toBe("d1");
});

test("the last Preferences pane uses its fixed key, and the shortcuts and the flags are kept in the private index alone", () => {
  const storage = new MemoryStorage();
  const services = testServices({
    userId: "leo",
    environment: testEnvironment({ storage }),
  });
  services.keys.set("app.palette|d1", { v: ["Mod+K"] });
  services.flags.set("tour_seen");
  services.lastPane.set("keyboard");
  expect([
    services.keys.get("app.palette|d1"),
    services.flags.has("tour_seen"),
    storage.getItem("manent.keys.leo"),
    storage.getItem("manent.flags.leo"),
    storage.getItem("manent.prefs.last-pane.leo"),
  ]).toEqual([{ v: ["Mod+K"] }, true, null, null, "keyboard"]);
});

test("a flag once set stays set for the person, and for no one else", async () => {
  const stores = createFaultyStoreSpace();
  const tab = async (userId: string) => {
    const services = testServices({
      userId,
      environment: testEnvironment({}, stores),
    });
    await services.ready;
    return services;
  };
  const first = await tab("leo");
  const unset = first.flags.has("tour_seen");
  first.flags.set("tour_seen");
  first.flags.set("tour_seen");
  expect([
    unset,
    first.flags.has("tour_seen"),
    (await tab("leo")).flags.has("tour_seen"),
    (await tab("dana")).flags.has("tour_seen"),
  ]).toEqual([false, true, true, false]);
});

test("a device bag over refusing storage keeps values for the session", () => {
  const kept = testServices({ userId: "leo" });
  expect(kept.persisted).toBe(true);
  const environment = testEnvironment({ storage: new RefusingStorage() });
  const services = testServices({ userId: "leo", environment });
  expect(services.settings.set("device.interfaceSize", "200")).toEqual({
    ok: true,
  });
  expect(services.settings.get("device.interfaceSize")).toBe("200");
  expect(services.persisted).toBe(false);
  const full = testServices({
    userId: "leo",
    environment: testEnvironment({ storage: new FullStorage() }),
  });
  expect(full.persisted).toBe(true);
  full.settings.set("device.interfaceSize", "125");
  expect(full.settings.get("device.interfaceSize")).toBe("125");
  expect(full.persisted).toBe(false);
});

test("a remote change is applied at the next five-second pause after the last key", () => {
  const clock = createClock(3000);
  let lastKeyAt: number | null = 1000;
  const defer = createRemoteDeferral({
    now: clock.now,
    schedule: clock.schedule,
    lastKeyAt: () => lastKeyAt,
  });
  const applied: number[] = [];
  defer(() => applied.push(clock.now()));
  clock.advance(2000);
  lastKeyAt = 5000;
  clock.advance(4999);
  expect(applied).toEqual([]);
  clock.advance(1);
  expect(applied).toEqual([10_000]);
  lastKeyAt = null;
  defer(() => applied.push(clock.now()));
  expect(applied).toEqual([10_000, 10_000]);
});

test("New script makes an untitled film whose script, once opened, is first in Continue", async () => {
  const route = createNavigation({ routeId: "/", href: "/", search: {} });
  const environment = testEnvironment({ language: "en-GB" });
  environment.shellState.set({
    ...environment.shellState.get(),
    screen: "library",
  });
  const services = testServices({
    userId: "leo",
    environment,
    router: route.navigation,
  });
  const opened = route.next();
  expect(services.commands.run("library.newScript", "control")).toBe("ran");
  const docId = (await opened).slice("/s/".length);
  services.documents.open(docId);
  const continued = services.library.continueList("leo");
  await until(() => continued.get().length === 1);
  expect(continued.get()).toEqual([
    {
      docId,
      title: "Untitled script",
      projectTitle: "Untitled film",
      kind: "film",
      place: { kind: "never_synced" },
    },
  ]);
  expect(services.library.projects("leo").get()).toEqual([
    {
      projectId: expect.any(String),
      title: "Untitled film",
      kind: "film",
      firstDocId: docId,
      lastEdited: null,
      place: { kind: "never_synced" },
    },
  ]);
  const title = services.library.documentTitle(docId);
  const kind = services.library.documentKind(docId);
  await until(() => kind.get() !== null);
  expect([title.get(), kind.get()]).toEqual(["Untitled script", "film"]);
  // the script's settings are its handle's, which opens from the device a moment later
  const script = services.openScriptStore(docId);
  await until(() => script.get("script.paper") === "a4");
  expect(script.get("script.paper")).toBe("a4");
});

test("a sync that cannot start never says a document is saved", async () => {
  const services = testServices({
    userId: "leo",
    environment: testEnvironment({
      startSync: () => Promise.reject(new StoreError("unavailable")),
    }),
  });
  const { status } = services.documents.open(
    "0b9f6c2e-3c1a-4c55-9a43-5d8f1e2a7b10",
  );
  await until(() => status.get().device === "failing");
  const { device, server } = statusText(status.get());
  services.dispose();
  await turn();
  expect([device, server]).toEqual([
    "Not saved on this device",
    "Only in this browser — not backed up",
  ]);
});

test("the person's sync ends with the services", async () => {
  let disposed = 0;
  const services = testServices({
    userId: "leo",
    environment: testEnvironment({
      startSync: async () => ({
        ...fakeSync(fakeClient(() => fakeHandle("d1", createDoc()))),
        dispose: async () => {
          disposed += 1;
        },
      }),
    }),
  });
  await turn();
  const before = disposed;
  services.dispose();
  await turn();
  expect([before, disposed]).toEqual([0, 1]);
});

test("New script on a device that cannot hold it still opens the script, whose status says it is not saved", async () => {
  const route = createNavigation({ routeId: "/", href: "/", search: {} });
  const services = testServices({
    userId: "leo",
    environment: testEnvironment({
      startSync: () => Promise.reject(new StoreError("unavailable")),
    }),
    router: route.navigation,
  });
  const opened = route.next();
  expect(services.commands.run("library.newScript", "control")).toBe("ran");
  const docId = (await opened).slice("/s/".length);
  const { status } = services.documents.open(docId);
  await until(() => status.get().device === "failing");
  const { device } = statusText(status.get());
  services.dispose();
  await turn();
  expect([docId, device]).toEqual(["id-3", "Not saved on this device"]);
});

test("a script's layout waits for authority once its page numbers are locked", () => {
  const services = testServices({ userId: "leo" });
  const docId = "0b9f6c2e-3c1a-4c55-9a43-5d8f1e2a7b10";
  const store = services.openScriptStore(docId);
  expect(store).toBe(services.openScriptStore(docId));
  expect(store.set("script.paper", "a4")).toEqual({ ok: true });
  productionContextActions.set(docId, {
    locked: true,
    canLock: false,
    canIssue: true,
    recallOpen: false,
    waiting: 0,
    activeName: "Pink",
    recallName: null,
    selection: null,
  });
  expect(store.set("script.paper", "letter")).toMatchObject({
    ok: false,
    reason: "needs_authority",
  });
  productionContextActions.set(docId, null);
  expect(productionContextActions.get(docId)).toBeNull();
});

test("a closed document's settings store no longer hears the person's preferences", () => {
  const services = testServices({ userId: "leo" });
  const docId = "0b9f6c2e-3c1a-4c55-9a43-5d8f1e2a7b10";
  const heard: string[] = [];
  for (const visit of ["first", "second", "third"]) {
    services.documents.open(docId);
    services
      .openScriptStore(docId)
      .subscribe("appearance.theme", () => heard.push(visit));
    if (visit !== "third") services.documents.close(docId);
  }
  services.settings.set("appearance.theme", "dark");
  expect(heard).toEqual(["third"]);
});

const fixtureTab = (id: string, present: boolean): PanelTab<SideTab> => ({
  // the four tabs past the limit need ids the side panel does not have yet
  id: id as SideTab,
  useTab: () => ({ present, label: `Tab ${id}` }),
  Tab: () => `body of ${id}`,
});

const draw = (tabs: readonly PanelTab<SideTab>[]): string =>
  renderToStaticMarkup(createElement(SidePosition, { docId: null, tabs }));

test("the side position draws only the tabs that are present, in list order, and refuses one past the limit", () => {
  panelsActions.open("side", "tour");
  const html = draw([
    fixtureTab("history", true),
    fixtureTab("details", false),
    fixtureTab("tour", true),
  ]);
  expect([...html.matchAll(/>Tab (\w+)</g)].map((m) => m[1])).toEqual([
    "history",
    "tour",
  ]);
  expect(html).toContain("body of tour");
  expect(html).not.toContain("body of history");
  const four = ["history", "details", "comments", "notes"];
  expect(() => draw(four.map((id) => fixtureTab(id, true)))).toThrow(
    RangeError,
  );
  expect(
    draw([...four.slice(0, 3), "tour"].map((id) => fixtureTab(id, true))),
  ).toContain("Tab tour");
});
