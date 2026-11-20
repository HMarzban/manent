import { afterAll, beforeEach, expect, test } from "bun:test";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { createTempTrees } from "@manent/testkit";
import type { NodeFile } from "../src/index.ts";
import { readNodeFile, removeNodeFile, writeNodeFile } from "../src/index.ts";

const trees = createTempTrees("manent-node-file-");
let root: string;

beforeEach(async () => {
  root = await trees.tree({});
});
afterAll(() => trees.removeAll());

const FILE: NodeFile = {
  pid: 4242,
  nodeUrl: "http://127.0.0.1:51234",
  launchToken: "3f1c9a",
  startedAt: 1_700_000_000_000,
  firstFrameAt: null,
};

test("the node file is private, whole, and read back exactly", () => {
  expect(readNodeFile(root)).toBeNull();
  writeNodeFile(root, FILE);
  expect(readNodeFile(root)).toEqual(FILE);
  writeNodeFile(root, { ...FILE, firstFrameAt: 1_700_000_000_740 });
  expect(readNodeFile(root)).toEqual({
    ...FILE,
    firstFrameAt: 1_700_000_000_740,
  });
  if (process.platform === "darwin" || process.platform === "linux")
    expect(statSync(join(root, "node.json")).mode & 0o777).toBe(0o600);
  const whole = readFileSync(join(root, "node.json"), "utf8");
  writeFileSync(join(root, "node.json"), whole.slice(0, whole.length - 2));
  expect(readNodeFile(root)).toBeNull();
  removeNodeFile(root);
  expect(readNodeFile(root)).toBeNull();
});

test("a node file with any field out of shape reads as nothing", () => {
  const broken: [keyof NodeFile, unknown][] = [
    ["pid", 0],
    ["pid", 1.5],
    ["nodeUrl", ""],
    ["nodeUrl", 7],
    ["launchToken", ""],
    ["launchToken", null],
    ["startedAt", -1],
    ["startedAt", "1"],
    ["firstFrameAt", 2.5],
    ["firstFrameAt", undefined],
  ];
  const read = broken.map(([field, value]) => {
    writeFileSync(
      join(root, "node.json"),
      JSON.stringify({ ...FILE, [field]: value }),
    );
    return readNodeFile(root);
  });
  expect(read).toEqual(broken.map(() => null));
});

test("whatever is written there reads back as a whole node file or as nothing", () => {
  const nodeFile = fc.record({
    pid: fc.integer({ min: 1, max: 4_194_304 }),
    nodeUrl: fc.webUrl(),
    launchToken: fc.string({ minLength: 1 }),
    startedAt: fc.nat(),
    firstFrameAt: fc.option(fc.nat(), { nil: null }),
  });
  const near = fc
    .tuple(
      nodeFile,
      fc.constantFrom<keyof NodeFile>(
        "pid",
        "nodeUrl",
        "launchToken",
        "startedAt",
        "firstFrameAt",
      ),
      fc.jsonValue(),
    )
    .map(([file, field, value]) => ({ ...file, [field]: value }));
  const outcomes = new Set<string>();
  fc.assert(
    fc.property(
      fc.oneof(nodeFile, near, fc.jsonValue()),
      (written: unknown) => {
        writeFileSync(join(root, "node.json"), JSON.stringify(written));
        const read = readNodeFile(root);
        outcomes.add(read === null ? "nothing" : "file");
        if (read === null) return true;
        expect(written).toMatchObject(read);
        writeNodeFile(root, read);
        expect(readNodeFile(root)).toEqual(read);
        return true;
      },
    ),
    { numRuns: 300 },
  );
  expect([...outcomes].toSorted()).toEqual(["file", "nothing"]);
});
