import { expect, test } from "bun:test";
import { DOC_KINDS, docIdV7, isDocId, isDocKind } from "../src/index.ts";

test("document kinds are a fixed list, and an ID is a canonical lower-case UUID", () => {
  expect(DOC_KINDS).toEqual([
    "script",
    "comments",
    "index",
    "rundown",
    "outline",
    "room_log",
    "private",
    "ink",
  ]);
  expect(["private", "draft", 7].map(isDocKind)).toEqual([true, false, false]);
  expect(
    [
      "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd",
      "01A1E81D-C6F2-7301-A0F6-5C345EB6C7CD",
      "01a1e81dc6f27301a0f65c345eb6c7cd",
      "",
      7,
    ].map(isDocId),
  ).toEqual([true, false, false, false, false]);
});

// 48 bits of time · version 7 and the first 12 random bits · variant 10 and the next 62 random bits (the low 6 bits of byte 2, then bytes 3–9)
test("a new ID is a version 7 UUID of its time and its random bytes", () => {
  expect(
    docIdV7(
      0x018f_0000_0000,
      new Uint8Array([0xab, 0xcd, 0xef, 1, 2, 3, 4, 5, 6, 7]),
    ),
  ).toBe("018f0000-0000-7abc-af01-020304050607");
  expect(() => docIdV7(0, new Uint8Array(9))).toThrow(RangeError);
  expect(() => docIdV7(2 ** 48, new Uint8Array(10))).toThrow(RangeError);
});
