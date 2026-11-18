import { expect, test } from "bun:test";
import * as Y from "yjs";
import {
  ORIGIN_SYSTEM,
  applyInspecting,
  loadDoc,
  scriptBody,
  scriptSettings,
} from "../src/index.ts";
import type { CrdtDoc } from "../src/index.ts";
import { SAMPLE, capture, twoReplicasOf } from "./helpers.ts";

function pair(): { a: CrdtDoc; b: CrdtDoc } {
  const [a, b] = twoReplicasOf(SAMPLE);
  return { a, b };
}

test("the authority writes a setting and who set it in one update, and a peer reads both", () => {
  const { a, b } = pair();
  const seen: unknown[] = [];
  a.subscribe((_update, origin) => seen.push(origin));
  scriptSettings(a).set("script.paper", "a4", {
    userId: "priya",
    setAt: 5,
    replaced: null,
  });
  scriptSettings(a).set("script.paper", "letter", {
    userId: "dana",
    setAt: 9,
    replaced: "a4",
  });
  expect(seen).toEqual([ORIGIN_SYSTEM, ORIGIN_SYSTEM]);
  b.applyUpdate(a.diff(b.encodeStateVector()));
  expect(scriptSettings(b).entries()).toEqual({ "script.paper": "letter" });
  expect(scriptSettings(b).meta("script.paper")).toEqual({
    userId: "dana",
    setAt: 9,
    replaced: "a4",
  });
  expect(scriptSettings(b).meta("nope")).toBeNull();
  expect(scriptBody(b).materialize()).toEqual(scriptBody(a).materialize());
});

test("every setting is listed, keys in ascending order", () => {
  const { a } = pair();
  const meta = { userId: "sam", setAt: 1, replaced: null };
  scriptSettings(a).set("script.title", "Salt", meta);
  scriptSettings(a).set("script.paper", "a4", meta);
  expect(Object.keys(scriptSettings(a).entries())).toEqual([
    "script.paper",
    "script.title",
  ]);
});

test("a change to settings is reported as a map, not as blocks", () => {
  const { a, b } = pair();
  const report = applyInspecting(
    b,
    capture(a, () =>
      scriptSettings(a).set("script.paper", "a4", {
        userId: "priya",
        setAt: 5,
        replaced: null,
      }),
    ),
  )!;
  expect(report.maps).toEqual(["settings", "settingsMeta"]);
  expect(report.touched()).toEqual([]);
});

test("a record of who set a setting that is not one reads as none", () => {
  const raw = new Y.Doc();
  const stored = raw.getMap<unknown>("settingsMeta");
  stored.set("not_an_object", "dana");
  stored.set("no_replaced", { userId: "dana", setAt: 1 });
  stored.set("userid_not_text", { userId: 5, setAt: 1, replaced: null });
  stored.set("setat_not_number", {
    userId: "dana",
    setAt: "1",
    replaced: null,
  });
  const view = scriptSettings(loadDoc(Y.encodeStateAsUpdate(raw)));
  expect([...stored.keys()].toSorted().map((key) => view.meta(key))).toEqual([
    null,
    null,
    null,
    null,
  ]);
});
