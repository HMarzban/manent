import { expect, test } from "bun:test";
import type { CommandService, CommandState } from "@manent/commands";
import { dedupedService } from "../src/desktop/deduped-service.ts";

const STATE: CommandState = {
  enabled: true,
  visible: true,
  checked: null,
  label: "Commands",
  keys: [],
  whyNot: null,
};

function serviceRecording(ran: string[]): CommandService {
  return {
    run(id, source) {
      ran.push(`${id}:${source}`);
      return "ran";
    },
    state: () => STATE,
    subscribe: () => () => {},
  };
}

test("one key press that reaches both the page and the menu runs once", () => {
  let t = 0;
  const ran: string[] = [];
  const s = dedupedService(serviceRecording(ran), () => t);
  t = 0;
  s.run("app.palette", "key");
  t = 40;
  s.run("app.palette", "native_menu");
  t = 300;
  s.run("app.palette", "native_menu");
  t = 1000;
  s.run("app.palette", "native_menu");
  t = 1050;
  s.run("app.palette", "key");
  expect(ran).toEqual([
    "app.palette:key",
    "app.palette:native_menu",
    "app.palette:native_menu",
  ]);
});

test("a press dropped as the menu's echo answers as run, and other commands and sources pass", () => {
  let t = 0;
  const ran: string[] = [];
  const s = dedupedService(serviceRecording(ran), () => t);
  const answers = [
    s.run("app.palette", "key"),
    s.run("app.goTo", "native_menu"),
    s.run("app.palette", "palette"),
    s.run("app.palette", "key"),
  ];
  t = 99;
  answers.push(s.run("app.palette", "native_menu"));
  t = 100;
  answers.push(s.run("app.goTo", "key"));
  expect([answers, ran]).toEqual([
    ["ran", "ran", "ran", "ran", "ran", "ran"],
    [
      "app.palette:key",
      "app.goTo:native_menu",
      "app.palette:palette",
      "app.palette:key",
      "app.goTo:key",
    ],
  ]);
});
