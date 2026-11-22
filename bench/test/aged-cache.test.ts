import { afterAll, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { measureDoc, scriptDocFromJSON } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { createRng } from "@manent/demo";
import { createTempTrees } from "@manent/testkit";
import { cached } from "../corpus/cache.ts";
import { reuseDaily } from "../corpus/daily.ts";
import { documentOfPages } from "../corpus/documents.ts";
import { CORPUS_VERSION } from "../corpus/version.ts";
import { ageScript, ageSession } from "../crdt/aged.ts";

const trees = createTempTrees("manent-corpus-cache-");
afterAll(() => trees.removeAll());

test("a reused daily document keeps growing while its text stays one day long", () => {
  const d10 = measureDoc(
    reuseDaily({
      pages: 3,
      days: 10,
      sessionsPerDay: 2,
      editsPerSession: 5,
      seed: 3,
    }),
  );
  const d20 = measureDoc(
    reuseDaily({
      pages: 3,
      days: 20,
      sessionsPerDay: 2,
      editsPerSession: 5,
      seed: 3,
    }),
  );
  expect(d20.liveBytes).toBeGreaterThan(d10.liveBytes);
  expect(
    Math.abs(d20.plainBytes - d10.plainBytes) / d10.plainBytes,
  ).toBeLessThan(0.2);
  expect(d20.clientIds).toBe(1 + 20 * 2 + 20); // the first writer, each session, and each day's new script
});

test("a session writes under its own client id and leaves the document it was given as it was", () => {
  const script = scriptDocFromJSON(
    documentOfPages({
      format: "screenplay",
      pages: 2,
      seed: 1,
      sections: "even",
    }).doc,
    { clientId: 1 },
  );
  const before = script.encodeState();
  const aged = ageSession(script, {
    clientId: 9,
    edits: 6,
    random: createRng(5).next,
  });
  expect([aged.clientId, measureDoc(aged).clientIds]).toEqual([9, 2]);
  expect(script.encodeState()).toEqual(before);
  expect(aged.encodeState()).not.toEqual(before);
});

test("a cached document loads back byte for byte, and a new corpus version builds it again", async () => {
  const dir = await trees.tree({});
  let builds = 0;
  const build = (): CrdtDoc => {
    builds += 1;
    return ageScript({ pages: 2, sessions: 3, editsPerSession: 4, seed: 3 });
  };
  const built = cached("aged-2", build, dir);
  const loaded = cached("aged-2", build, dir);
  expect(builds).toBe(1);
  expect(loaded.encodeState()).toEqual(built.encodeState());
  expect(readdirSync(dir)).toEqual([`aged-2-v${CORPUS_VERSION}.bin`]);

  const stale = await trees.tree({
    [`aged-2-v${CORPUS_VERSION - 1}.bin`]: "a file of an older corpus",
  });
  expect(cached("aged-2", build, stale).encodeState()).toEqual(
    built.encodeState(),
  );
  expect(builds).toBe(2);
});

test("a cache key that is not a plain file name is refused", async () => {
  const dir = await trees.tree({});
  for (const key of ["../aged", "a/b", "", ".hidden"])
    expect(() =>
      cached(
        key,
        () => ageScript({ pages: 1, sessions: 0, editsPerSession: 1, seed: 1 }),
        dir,
      ),
    ).toThrow(RangeError);
  expect(readdirSync(dir)).toEqual([]);
});
