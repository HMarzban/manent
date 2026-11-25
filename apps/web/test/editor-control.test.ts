import { expect, test } from "bun:test";
import type { SavedPlace } from "@manent/editor";
import { createEditorControl } from "../src/editor-host/control.ts";
import { keepPlace } from "../src/editor-host/keep-place.ts";
import type { PlaceStore } from "../src/editor-host/place.ts";

test("a command reaches the open editor, and nothing when none is open", () => {
  const control = createEditorControl();
  const seen: unknown[] = [];
  expect(control.run("format.pageBreak")).toBeNull();
  const detach = control.attach({
    run: (id) => (seen.push(id), { ok: true }),
    zoomPercent: () => 125,
    showTitlePage: () => {},
  });
  expect([control.run("edit.undo"), seen]).toEqual([
    { ok: true },
    ["edit.undo"],
  ]);
  detach();
  expect(control.run("edit.undo")).toBeNull();
});

test("the zoom the open page is drawn at is known, and nothing when none is open or it is Ink", () => {
  const control = createEditorControl();
  const before = control.zoomPercent();
  const detach = control.attach({
    run: () => ({ ok: true }),
    zoomPercent: () => 125,
    showTitlePage: () => {},
  });
  const drawn = control.zoomPercent();
  detach();
  control.attach({
    run: () => ({ ok: true }),
    zoomPercent: () => null,
    showTitlePage: () => {},
  });
  expect([before, drawn, control.zoomPercent()]).toEqual([null, 125, null]);
});

test("keepPlace skips initial restore when restore=false while still saving on stop", () => {
  const saved = new Map<string, SavedPlace>();
  const store = {
    place: (id: string) => saved.get(id) ?? null,
    savePlace: (id: string, place: SavedPlace) => {
      saved.set(id, place);
    },
  } as unknown as PlaceStore;
  const savedPlace: SavedPlace = {
    anchor: { blockId: "saved-b", offset: 3 },
    head: { blockId: "saved-b", offset: 3 },
    top: { blockId: "saved-b", offsetPx: 0 },
  };
  const atPlace: SavedPlace = {
    anchor: { blockId: "at-b", offset: 0 },
    head: { blockId: "at-b", offset: 0 },
    top: { blockId: "at-b", offsetPx: 0 },
  };
  store.savePlace("d1", savedPlace);
  const restored: string[] = [];
  const kept = keepPlace(
    store,
    "d1",
    () => ({
      place: () => atPlace,
      restore: (place) => restored.push(place.anchor.blockId),
    }),
    false,
  );
  kept.stop();
  expect([restored, store.place("d1")?.anchor.blockId ?? null]).toEqual([
    [],
    "at-b",
  ]);
});
