import { expect, test } from "bun:test";
import { SURFACE_IDS } from "@manent/commands";
import { SURFACES } from "../src/index.ts";

test("the catalogue lists every surface once, with where focus goes", () => {
  expect(SURFACES.map((s) => s.id).toSorted()).toEqual(
    [...SURFACE_IDS].toSorted(),
  );
  expect(SURFACES.find((s) => s.id === "preferences")).toMatchObject({
    kind: "screen",
    focusOnOpen: "search",
  });
  expect(SURFACES.find((s) => s.id === "palette")).toMatchObject({
    kind: "popover",
    openedBy: ["app.palette", "app.goTo"],
    focusOnClose: "opener",
  });
  expect(SURFACES.find((s) => s.id === "send")).toMatchObject({
    kind: "screen",
    focusOnOpen: "heading",
    focusOnClose: "previous_place",
  });
  expect(SURFACES.find((s) => s.id === "consequence_dialog")).toMatchObject({
    kind: "dialog",
    focusOnOpen: "cancel",
    focusOnClose: "opener",
  });
});

test("a surface is opened by exactly the commands that name it", () => {
  expect(SURFACES.find((s) => s.id === "side_panel")?.openedBy).toEqual([
    "view.sidePanel",
    "history.open",
    "doc.scriptSettings",
    "demo.tour",
  ]);
  expect(SURFACES.find((s) => s.id === "document")?.openedBy).toEqual([]);
});
