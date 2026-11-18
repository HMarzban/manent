import { expect, test } from "bun:test";
import { sectionize } from "@manent/schema";
import { measureDoc, scriptDocFromJSON } from "../src/index.ts";
import { ID_A, ID_B, ID_C, block } from "./helpers.ts";

test("measuring counts what the budget reads", () => {
  const d = scriptDocFromJSON(
    sectionize([block(ID_A, "é🎬"), block(ID_B, "ab"), block(ID_C, "")], 2),
    { clientId: 9 },
  );
  expect(measureDoc(d)).toEqual({
    liveBytes: d.encodeState().byteLength,
    plainBytes: 8,
    clientIds: 1,
    largestSection: 2,
  }); // é 2 + 🎬 4 + ab 2
});
