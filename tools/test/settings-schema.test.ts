import { expect, test } from "bun:test";
import { FORMATS } from "@manent/schema";
import { SETTINGS } from "@manent/settings";

test("the format choices are the schema's formats", () => {
  expect(
    SETTINGS.get("script.format").type.choices!.map((c) => c.value),
  ).toEqual([...FORMATS]);
});
