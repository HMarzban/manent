import { expect, test } from "bun:test";
import { COMMANDS } from "@manent/commands";
import { SETTINGS } from "@manent/settings";
import { searchPreferences } from "../src/screens/preferences/search-index.ts";

const deps = { registry: SETTINGS, commands: COMMANDS };

test("a search finds preferences by label, help text, value and synonym", () => {
  expect(searchPreferences("dark", deps).preferences).toEqual([
    "appearance.theme",
    "appearance.whitePage",
  ]);
  expect(searchPreferences("night mode", deps).preferences).toEqual([
    "appearance.theme",
  ]);
  expect(searchPreferences("line you are writing", deps).preferences).toEqual([
    "writing.typewriterScrolling",
  ]);
  expect(searchPreferences("  Night  MODE ", deps).preferences).toEqual([
    "appearance.theme",
  ]);
});

test("a search never ends in nothing", () => {
  expect(searchPreferences("paper", deps)).toMatchObject({
    preferences: [],
    elsewhere: [{ label: "Paper size" }],
  });
  expect(
    searchPreferences("autosave", deps).answers.map((a) => a.label),
  ).toEqual(["Auto-save"]);
  expect(
    ["backup", "font", "smart quotes", "reduce motion", "notifications"].map(
      (q) => searchPreferences(q, deps).answers.map((a) => a.label),
    ),
  ).toEqual([
    ["Backup"],
    ["Font"],
    ["Smart quotes"],
    ["Reduce motion"],
    ["Notifications"],
  ]);
  // no such command in this release; the screen then offers "Search all commands for …"
  expect(searchPreferences("dual", deps).commands).toEqual([]);
});

test("a search finds commands by label and synonym, but not the commands that set a preference", () => {
  expect(searchPreferences("timeline", deps).commands).toEqual([
    "history.open",
  ]);
  expect(searchPreferences("theme", deps).commands).toEqual([]);
});

test("an empty search finds nothing", () => {
  expect(searchPreferences(" ", deps)).toEqual({
    preferences: [],
    elsewhere: [],
    answers: [],
    commands: [],
  });
});
