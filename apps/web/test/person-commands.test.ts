import { expect, test } from "bun:test";
import { INITIAL_SHELL_STATE } from "../src/services/ports.ts";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import { rulerActions } from "../src/state/ruler.store.ts";
import { testEnvironment, testServices } from "./services.fixtures.ts";

bindGuard(createGuard({ flavour: "test" }));

function openAt(docId: string) {
  const environment = testEnvironment();
  const services = testServices({ userId: "leo", environment });
  const showing = (shown: string, spaceBeforeSet: boolean): void =>
    environment.shellState.set({
      ...INITIAL_SHELL_STATE,
      screen: "document",
      docId: shown,
      spaceBeforeSet,
    });
  showing(docId, false);
  return { services, showing };
}

test("a command knows the open script's format, whether the Ruler shows and whether the caret block has its own space before", () => {
  const { services, showing } = openAt("d1");
  const { commands } = services;
  const ruler = () => {
    const { enabled, checked, whyNot } = commands.state("view.ruler");
    return { enabled, checked, whyNot };
  };
  services.openScriptStore("d1").set("script.format", "ink");
  const inInk = ruler();
  services.openScriptStore("d1").set("script.format", "stage_play");
  rulerActions.set(true);
  const shown = ruler();
  rulerActions.set(false);
  showing("d1", true);
  expect([inInk, shown, commands.state("format.spaceBefore").checked]).toEqual([
    {
      enabled: false,
      checked: false,
      whyNot: "isn't part of the Ink format",
    },
    { enabled: true, checked: true, whyNot: null },
    true,
  ]);
  services.dispose();
});

test("the commands look again when the open script's format or the Ruler changes, and stop hearing both once disposed", () => {
  const { services, showing } = openAt("d1");
  let heard = 0;
  services.commands.subscribe(() => heard++);
  const counts: number[] = [];
  const after = (change: () => void): void => {
    const before = heard;
    change();
    counts.push(heard - before);
  };
  after(() => services.openScriptStore("d1").set("script.format", "game"));
  after(() => rulerActions.toggle());
  showing("d2", false);
  after(() => services.openScriptStore("d1").set("script.format", "ink"));
  after(() => services.openScriptStore("d2").set("script.format", "ink"));
  services.dispose();
  after(() => rulerActions.toggle());
  after(() => services.openScriptStore("d2").set("script.format", "game"));
  expect(counts).toEqual([1, 1, 0, 1, 0, 0]);
});
