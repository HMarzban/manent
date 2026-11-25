import { expect, test } from "bun:test";
import {
  DEFAULT_LAYOUT_SETTINGS,
  ENGINE_VERSION,
  engineFor,
  profileFromSettings,
  readLayoutSettings,
} from "../src/index.ts";

test("a script's settings become its page profile", () => {
  const v1 = engineFor(ENGINE_VERSION)!;
  expect(
    profileFromSettings(v1, {
      format: "stage_play",
      paper: "a4",
      linesPerPage: null,
      moresAtBreaks: false,
      sameSpeakerContd: true,
      sceneContinued: true,
      scenesNumbered: true,
      sceneNumberSides: null,
    })!.key,
  ).toBe(
    v1.profileFor("stage_play", {
      paper: "a4",
      speechContinued: false,
      speakerContinued: true,
      sceneContinued: true,
      scenesNumbered: true,
    })!.key,
  );
  expect(
    profileFromSettings(v1, { ...DEFAULT_LAYOUT_SETTINGS, format: "ink" }),
  ).toBeNull();
});

test("a missing or ill-typed setting reads as its default", () => {
  expect(
    readLayoutSettings(
      (key) => ({ "script.paper": "a4", "script.sceneContinued": "yes" })[key],
    ),
  ).toEqual({ ...DEFAULT_LAYOUT_SETTINGS, paper: "a4" });
});

test("a paper the engine does not know is laid out on letter", () => {
  const v1 = engineFor(ENGINE_VERSION)!;
  expect(
    profileFromSettings(v1, { ...DEFAULT_LAYOUT_SETTINGS, paper: "legal" })!
      .paper,
  ).toBe("letter");
});
