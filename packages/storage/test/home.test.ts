import { expect, test } from "bun:test";
import fc from "fast-check";
import type { Home } from "../src/index.ts";
import { crc32, homeKey, parseHome, sha256 } from "../src/index.ts";

const PROJECT = "0b9f3c1e-6d2a-4e8b-9f1a-2c3d4e5f6a7b";

test("a home is written one way and read back", () => {
  expect(homeKey({ kind: "project", id: PROJECT })).toBe(`project:${PROJECT}`);
  expect(parseHome("user:dana")).toEqual({ kind: "user", id: "dana" });
  for (const bad of [
    "project:NOT-A-UUID",
    `project:${PROJECT.toUpperCase()}`,
    "user:",
    "user:../x",
    "user:a b",
    `team:${PROJECT}`,
    "",
    "user:" + "a".repeat(65),
  ])
    expect(parseHome(bad)).toBeNull();
});

test("the checksums are the standard ones", () => {
  expect(crc32(new Uint8Array([1, 2, 3]))).toBe(1438416925);
  expect(Buffer.from(sha256(new Uint8Array([1, 2, 3]))).toString("hex")).toBe(
    "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
  );
});

const chars = (text: string) => fc.constantFrom(...text.split(""));
const hex = (length: number) =>
  fc.string({
    unit: chars("0123456789abcdef"),
    minLength: length,
    maxLength: length,
  });
const uuid = fc
  .tuple(hex(8), hex(4), hex(4), hex(4), hex(12))
  .map((parts) => parts.join("-"));
const userId = fc.string({
  unit: chars("ABCXYZabcxyz0189_-"),
  minLength: 1,
  maxLength: 64,
});
const home: fc.Arbitrary<Home> = fc.oneof(
  uuid.map((id) => ({ kind: "project" as const, id })),
  userId.map((id) => ({ kind: "user" as const, id })),
);
// near-valid keys: a home's key with something appended, cased differently, or cut short
const nearKey = fc.oneof(
  fc
    .tuple(home, fc.string({ maxLength: 3 }))
    .map(([h, tail]) => homeKey(h) + tail),
  home.map((h) => `${h.kind}:${h.id.toUpperCase()}`),
  fc.tuple(home, fc.nat(8)).map(([h, cut]) => homeKey(h).slice(0, -cut - 1)),
  fc.string(),
);

test("a well-formed home survives its key, and a key reads only as the home that writes it", () => {
  fc.assert(
    fc.property(home, (h) => {
      expect(parseHome(homeKey(h))).toEqual(h);
    }),
    { numRuns: 500 },
  );
  fc.assert(
    fc.property(nearKey, (key) => {
      const parsed = parseHome(key);
      if (parsed !== null) expect(homeKey(parsed)).toBe(key);
    }),
    { numRuns: 1000 },
  );
});
