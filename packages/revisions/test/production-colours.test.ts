import { expect, test } from "bun:test";
import {
  COLOUR_NAMES,
  COLOUR_ORDERS,
  REVISION_COLOURS,
  colourOrderText,
  formatMemoDate,
  formatRevisionDate,
  memoText,
  pageList,
  paperRgb,
  recallMemo,
  revisionColour,
  revisionHeader,
  revisionName,
} from "../src/index.ts";

const S = COLOUR_ORDERS.standard;
test("the standard order runs White to Cherry, then Second Blue", () => {
  expect(S).toEqual([
    "white",
    "blue",
    "pink",
    "yellow",
    "green",
    "goldenrod",
    "buff",
    "salmon",
    "cherry",
  ]);
  expect(COLOUR_ORDERS.extended).toEqual([...S, "tan"]);
  expect([0, 1, 2, 8, 9, 10, 17].map((n) => revisionName(S, n))).toEqual([
    "White",
    "Blue",
    "Pink",
    "Cherry",
    "Second Blue",
    "Second Pink",
    "Third Blue",
  ]);
  expect([0, 9, 17].map((n) => revisionColour(S, n))).toEqual([
    "white",
    "blue",
    "blue",
  ]);
  expect([9, 10].map((n) => revisionName(COLOUR_ORDERS.extended, n))).toEqual([
    "Tan",
    "Second Blue",
  ]);
  expect([73, 81, 89, 161, 169, 881].map((n) => revisionName(S, n))).toEqual([
    "Tenth Blue",
    "11th Blue",
    "12th Blue",
    "21st Blue",
    "22nd Blue",
    "111th Blue",
  ]);
});
test("dates, headers and memos read as a coordinator writes them", () => {
  expect([
    formatRevisionDate("2026-11-16"),
    formatMemoDate("2026-11-17"),
    revisionHeader("Blue", "2026-11-16"),
    revisionHeader("Second Blue", "2027-01-04"),
  ]).toEqual([
    "16 Nov 2026",
    "17 Nov",
    "Blue Rev. (16 Nov 2026)",
    "Second Blue Rev. (4 Jan 2027)",
  ]);
  expect([
    memoText("Pink", "2026-11-17", ["3", "9", "17", "17A", "21", "21A", "21B"]),
    memoText("Blue", "2026-11-16", ["12"]),
  ]).toEqual([
    "Pink revisions 17 Nov: pp. 3, 9, 17, 17A, 21, 21A, 21B",
    "Blue revisions 16 Nov: p. 12",
  ]);
  expect([
    recallMemo("Blue", "2026-11-17", ["17", "21A"], "2026-11-16"),
    recallMemo("Blue", "2026-11-17", ["9"], "2026-11-16"),
    revisionHeader("Blue (corrected)", "2026-11-17"),
  ]).toEqual([
    "Blue (corrected), 17 Nov. Replaces pp. 17 and 21A of Blue as issued on 16 Nov. Corrected: ",
    "Blue (corrected), 17 Nov. Replaces p. 9 of Blue as issued on 16 Nov. Corrected: ",
    "Blue (corrected) Rev. (17 Nov 2026)",
  ]);
  expect([
    pageList(["3"]),
    pageList(["17", "21A"]),
    pageList(["3", "9", "17"]),
    colourOrderText(COLOUR_ORDERS.extended),
  ]).toEqual([
    "p. 3",
    "pp. 17 and 21A",
    "pp. 3, 9 and 17",
    "White → Blue → Pink → Yellow → Green → Goldenrod → Buff → Salmon → Cherry → Tan",
  ]);
  expect(() => formatRevisionDate("16/11/2026")).toThrow(RangeError);
});
test("every paper has the print colour of its sheet", () => {
  expect(
    REVISION_COLOURS.map((c) => [c, COLOUR_NAMES[c], paperRgb(c)]),
  ).toEqual([
    ["white", "White", [255, 255, 255]],
    ["blue", "Blue", [211, 230, 250]],
    ["pink", "Pink", [250, 215, 227]],
    ["yellow", "Yellow", [251, 243, 185]],
    ["green", "Green", [213, 237, 208]],
    ["goldenrod", "Goldenrod", [244, 216, 143]],
    ["buff", "Buff", [239, 223, 189]],
    ["salmon", "Salmon", [248, 200, 180]],
    ["cherry", "Cherry", [243, 177, 184]],
    ["tan", "Tan", [220, 199, 166]],
  ]);
});
test("an impossible day, ordinal, order or page list is refused", () => {
  for (const day of ["2026-02-29", "2026-13-01", "2026-04-31", "2026-11-00"]) {
    expect(() => formatMemoDate(day)).toThrow(RangeError);
  }
  expect(formatRevisionDate("2028-02-29")).toBe("29 Feb 2028");
  for (const ordinal of [-1, 1.5]) {
    expect(() => revisionName(S, ordinal)).toThrow(RangeError);
  }
  expect(() => revisionColour(["white"], 1)).toThrow(RangeError);
  expect(() => pageList([])).toThrow(RangeError);
  expect(() => memoText("Pink", "2026-11-17", [])).toThrow(RangeError);
});
