import { expect, test } from "bun:test";
import {
  ROOT_TYPE_NAMES,
  rebuildDoc,
  revisedOverrides,
  scriptDocFromJSON,
} from "../src/index.ts";
import { SAMPLE } from "./helpers.ts";

test("a rebuild keeps the overrides map", () => {
  const source = scriptDocFromJSON(SAMPLE);
  revisedOverrides(source).set("s1:b1", "marked", "typing");
  const rebuilt = rebuildDoc(source, { clientId: 1 });
  if (!rebuilt.ok) throw new Error(rebuilt.code);
  expect([
    ROOT_TYPE_NAMES.includes("revisedOverrides"),
    revisedOverrides(rebuilt.doc).entries(),
  ]).toEqual([true, [["s1:b1", "marked"]]]);
});
