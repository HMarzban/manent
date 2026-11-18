import { withDom } from "../src/dom.ts";
import { expect, test } from "bun:test";

withDom();

test("a file that asks for a DOM has one", () => {
  const div = document.createElement("div");
  div.textContent = "x";
  expect(div.outerHTML).toBe("<div>x</div>");
});
