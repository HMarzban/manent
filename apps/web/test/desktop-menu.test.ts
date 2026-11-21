import { expect, test } from "bun:test";
import type { MenuItemModel, MenuModel } from "@manent/commands";
import { createFakeClock } from "@manent/sync-client/testing";
import {
  NATIVE_MENU_PLATFORMS,
  createMenuSender,
  nativeMenus,
} from "../src/desktop/native-menu.ts";
import { fakeHost } from "./desktop.fixtures.ts";

const item = (
  id: string,
  label: string,
  more: Partial<MenuItemModel> = {},
): MenuItemModel => ({
  id,
  label,
  enabled: true,
  checked: null,
  keys: [],
  nativeRole: null,
  submenu: null,
  ...more,
});

test("native menus use the palette's labels, character for character", () => {
  const labels = [
    "New script",
    "Start a … from this…",
    "Name this draft…",
    "Check spelling as I type",
    "Show other people's cursors",
    "White page in dark theme",
    "Present to the room",
    "Move to cuts",
    "Who wrote this?",
    "Lock or unlock page numbers",
    "Open in browser",
  ];
  const model: MenuModel = {
    menu: "file",
    groups: [labels.map((label, i) => item(`a.b${i}`, label))],
  };
  expect(
    nativeMenus([model], "mac")[0]!.groups[0]!.map((each) => each.label),
  ).toEqual(labels);
});

test("a submenu reads as it does in the window's menu", () => {
  const model: MenuModel = {
    menu: "view",
    groups: [
      [
        item("view.ruler", "Ruler"),
        item("setting.appearance.theme.light", "Light", { submenu: "Theme" }),
        item("setting.appearance.theme.dark", "Dark", { submenu: "Theme" }),
      ],
    ],
  };
  expect(
    nativeMenus([model], "mac")[0]!.groups[0]!.map((i) => [i.label, i.submenu]),
  ).toEqual([
    ["Ruler", null],
    ["Light", "Theme"],
    ["Dark", "Theme"],
  ]);
});

const accel = (keys: string[]): string | null =>
  nativeMenus(
    [{ menu: "view", groups: [[item("a.b", "A", { keys })]] }],
    "mac",
  )[0]!.groups[0]![0]!.accelerator;

test("only Command or Control with one key becomes an accelerator", () => {
  expect([
    accel(["Mod+K"]),
    accel(["Mod+,"]),
    accel(["Mod+Shift+Z"]),
    accel(["Mod+Alt+1"]),
    accel(["F6"]),
    accel([]),
  ]).toEqual(["k", ",", null, null, null, null]);
  expect([
    accel(["F6", "Mod+/"]),
    accel(["Mod+["]),
    accel(["Mod+]"]),
    accel(["Mod+0"]),
    accel(["Mod+="]),
  ]).toEqual(["/", "[", "]", "0", null]);
});

test("a native item keeps the window's state, role and submenu, under the menu's own name", () => {
  const model: MenuModel = {
    menu: "edit",
    groups: [
      [
        item("edit.copy", "Copy", {
          enabled: false,
          checked: true,
          keys: ["Mod+C"],
          nativeRole: "copy",
          submenu: "Clipboard",
        }),
      ],
    ],
  };
  expect(nativeMenus([model], "windows")).toEqual([
    {
      menu: "edit",
      label: "Edit",
      groups: [
        [
          {
            id: "edit.copy",
            label: "Copy",
            enabled: false,
            checked: true,
            accelerator: "c",
            role: "copy",
            submenu: "Clipboard",
          },
        ],
      ],
    },
  ]);
});

test("Preferences sits in the Manent menu on macOS and in File on Windows", () => {
  const models: MenuModel[] = [
    { menu: "app", groups: [[item("app.preferences", "Preferences")]] },
    {
      menu: "file",
      groups: [
        [item("library.newScript", "New script")],
        [item("app.preferences", "Preferences")],
      ],
    },
    { menu: "help", groups: [] },
  ];
  const placed = (platform: "mac" | "windows") =>
    nativeMenus(models, platform).map((menu) => [
      menu.label,
      menu.groups.map((group) => group.map((each) => each.id)),
    ]);
  expect(placed("mac")).toEqual([
    ["Manent", [["app.preferences"]]],
    ["File", [["library.newScript"]]],
  ]);
  expect(placed("windows")).toEqual([
    ["File", [["library.newScript"], ["app.preferences"]]],
  ]);
});

test("a menu longer than the shell takes is cut at 64 groups of 64 items", () => {
  const group = Array.from({ length: 70 }, (_, i) => item(`a.b${i}`, "A"));
  const model: MenuModel = {
    menu: "file",
    groups: Array.from({ length: 70 }, () => group),
  };
  const { groups } = nativeMenus([model], "mac")[0]!;
  expect([groups.length, groups[63]!.length, groups[0]![63]!.id]).toEqual([
    64,
    64,
    "a.b63",
  ]);
});

test("native menus are drawn on macOS and Windows only", () => {
  expect(NATIVE_MENU_PLATFORMS).toEqual(["mac", "windows"]);
});

test("a menu is sent at most every 250 ms and only when it changed", () => {
  const fake = createFakeClock(0);
  const host = fakeHost();
  let label = "A";
  const sender = createMenuSender({
    host,
    models: () => [{ menu: "file", groups: [[item("a.b", label)]] }],
    clock: fake.clock,
  });
  const sentLabels = () =>
    host.sent.map((message) =>
      message.t === "menus" ? message.menus[0]!.groups[0]![0]!.label : null,
    );
  for (let i = 0; i < 10; i += 1) {
    label = `A${i}`;
    sender.changed();
    fake.advance(10);
  }
  fake.advance(150);
  expect(sentLabels()).toEqual(["A9"]);
  fake.advance(250);
  sender.changed();
  fake.advance(250);
  expect(sentLabels()).toEqual(["A9"]);
  label = "B";
  sender.changed();
  fake.advance(249);
  expect(sentLabels()).toEqual(["A9"]);
  fake.advance(1);
  expect(sentLabels()).toEqual(["A9", "B"]);
  label = "C";
  sender.changed();
  sender.stop();
  fake.advance(250);
  expect(sentLabels()).toEqual(["A9", "B"]);
});
