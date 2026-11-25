import { expect, test } from "bun:test";
import { DEFAULT_LAYOUT_SETTINGS } from "@manent/pagination";
import { SETTINGS } from "@manent/settings";

const value = (key: string) =>
  SETTINGS.byScope("script").find((d) => d.key === key)!.default;

test("the layout defaults are the settings' own", () => {
  expect<unknown>(DEFAULT_LAYOUT_SETTINGS).toEqual({
    format: value("script.format"),
    paper: value("script.paper"),
    linesPerPage: value("script.linesPerPage"),
    moresAtBreaks: value("script.moresAtBreaks"),
    sameSpeakerContd: value("script.sameSpeakerContd"),
    sceneContinued: value("script.sceneContinued"),
    scenesNumbered: false,
    sceneNumberSides: null,
  });
});
