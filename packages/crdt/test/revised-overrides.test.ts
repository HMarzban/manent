import { expect, test } from "bun:test";
import * as Y from "yjs";
import {
  ORIGIN_REMOTE,
  createDoc,
  revisedOverrides,
  scriptDocFromJSON,
} from "../src/index.ts";
import type { CrdtDoc } from "../src/index.ts";
import { SAMPLE } from "./helpers.ts";

const TYPING = "typing";
const B1 = "s1:b1";
const B2 = "s1:b2";

/** Each replica holds what the other has written. */
function exchange(a: CrdtDoc, b: CrdtDoc): void {
  const fromA = a.diff(b.encodeStateVector());
  const fromB = b.diff(a.encodeStateVector());
  b.applyUpdate(fromA);
  a.applyUpdate(fromB);
}

test("an override is written, read and removed", () => {
  const overrides = revisedOverrides(scriptDocFromJSON(SAMPLE));
  overrides.set(B1, "marked", TYPING);
  expect([overrides.get(B1), overrides.entries()]).toEqual([
    "marked",
    [[B1, "marked"]],
  ]);
  overrides.set(B1, null, TYPING);
  expect([overrides.get(B1), overrides.entries()]).toEqual([null, []]);
});

test("two replicas end with the later write of each key", () => {
  const a = createDoc({ clientId: 1 });
  const b = createDoc({ clientId: 2 });
  revisedOverrides(a).set(B1, "marked", TYPING);
  revisedOverrides(b).set(B1, "cleared@0a1b2c3d", TYPING);
  revisedOverrides(b).set(B2, "marked", TYPING);
  exchange(a, b);
  const converged: [string, string][] = [
    [B1, "cleared@0a1b2c3d"],
    [B2, "marked"],
  ];
  expect([
    revisedOverrides(a).entries(),
    revisedOverrides(b).entries(),
  ]).toEqual([converged, converged]);
  revisedOverrides(a).set(B1, "marked", TYPING);
  exchange(a, b);
  expect(revisedOverrides(b).get(B1)).toBe("marked");
});

test("a value that is not a string reads as nothing", () => {
  const doc = scriptDocFromJSON(SAMPLE);
  const foreign = new Y.Doc();
  foreign.getMap("revisedOverrides").set(B1, 7);
  foreign.getMap("revisedOverrides").set(B2, "marked");
  doc.applyUpdate(Y.encodeStateAsUpdate(foreign));
  const overrides = revisedOverrides(doc);
  expect([overrides.get(B1), overrides.entries()]).toEqual([
    null,
    [[B2, "marked"]],
  ]);
});

test("a listener is told the keys each change wrote, and whether it came from another replica", () => {
  const a = createDoc({ clientId: 1 });
  const b = createDoc({ clientId: 2 });
  const told: [readonly string[], boolean][] = [];
  const stop = revisedOverrides(a).subscribe((keys, remote) =>
    told.push([keys, remote]),
  );
  revisedOverrides(a).set(B2, "marked", TYPING);
  revisedOverrides(b).set(B1, "marked", TYPING);
  a.applyUpdate(b.encodeState(), ORIGIN_REMOTE);
  stop();
  revisedOverrides(a).set(B1, null, TYPING);
  expect(told).toEqual([
    [[B2], false],
    [[B1], true],
  ]);
});
