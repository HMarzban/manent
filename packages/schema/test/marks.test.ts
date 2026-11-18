import { expect, test } from "bun:test";
import { isMarkName, isSafeHref, schema } from "../src/index.ts";

test("a guard is the one way a closed list is searched", () => {
  expect(["bold", "suggest_delete", "blink", null].map(isMarkName)).toEqual([
    true,
    true,
    false,
    false,
  ]);
});

test("a link never renders a script address", () => {
  expect(isSafeHref("https://example.com")).toBe(true);
  for (const href of [
    "javascript:alert(1)",
    " JavaScript:alert(1)",
    "tel:+15551234",
    "data:text/html,x",
  ])
    expect(isSafeHref(href)).toBe(false);
  const dom = schema.marks.link.spec.toDOM!(
    schema.marks.link.create({ href: "javascript:alert(1)" }),
    true,
  ) as readonly unknown[];
  expect(dom[1]).not.toHaveProperty("href");
});
