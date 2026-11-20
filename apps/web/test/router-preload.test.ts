import { withDom } from "@manent/testkit/dom";
import { expect, mock, test } from "bun:test";
import { createPersonStore } from "../src/state/person.store.ts";
import { fakeApi } from "./services.fixtures.ts";

withDom();

/** How many times each part's code was asked for. */
const asked = { controls: 0, palette: 0 };
mock.module("../src/demo/demo-bar-controls.tsx", () => {
  asked.controls += 1;
  return { DemoBarControls: () => null };
});
mock.module("../src/shell/shell-palette.tsx", () => {
  asked.palette += 1;
  return { ShellPalette: () => null };
});

test("the demo bar's controls and the palette begin to load when the router is made, while the server that served the page still answers", async () => {
  const { createAppRouter } = await import("../src/router.tsx");
  const before = { ...asked };
  createAppRouter({
    api: fakeApi(),
    fetch,
    usePerson: createPersonStore(null),
  });
  // nothing here draws either part: only the router can have asked for their code
  await new Promise((resolve) => setImmediate(resolve));
  expect([before, asked]).toEqual([
    { controls: 0, palette: 0 },
    { controls: 1, palette: 1 },
  ]);
});
