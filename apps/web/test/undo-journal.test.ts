import { expect, test } from "bun:test";
import type { CommandContext } from "@manent/commands";
import { createValue } from "@manent/ui";
import type { RoutePlace } from "../src/handlers/index.ts";
import { INITIAL_SHELL_STATE } from "../src/services/ports.ts";
import type { PersonServices, ShellState } from "../src/services/ports.ts";
import {
  QUIET_DOM,
  createNavigation,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

const DOCUMENT: RoutePlace = {
  routeId: "/s/$docId",
  href: "/s/d1",
  search: {},
};
const SEND: RoutePlace = {
  routeId: "/s/$docId/send/$form",
  href: "/s/d1/send/export",
  search: {},
};
const PREFERENCES: RoutePlace = {
  routeId: "/preferences/$pane",
  href: "/preferences/writing",
  search: {},
};

/** The services at `place` with focus in `focus`, the open editor's actions recorded, and the Preferences undo counted. */
function at(
  place: RoutePlace,
  screen: ShellState["screen"],
  focus: CommandContext["focus"],
): { services: PersonServices; actions: unknown[]; visits: number[] } {
  const visits: number[] = [];
  const environment = testEnvironment({
    dom: { ...QUIET_DOM, focusKind: () => focus },
    shellState: createValue<ShellState>({
      ...INITIAL_SHELL_STATE,
      screen,
      docId: screen === "preferences" ? null : "d1",
    }),
    visitUndo: {
      current: {
        undo() {
          visits.push(1);
          return true;
        },
      },
    },
  });
  const services = testServices({
    userId: "leo",
    environment,
    router: createNavigation(place).navigation,
  });
  const actions: unknown[] = [];
  services.editor.attach({
    run(id) {
      actions.push(id);
      return { ok: true };
    },
    zoomPercent: () => 100,
  });
  return { services, actions, visits };
}

test("Undo from a panel undoes the person's last change in the open script", () => {
  const { services, actions, visits } = at(DOCUMENT, "document", "panel");
  expect([services.commands.run("edit.undo", "menu"), actions, visits]).toEqual(
    ["ran", ["edit.undo"], []],
  );
});

test("Redo from the status bar redoes in the open script", () => {
  const { services, actions } = at(DOCUMENT, "document", "other");
  expect([services.commands.run("edit.redo", "palette"), actions]).toEqual([
    "ran",
    ["edit.redo"],
  ]);
});

test("on a screen that hides the page, Undo never touches the script", () => {
  const send = at(SEND, "send", "other");
  const preferences = at(PREFERENCES, "preferences", "other");
  send.services.commands.run("edit.undo", "menu");
  send.services.commands.run("edit.redo", "menu");
  preferences.services.commands.run("edit.undo", "menu");
  preferences.services.commands.run("edit.redo", "menu");
  expect([
    send.actions,
    send.visits,
    preferences.actions,
    preferences.visits,
  ]).toEqual([[], [], [], [1]]);
});
