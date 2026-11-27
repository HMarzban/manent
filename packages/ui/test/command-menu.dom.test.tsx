import "@manent/testkit/dom";
import { COMMANDS } from "@manent/commands";
import { afterEach, expect, test } from "bun:test";
import {
  commandIconFor,
  isDestructiveCommand,
  submenuIconFor,
} from "../src/index.ts";

afterEach(() => {
  document.body.replaceChildren();
});

test("every command placed in an in-window or native menu has a semantic Lucide icon", () => {
  const missing: string[] = [];
  for (const command of COMMANDS) {
    if (command.menus.length === 0) continue;
    if (commandIconFor(command.id) === null) missing.push(command.id);
  }
  expect(missing).toEqual([]);
});

test("every CommandMenu submenu label maps to a semantic icon and destructive actions are marked", () => {
  for (const label of [
    "Zoom",
    "Theme",
    "Interface size",
    "Revision marks",
    "Writing",
    "Start a … from this…",
  ]) {
    expect(submenuIconFor(label)).not.toBeNull();
  }
  expect([
    isDestructiveCommand("doc.moveToTrash"),
    isDestructiveCommand("app.signOut"),
    isDestructiveCommand("rundown.deleteRows"),
    isDestructiveCommand("doc.rename"),
  ]).toEqual([true, true, true, false]);
});
