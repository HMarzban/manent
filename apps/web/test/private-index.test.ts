import { expect, test } from "bun:test";
import { entryKey } from "@manent/settings";
import { memoryTabs } from "@manent/sync-client/testing";
import { firstRunPath } from "../src/router.tsx";
import { DANA, SAM, createIndexWorld } from "./index.fixtures.ts";
import type { TabServices } from "./index.fixtures.ts";
import { MemoryStorage } from "./services.fixtures.ts";
import { until } from "./sync.fixtures.ts";

const YOU = Object.freeze({ token: null, userId: "you", name: "You" });

/** The address a first launch of the Library opens, or null. */
const firstRunTarget = (services: TabServices): Promise<string | null> =>
  firstRunPath(services);

const theme = (services: TabServices): unknown =>
  services.settings.get("appearance.theme");

test("preferences live in the person's private index and reach their other tab", async () => {
  const w = await createIndexWorld();
  const tabs = memoryTabs();
  const storage = new MemoryStorage();
  const first = await w.personServices({
    person: SAM,
    leader: tabs.port("a"),
    storage,
  });
  const second = await w.personServices({
    person: SAM,
    leader: tabs.port("b"),
    storage,
  });
  const dana = await w.personServices({ person: DANA });
  await w.settleAll();
  expect(first.settings.set("appearance.theme", "dark")).toEqual({ ok: true });
  await w.settleAll();
  await until(() => theme(second) === "dark");
  expect([theme(first), theme(second), theme(dana)]).toEqual([
    "dark",
    "dark",
    "system",
  ]);
  expect(storage.getItem("manent.prefs.sam")).toBeNull();
});

test("preferences set before this build moved them are carried over once", async () => {
  const w = await createIndexWorld();
  const storage = new MemoryStorage();
  storage.setItem("manent.device.id", "d1");
  const before = await w.personServices({ person: SAM, storage });
  await w.settleAll();
  before.settings.set("appearance.theme", "light");
  await w.settleAll();
  const kept = {
    [entryKey("appearance.theme", "d1")]: {
      v: "dark",
      at: 5,
      on: "Mac",
      unset: false,
    },
    [entryKey("appearance.whitePage", "d1")]: {
      v: true,
      at: 5,
      on: "Mac",
      unset: false,
    },
  };
  storage.setItem("manent.prefs.sam", JSON.stringify(kept));
  storage.setItem(
    "manent.keys.sam",
    JSON.stringify({ [entryKey("app.palette", "d1")]: { v: ["Mod+K"] } }),
  );
  const after = await w.personServices({ person: SAM, storage });
  await w.settleAll();
  await until(() => after.settings.get("appearance.whitePage") === true);
  expect([
    theme(after),
    after.settings.get("appearance.whitePage"),
    after.keys.get(entryKey("app.palette", "d1")),
    storage.getItem("manent.prefs.sam"),
    storage.getItem("manent.keys.sam"),
  ]).toEqual(["light", true, { v: ["Mod+K"] }, null, null]);
  after.settings.set("appearance.whitePage", false);
  await w.settleAll();
  const again = await w.personServices({ person: SAM, storage });
  await w.settleAll();
  await until(() => again.settings.get("appearance.whitePage") === false);
  expect(theme(again)).toBe("light");
});

test("what is set before the private index opens is kept when the page is hidden, and carried over at the next open", async () => {
  const w = await createIndexWorld();
  const storage = new MemoryStorage();
  storage.setItem("manent.device.id", "d1");
  const palette = entryKey("app.palette", "d1");
  // this device's store never finishes a write, so the private index never opens on it
  w.space("held").store("sam").holdWrites();
  const unopened = await w.personServices({
    person: SAM,
    storage,
    device: "held",
  });
  unopened.settings.set("appearance.theme", "dark");
  unopened.keys.set(palette, { v: ["Mod+J"] });
  globalThis.dispatchEvent(new Event("pagehide"));
  unopened.dispose();
  const next = await w.personServices({ person: SAM, storage });
  await next.ready;
  expect([
    theme(next),
    next.keys.get(palette),
    storage.getItem("manent.prefs.sam"),
    storage.getItem("manent.keys.sam"),
  ]).toEqual(["dark", { v: ["Mod+J"] }, null, null]);
  next.dispose();
});

test("You's first run opens a blank page, and You's work stays on the device", async () => {
  const { personServices, serverContacts } = await createIndexWorld();
  const you = await personServices({ person: YOU });
  expect(await firstRunTarget(you)).toMatch(new RegExp("^/s/[0-9a-f-]{36}$"));
  expect(serverContacts()).toBe(0);
  expect((await you.sync.client.documents()).every((d) => d.neverSynced)).toBe(
    true,
  );
  const reloaded = await personServices({ person: YOU });
  expect(await firstRunTarget(reloaded)).toBeNull();
});
