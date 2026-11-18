import { expect, test } from "bun:test";
import { COMMANDS } from "@manent/commands";
import { createHandlers } from "../src/handlers/index.ts";
import type { HandlerDeps } from "../src/handlers/index.ts";
import type { RoutePlace } from "../src/handlers/index.ts";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import { createPersonStore } from "../src/state/person.store.ts";
import {
  QUIET_DOM,
  createNavigation,
  fakeApi,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

bindGuard(createGuard({ flavour: "test" }));

function depsAt(place: RoutePlace): {
  deps: HandlerDeps;
  visited: string[];
} {
  const route = createNavigation(place);
  const environment = testEnvironment();
  return {
    deps: {
      services: testServices({ userId: "leo", environment }),
      api: fakeApi(),
      usePerson: createPersonStore(null),
      router: route.navigation,
      dom: QUIET_DOM,
      shellState: environment.shellState.get,
      frame: environment.frame,
      visitUndo: environment.visitUndo,
    },
    visited: route.visited,
  };
}

test("every command but the generated ones has a handler, and none reaches other people", () => {
  const { deps } = depsAt({ routeId: "/", href: "/", search: {} });
  const ids = COMMANDS.map((c) => c.id).filter(
    (id) => !id.startsWith("setting."),
  );
  expect(Object.keys(createHandlers(deps)).toSorted()).toEqual(ids.toSorted());
  expect(COMMANDS.filter((c) => c.reach === "others")).toEqual([]);
});

test("Preferences pressed inside Preferences goes back", () => {
  const { deps, visited } = depsAt({
    routeId: "/preferences/$pane",
    href: "/preferences/appearance?from=%2Fs%2Fabc",
    search: { from: "/s/abc" },
  });
  createHandlers(deps)["app.preferences"]();
  expect(visited).toEqual(["/s/abc"]);
});

test("Preferences opens at the last pane viewed and remembers where it was opened from", () => {
  const { deps, visited } = depsAt({
    routeId: "/s/$docId",
    href: "/s/abc?x=1",
    search: { x: 1 },
  });
  deps.services.lastPane.set("keyboard");
  createHandlers(deps)["app.preferences"]();
  expect(visited).toEqual(["/preferences/keyboard?from=%2Fs%2Fabc%3Fx%3D1"]);
  expect(deps.services.lastPane.get()).toBe("keyboard");
});

test("a message's own Undo puts back what it replaced once, and the message goes", () => {
  const { deps } = depsAt({ routeId: "/", href: "/", search: {} });
  const { messages, reverses } = deps.services;
  const undone: string[] = [];
  reverses.set("setting_changed", () => undone.push("paper"));
  messages.push({
    id: "setting_changed",
    text: "Paper size is now A4.",
    actions: [{ label: "Undo", commandId: "settings.undo" }],
    lifetime: "reverse",
    ownWork: false,
  });
  const handlers = createHandlers(deps);
  handlers["settings.undo"]();
  expect(undone).toEqual(["paper"]);
  expect(messages.current()).toBeNull();
  expect(reverses.run("setting_changed")).toBe(false);
});
